# Multi-Window POS v2：跨裝置協作與桌邊點餐

> **更新日期**：2026-11-27  
> **English**：[Multi-Window POS v2](./pos-v2.en.md)  
> **入口**：[#/solutions/pos-v2/admin](#/solutions/pos-v2/admin) · **Issue**：#16 · **決策**：[ADR 0109](../decisions/0109-pos-v2-webrtc-host-authority.md) · **協定**：[POS v2 協定規格](../superpowers/plans/2026-11-26-pos-v2-protocol.md)

第一代 [Multi-Window POS](./pos.md) 只在同一台電腦的分頁之間協作。第二代讓店員的平板、手機與顧客自己的手機，從其他裝置加入同一份訂單：管理頁的一個分頁是**主機**，訂單只存在主機的 IndexedDB；其他裝置經過自架的信令伺服器完成握手後，和主機建立 WebRTC DataChannel 直連，以 RPC 下單與操作。訂單與授權資料只在 DataChannel 內傳送，不經過信令伺服器。

這是展示用範例：**不處理真實付款，也不收集個資**。第一代保持不變，兩者的資料互不相通。

## 1. 操作方式

需要：一台電腦開主機頁（Chrome 或 Edge），店員裝置與顧客手機和主機在同一個 Wi-Fi（只用 STUN，不用 TURN），以及一個自架的信令伺服器（見下方「自架信令伺服器」）。

| 角色 | 路由 | 在哪裡開 |
| --- | --- | --- |
| 主機（管理） | `#/solutions/pos-v2/admin` | 店家的電腦；同一個 namespace 只有一個分頁是主機，其他分頁唯讀 |
| 店員配對 | `#/solutions/pos-v2/join` | 掃主機頁的配對 QR Code，或輸入連線碼 |
| 點餐、廚房、叫號 | `#/solutions/pos-v2/order`、`/kitchen`、`/display` | 配對核准後自動導過去；沿用第一代的畫面 |
| 店家入口 | `#/solutions/pos-v2/home` | 顧客掃店家入口 QR Code，選擇已開的桌 |
| 桌邊點餐 | `#/solutions/pos-v2/table?t=<桌號>` | 顧客掃桌牌 QR Code，輸入入桌碼後點餐 |
| 訂單查詢 | `#/solutions/pos-v2/track?o=…&k=…` | 顧客掃櫃檯點餐後顯示的訂單 QR Code，只看得到那一筆 |

遠端裝置的網址都帶有 `room`（房間）與 `sig`（信令網址），由主機頁產生的 QR Code 帶入，裝置不用另外設定。

一次完整流程：

1. 主機頁「信令伺服器」區塊貼上信令網址（`https://` 會自動轉成 `wss://`），按「連線測試」確認可用。網址帶 `sig=` 打開時，要按確認才會儲存。
2. 按「產生配對 QR Code」：店員裝置掃配對 QR Code（或在 `#/solutions/pos-v2/join` 輸入連線碼），主機核准並指定角色（點餐、廚房、叫號；廚房要填站台名稱）。
3. 「桌位」：開桌後顯示 6 位數入桌碼（只顯示這一次；重新整理後要「換新入桌碼」才看得到）。「桌牌 QR Code」可以列印，只印桌牌。
4. 顧客掃桌牌、輸入入桌碼後點餐；同桌的人共用同一組入桌碼。「我的訂單」顯示取餐號、進度與前面待備餐的筆數。
5. 廚房認領、備餐完成，叫號畫面顯示號碼，按「已取餐」結案。櫃檯點餐裝置送單後顯示訂單 QR Code，給沒有入桌的顧客查詢進度。
6. 用餐結束後「關桌」：舊入桌碼與已加入的頁面都不能再送單到下一個場次。

重設：「重設 demo 資料」只刪除訂單資料庫，**保留房間**，已印出的桌牌與 QR Code 網址照常可用；授權與桌位場次也在訂單資料庫裡，所以已配對的店員裝置要重新配對、桌位要重新開桌。「重新產生房間」會換掉房間與主機金鑰，所有 QR Code 與已配對的裝置都要重新設定，執行前會要求確認。加上 `?ns=<名稱>` 可以開一份獨立的資料。

### 自架信令伺服器

專案**不提供公共信令伺服器**，請擇一自架。主機頁未設定信令時會顯示下面兩組指令與複製按鈕，指令下載和頁面同版（`v3.4.0`）的檔案。只提供「下載後執行」，不提供 `curl | sh`：可以先打開檔案檢查再執行。

**方式一：Node＋Cloudflare Quick Tunnel**（需要 Node 22+ 與 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)，不需要帳號）

```bash
curl -fsSLO https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v3.4.0/server/signaling.mjs
node signaling.mjs --tunnel
```

`signaling.mjs` 是單一檔案、零依賴，放在空目錄就能執行。`--tunnel` 會啟動 Quick Tunnel 並印出帶 `sig=` 的主機頁連結；找不到 cloudflared 或抓不到網址時，印出手動步驟，信令伺服器照常在 `http://127.0.0.1:8787` 運作。Quick Tunnel 的網址每次啟動都不同，重新啟動後要在主機頁改設定，已配對的裝置也要重新掃碼：裝置的授權綁定配對（入桌）時的信令，網址帶了不同的信令時，店員裝置會先請使用者確認是否改用，顧客手機則要重新輸入入桌碼。

**方式二：自己的 Cloudflare Worker**（需要 Cloudflare 帳號，免費方案即可，以及 Node）

```bash
mkdir pos-v2-signaling && cd pos-v2-signaling
curl -fsSLO https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v3.4.0/server/cloudflare/worker.js
curl -fsSLO https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v3.4.0/server/cloudflare/wrangler.jsonc
npx wrangler@4 login
npx wrangler@4 deploy
```

部署後印出的 `https://pos-v2-signaling.<帳號>.workers.dev` 就是信令網址，貼到主機頁即可。網址固定，適合長期使用。Worker 以 Durable Object（SQLite 儲存，免費方案可用）保存房間的主機綁定，WebSocket 使用 Hibernation API。

**Origin 白名單**：信令伺服器只接受白名單內的 `Origin`，預設是 `https://raybird.github.io`、`http://localhost:*`、`http://127.0.0.1:*`。自己架設前端網站時，要把網站加進白名單：Node 版用 `--allow-origin <origin>`（可重複），Worker 版改 `wrangler.jsonc` 的 `ALLOWED_ORIGINS`。其他設定：`--ice-servers`／`ICE_SERVERS`（例如加上 TURN）、`--port`、`--host`、`--app-url`／`APP_URL`。

**檔案比對**（`v3.4.0` 的 SHA-256；下載後可用 `sha256sum <檔案>` 或 `shasum -a 256 <檔案>` 比對）：

| 檔案 | SHA-256 |
| --- | --- |
| `server/signaling.mjs` | `031ebad490fce671a1e4851e83037a6de68fecc8d215f91a427e3ba323ad3f2e` |
| `server/cloudflare/worker.js` | `284c76c8c8f5dcc3621240eaf2e251d44fa011b73412418034db029192854315` |
| `server/cloudflare/wrangler.jsonc` | `4ab58993fdbcb7cecc7e521d3bb141c6c64e0bf5b5ad89d2fc5936a3335c2a76` |

## 2. 架構

```text
 店員裝置（點餐／廚房／叫號）      顧客手機（桌邊點餐／查單）
        │  RemotePosSession             │  RemoteTableSession
        │  PeerLink ─ RPC client         │
        └──────── DataChannel（訂單、授權）────────┐
                                                  ▼
  自架信令（只轉送 SDP／ICE）◀──── 主機分頁：PosV2Host ─ PosV2Hub（授權、RPC、推送）
   signaling.mjs 或 Worker                         │ 寫入：PosV2Repository（單一 readwrite transaction）
                                                  ▼
                      IndexedDB  vanilla_solution:<ns>:orders  ← 唯一的權威狀態
                               vanilla_solution:<ns>:room    ← roomId、hostSecret
```

- **主機唯一**：管理頁以 Web Lock 保證每個 namespace 只有一個主機分頁；信令伺服器以 TOFU 綁定房間的主機席位（第一個以 `hostSecret` 連上的主機，綁定 24 小時沒有主機後清除）。
- **遠端裝置不保存權威狀態**：即使和主機在同一台電腦，也走 DataChannel。跨裝置的互斥由主機上依序執行的 IndexedDB transaction 保證，不是分散式鎖。
- **信令很薄**：只轉送握手訊息，不保存訂單。直連建立後，主機或裝置的信令斷線重連都不會拆掉已建立的直連；只有主機換了執行個體（主機分頁重新整理，`host-online` 帶來的執行個體 id 改變）時，裝置才立即重建直連。

| 檔案 | 用途 |
| --- | --- |
| `components/pages/solutions/pos-v2/pos-v2-model.js` | 授權種類、錯誤碼、送單與轉移的判斷（純函式；轉移沿用第一代 `decideTransition`） |
| `components/pages/solutions/pos-v2/pos-v2-repository.js` | 主機的 IndexedDB：訂單、桌位、場次、授權雜湊、配對票、房間 |
| `components/pages/solutions/pos-v2/pos-v2-hub.js` | 主機端 RPC：授權檢查、方法分派、主題推送（100 ms 內合併）、心跳、背壓、在線狀態 |
| `components/pages/solutions/pos-v2/pos-v2-host.js` | 主機的組裝：Web Lock、信令、每台裝置一條 PeerConnection、管理操作 |
| `components/pages/solutions/pos-v2/pos-v2-wire.js` | DataChannel 訊息格式與驗證 |
| `components/pages/solutions/pos-v2/signaling-client.js`、`peer-link.js` | 信令 client（重連退避）與 WebRTC 直連（逾時、重試、主機換執行個體時立即重連） |
| `components/pages/solutions/pos-v2/pos-v2-rpc-client.js`、`pos-v2-remote.js` | 遠端裝置的 RPC client 與「連到主機」的連線；本機授權與待確認送單的存放 |
| `components/pages/solutions/pos-v2/remote-pos-session.js` | 遠端工作階段：店員裝置與顧客，和第一代 `PosSession` 同一組介面 |
| `components/pages/solutions/pos-v2/remote-page.js` | 把第一代角色畫面接上遠端工作階段；連線狀態、QR Code、等待確認的送單 |
| `components/pages/solutions/pos-v2/PosV2*Page(s).js` | 主機頁、配對頁、店員角色頁、顧客頁 |
| `components/pages/solutions/pos-v2/signaling-settings.js`、`qr-code.js` | 信令網址設定與兩組自架指令；零依賴的 QR Code 產生器 |
| `server/signaling.mjs`、`server/cloudflare/` | 兩種信令伺服器，行為相同，跑同一組協定測試 |

## 3. 資料流

資料模型（`POS_V2_SCHEMA_VERSION = 1`）：

- `orders`：第一代欄位，加上 `principal`（送單的授權身分）、`source`（`device`／`table`）、`tableId`、`diningSessionId`；`[principal, requestId]` 複合唯一索引。
- `tables`、`sessions`：桌位與用餐場次。`credentials`：店員裝置與顧客入桌的授權，只存 secret 的雜湊。`pairing`：配對票。
- 房間（`roomId`、`hostSecret`）在另一個資料庫，重設 demo 資料不會刪除。

授權：

| 身分 | 取得方式 | 可以做什麼 |
| --- | --- | --- |
| 店員裝置 | 配對（QR Code 帶 5 分鐘內有效的配對 token，或 6 位數連線碼；有效期內每台送出申請的裝置都要主機逐一核准）→ 主機核准並指定角色 | 依角色：點餐送單、廚房認領／完成／接手、叫號取餐 |
| 顧客（入桌） | 桌號＋入桌碼（同一個場次共用；連錯 5 次冷卻） | 送單到這張桌目前的場次、看自己這張授權的訂單 |
| 訂單查詢 | 櫃檯送單時主機以 `hostSecret` 衍生的 token | 只看那一筆訂單 |

- **寫入**：所有寫入都在主機的單一 `readwrite` transaction 內「重新讀出授權 → 判斷 → 寫回」，送單前授權被撤銷就拒絕。
- **送單去重**：去重鍵是「身分＋`requestId`」，拿別人的 `requestId` 只會建立自己的新單，取不到別人的。
- **狀態轉移**：和第一代相同（認領、完成、接手、取餐）；取消待處理訂單只能在管理主機的訂單明細操作。遠端廚房站台的存活由主機依連線與心跳判斷，離線逾時後才能接手。
- **推送**：主機寫入後在 100 ms 內合併推送 `kitchen`、`display`、`order`、`myOrders` 等主題，每台裝置只收到自己授權看得到的資料；推送跳號時裝置 `sync` 重讀。
- **前面待備餐的筆數**：全店序號比自己小、仍在待處理的訂單數。

## 4. 故障模式

| 情境 | 預期行為 | 如何驗證 |
| --- | --- | --- |
| 重新整理（裝置） | 授權存在 localStorage，重新整理後自動重連並驗證，不用重新配對或輸入入桌碼 | 瀏覽器測試 |
| 重新整理（主機） | 從 IndexedDB 恢復房間、授權與桌位；裝置看到 `host-online` 的主機執行個體 id 改變，立即重建直連 | 瀏覽器測試 `runPosV2RecoveryTests` |
| 送出後、回覆前中斷 | 送單先存在本機，畫面顯示「等待主機確認」；重連後以同一個 `requestId` 重送，主機已寫入的回原訂單，只有一筆 | 瀏覽器測試（寫入後、寫入前各一次）、`tests/pos-v2-remote-session.test.js` |
| 晚加入的裝置 | 驗證後取得目前所有訂閱主題的完整資料 | 瀏覽器測試 |
| 並行操作同一筆資料 | 主機上依序執行，只有一個成功，另一個顯示已由其他站台處理 | 瀏覽器測試兩台遠端廚房同時認領 |
| 遠端站台仍在線時接手 | 拒絕；離線逾時後主機推送一次，其他站台出現「接手」 | 瀏覽器測試、`tests/pos-v2-hub.test.js` |
| 授權撤銷或房間重建 | 裝置顯示需要重新配對或重新輸入入桌碼；舊授權下等待確認的送單不改用新授權重送，逐筆告知 | `tests/pos-v2-hub.test.js`、`tests/pos-v2-remote-session.test.js` |
| 關桌再開桌 | 舊頁面送單回 `SESSION_CLOSED`，舊入桌碼回 `CODE_INVALID`，仍看得到自己的訂單 | 瀏覽器測試 |
| 主機分頁關閉 | 裝置顯示「等待主機上線…」，主機回來後自動恢復 | 瀏覽器測試 `runPosV2HubTests`、`runPosV2RecoveryTests` |
| 另一個主機分頁 | 第二個分頁取不到 Web Lock，只能查看 | 瀏覽器測試 |
| 信令伺服器斷線 | 已建立的直連不再經過信令，不受影響；信令依退避重連。主機信令重連後的 `host-online` 帶同一個執行個體 id，裝置保留直連 | 瀏覽器測試 `runPosV2RecoveryTests`（主機、手機各自的信令重連時，直連都不重建，主機也不關掉手機的連線）、`tests/signaling-client.test.js`（重連退避）、`tests/signaling.test.js`（執行個體 id） |
| 多台裝置同時重連 | 已驗證的主機在信令上的速率額度依 peer 數放大（50 ×（1 + peer 數）則／10 秒），回應每台裝置的握手時不會被 4008 關閉 | `tests/signaling.test.js` |
| 網址的信令和配對（入桌）時不同 | 店員裝置先顯示兩個信令網址請使用者確認，確認前不送出授權；顧客手機不自動送出入桌授權，要重新輸入入桌碼 | 瀏覽器測試 `runPosV2RecoveryTests` |
| 並行猜入桌碼或連線碼、亂給桌號 | 驗證中的請求先算成一次錯誤，同一條連線並行送出也最多 5 筆進到驗證；不存在的桌號只計入連線的次數，不會擠掉其他桌的冷卻 | `tests/pos-v2-hub.test.js` |
| 推送內容過大、送單太頻繁 | 快照依位元組上限截斷並標 `truncated`，不關閉連線；同一個身分每分鐘最多送單 30 次，超過回 `RATE_LIMITED`（已存在的 `requestId` 重送不計入） | `tests/pos-v2-hub.test.js` |
| 直連失敗（對稱型 NAT、行動網路） | 逾時後顯示「無法建立直連，需要 TURN」並提供重試，不無限等待 | 瀏覽器測試 `runPosV2HubTests`（只允許 TURN、沒有 TURN 時判定失敗） |
| 不合格訊息 | 有 id 的回 `BAD_MESSAGE`、沒有的丟棄，都計數；累計 20 則後關閉連線 | `tests/pos-v2-hub.test.js`、瀏覽器測試 |
| 裝置收得慢（背壓） | `bufferedAmount` 超過 1 MiB 時暫停推送，緩衝降下來後送一份最新快照 | `tests/pos-v2-hub.test.js` |
| 未設定信令 | 主機照常本機運作，顯示兩組自架指令；不出現 `console.error` | 瀏覽器 smoke test |
| 不支援 WebRTC 或 WebSocket | 顯示說明，不啟動 | `remoteSupported()` |

## 5. 資源與清理

- 主機分頁：IndexedDB 連線、主機 Web Lock、信令 WebSocket、每台裝置一條 RTCPeerConnection、心跳與在線計時器、`beforeprint` 監聽。離開路由時（`disconnectedCallback`）全部釋放。
- 遠端裝置：信令 WebSocket、一條 RTCPeerConnection、RPC 計時器；離開路由時釋放。
- 重設 demo 資料：刪除 `vanilla_solution:<ns>:orders`，保留 `vanilla_solution:<ns>:room`。
- 裝置上的 localStorage：信令網址（主機）、`credential:<roomId>`（店員授權）、`table:<roomId>`（入桌授權）、`watches:<roomId>`（訂單查詢，最多 50 筆）、`pending:<roomId>`（等待確認的送單），都以 `vanilla_solution:<ns>:` 開頭。

## 6. 正式上線差距

- **授權與身分**：信任模型見 [ADR 0109](../decisions/0109-pos-v2-webrtc-host-authority.md)。主機席位以 TOFU 綁定，沒有帳號系統；入桌碼與連線碼是 6 位數，靠冷卻限制猜測。正式系統需要店家帳號、裝置管理與稽核紀錄。
- **交易與付款**：沒有收款、發票、退款與對帳。
- **跨裝置同步與後端**：主機分頁是唯一的權威，主機電腦關機就無法點餐；沒有備援與異地備份。只用 STUN，行動網路或對稱型 NAT 需要自備 TURN（`--ice-servers`／`ICE_SERVERS`）。
- **個資與稽核**：不收集顧客資料；訂單只存在主機瀏覽器。
- **其他**：每個房間最多 64 台裝置；Quick Tunnel 網址每次不同，長期使用請用自己的 Worker。瀏覽器可能在儲存空間不足時清除資料，正式系統需要 `navigator.storage.persist()` 與備份。

## 7. 測試

- 單元測試：`tests/pos-v2-model.test.js`（授權判斷、送單與轉移）、`tests/pos-v2-hub.test.js`（RPC 授權、推送、背壓、在線與接手）、`tests/pos-v2-remote-session.test.js`（待確認送單的保留與重送）、`tests/signaling.test.js`（信令協定；設定 `SIGNALING_URL` 時也對 Worker 跑同一組）、`tests/signaling-client.test.js`、`tests/signaling-settings.test.js`、`tests/qr-code.test.js`、`tests/pos-v2-docs.test.js`（本文件的指令與 SHA-256 和實際檔案一致）。
- 瀏覽器測試（`tests/browser-runner.mjs`，每台裝置各自獨立的瀏覽器環境）：主機與唯讀分頁、信令設定（A9）、連線層、店員裝置配對與完整流程（A1–A3）、顧客端（A4–A6）、中斷恢復（A7）。第一代的 `runPosTests` 不修改照常通過（A8）。
- 實機驗收（A10）：筆電 Chrome 當主機，iOS Safari 與 Android Chrome 在同一個 Wi-Fi，兩種自架信令各走一次。
