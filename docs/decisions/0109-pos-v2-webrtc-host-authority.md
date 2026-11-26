# ADR 0109: POS v2 跨裝置協作 — 主機權威、WebRTC DataChannel 與自架信令

- 狀態: 已接受 (Accepted)
- 日期: 2026-11-26
- 相關議題: [Issue #16](https://github.com/raybird/plainvanillaweb/issues/16) · [Issue #10](https://github.com/raybird/plainvanillaweb/issues/10) · [Epic #8](https://github.com/raybird/plainvanillaweb/issues/8)
- 前置決策: [ADR 0107](./0107-sharedworker-and-cross-device-transport-evaluation.md) · [ADR 0108](./0108-solutions-reference-app-conventions.md)
- 協定規格: [POS v2 協定規格（草案）](../superpowers/plans/2026-11-26-pos-v2-protocol.md)

## 背景

第一代 Multi-Window POS（#10）只在同一台機器的同源分頁之間協作：權威狀態在 IndexedDB，互斥靠 IndexedDB transaction 與 Web Locks。#16 要讓店員裝置與顧客手機從其他裝置加入同一份訂單狀態。

ADR 0107 評估跨裝置傳輸後的結論是 Conditional Go：優先採用 Backend WebSocket Relay，WebRTC DataChannel 次之，並列出五項前置條件，其中第 2 項要求由外部後端負責認證與授權、由伺服器驗明 `sender`。

本專案有三個限制，決定了 #16 能怎麼做：

1. 前端部署在 GitHub Pages：只能放靜態檔案，不能執行伺服器程式。
2. 頁面以 https 載入，只能連 `wss://`，而且憑證要是手機信任的。在區網內用 `ws://` 或自簽憑證都不可行。
3. 專案不維護公開的信令服務（2026-11-26 決定）。測試的人自己架信令。

## 決策

### 1. 第一代保留，第二代另開獨立範例

第一代 `#/solutions/pos/*` 的路由、資料庫、行為與測試都不變。第二代是 `#/solutions/pos-v2/*`，有自己的 namespace（預設 `solution-pos-v2`）與資料庫。第二代可以匯入第一代的純函式（例如 `decideTransition`），修改共用模組時，第一代既有測試必須照常通過。

### 2. 星狀拓撲，主機是唯一的權威

- 管理頁的一個分頁是主機（每個 namespace 以 Web Lock 保證只有一個），持有權威狀態。其他管理分頁只能查看。
- 除了管理頁以外的角色都是遠端裝置：每台各自和主機建立一條 DataChannel，只做 RPC，不保存權威狀態。**即使和主機在同一台電腦上，也一樣走 DataChannel**，第二代只有一條資料路徑。
- 跨裝置的互斥由主機的 IndexedDB `readwrite` transaction 依序執行保證：兩個遠端廚房同時認領，實際上是主機上兩個依序執行的 transaction，結果和第一代相同。這不是分散式鎖，系統也不對外宣稱跨裝置有 Web Locks 等級的保證（ADR 0107 前置條件 1）。

### 3. 選 WebRTC DataChannel，不採用 ADR 0107 優先的 WebSocket Relay

Relay 會讓所有訂單與授權資料經過後端，後端必須上線、保存或至少轉送每一則業務訊息。在「不維護公開端點、由測試者自架」的前提下，信令服務越薄越好：

- 信令只負責握手（SDP／ICE），連線建立後訂單資料直接在裝置之間傳送，信令斷線也不影響已建立的連線。
- 授權資料（連線碼、入桌碼、各種 credential）只在 DataChannel 內傳送，信令伺服器看不到。

代價是 WebRTC 的 NAT 穿透：沒有 TURN 時，對稱型 NAT 或部分行動網路無法直連（見決策 7）。

### 4. 信令只提供自架：協定與兩份實作

- 協定版本 1，見協定規格第 3 節。
- 零依賴 Node 參考伺服器 `server/signaling.mjs`：單一檔案、不匯入任何本地模組，下載一個檔案就能執行。`--tunnel` 自動啟動 Cloudflare Quick Tunnel。本機開發與 CI 也用它。
- Cloudflare Worker＋Durable Object 版 `server/cloudflare/`，給測試者部署到自己的帳號，和 Node 版跑同一套協定測試。
- 主機頁在未設定信令時，依 `VERSION` 顯示 jsDelivr 固定版本網址的下載指令。只提供下載後執行，不提供 `curl | sh`。
- 伺服器檢查 `Origin` 白名單，限制訊息大小、速率與每個房間的連線數，並一律覆寫轉送訊息的 `from`（ADR 0107 前置條件 2 的 `sender` 部分）。

### 5. 信任模型：信令伺服器在信任範圍內，主機席位由第一個連上的主機綁定

這是 demo，而且信令只能自架：遠端裝置用的信令位址來自主機產生的 QR Code，伺服器由測試者自己架設。所以信令伺服器放在信任範圍內，DTLS 指紋經由它交換，不另外做端到端的主機驗證（2026-11-26 決定）。

- 主機第一次啟用時產生房間：`roomId`（128 bit 隨機值）與 `hostSecret`（256 bit 隨機值），存在 IndexedDB `vanilla_solution:<ns>:room`。
- **主機席位**：主機以 `hostSecret` 向信令伺服器認證。房間還沒有綁定時，伺服器記下它的雜湊（第一個連上的主機綁定房間）；之後只有同一組 secret 能取得主機席位。主機分頁重新整理時，新連線取代舊連線。
- 綁定在 Node 伺服器存於記憶體、重啟後清空；在 Worker 存於 Durable Object storage；房間連續 24 小時沒有主機連線時清除。
- **接受的風險**：綁定清空後到主機重新連上之前，任何知道 `roomId` 的人都能搶先綁定，而 `roomId` 印在公開的桌牌 QR Code 上。主機會自動重連，所以空窗很短。真的被搶走時，在管理頁「重新產生房間」（換一個 `roomId`）並重啟信令伺服器即可恢復。
- 「重設 demo 資料」保留房間，`roomId` 不變，已印出的桌牌 QR Code 仍然可用。只有「重新產生房間」才會換 `roomId`，執行前要使用者確認。
- 主機頁從網址參數拿到的信令位址，要使用者確認才儲存，不能讓任意連結替換掉測試者自己的信令。

### 6. 授權在主機上執行

這是和 ADR 0107 前置條件 2「由外部後端提供認證與授權」不同的地方：在星狀拓撲中，主機就是後端。

- 三種授權（店員裝置、入桌、訂單查詢）各自簽發、各自驗證，主機只保存 secret 的雜湊值。
- 每條 DataChannel 驗證後對應一個 principal。訂單去重以 `[principal, requestId]` 為鍵：重送只會取回同一個身分建立的訂單。
- 連線碼與入桌碼限制嘗試次數。連線碼只在 DataChannel 內驗證；輸入連線碼的裝置要先開啟店家入口（例如掃共用點餐首頁的 QR Code），才知道房間與信令位址。
- 遠端廚房站台的在線狀態由主機依 DataChannel 與心跳判斷，取代第一代的站台 Web Lock。接手時，判斷與寫入依序執行。

### 7. 不部署 TURN；`iceServers` 由信令伺服器提供

第一版以同一網段加 STUN 為主。`iceServers` 由信令伺服器的設定提供給主機與遠端裝置，架設者要用 TURN 時改自己伺服器的設定即可，前端不用改。直連失敗時，畫面明確顯示「所在網路可能需要 TURN」，不無限等待（ADR 0107 前置條件 3、4）。

### 8. 程式放在範例內，不進 `lib/`

主機 hub、信令 client、QR Code encoder 都放在 `components/pages/solutions/pos-v2/`，不承諾公開 API。`lib/webrtc-service.js` 維持 ADR 0107 的決定，不修改。等第二代穩定、出現第二個需要跨裝置的範例時，再評估把哪些部分移進 SDK。

## 後果

- **正面**：
  - 前端繼續放在 GitHub Pages；信令伺服器只保存房間與主機 secret 雜湊的綁定，訂單資料也不經過它，所以 Node 參考伺服器只要一個檔案，測試者照主機頁的指令就能架起來。
  - 主機重新整理後，房間（`roomId`）、授權與桌牌 QR Code 都不變，遠端裝置自動重連。
  - 授權資料不經過信令伺服器，信令伺服器只看得到握手資訊。
- **代價**：
  - 主機是單點：主機那台裝置關機或分頁關閉，所有遠端裝置都暫停，第一版只支援由原管理裝置恢復。
  - 沒有 TURN 時，部分網路環境無法使用。
  - 主機席位採「第一個連上的主機綁定」，在綁定清空到主機重連之間可能被搶走（決策 5）。
  - 「重新產生房間」會改變 `roomId`，所有 QR Code 和已配對的裝置都要重新設定。
  - 房間存在瀏覽器裡；清除網站資料就等於重新產生房間。
- **非目標**：
  - 多主機或主機移轉；
  - 公開的信令服務、TURN 基礎建設；
  - 遠端管理頁、付款、個資；
  - 修改 `lib/webrtc-service.js` 或 `BroadcastService` 的既有契約。
- **正式上線差距**：
  - 信令伺服器在信任範圍內：它看得到中繼資料與 ICE candidate 中的 IP，惡意的信令伺服器也能冒充主機。正式系統需要端到端驗證主機，例如由主機的身分金鑰推導房間 id，並簽署 DTLS 指紋；
  - 主機席位沒有持久的擁有者驗證，房間只存在單一瀏覽器，沒有備份與輪替機制；
  - 6 位數短碼只能靠嘗試次數限制防暴力猜測；
  - 沒有操作稽核；
  - 授權綁在瀏覽器的 localStorage，換裝置或清除資料就要重新配對。
