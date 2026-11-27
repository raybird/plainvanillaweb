# POS v2 跨裝置協作與桌邊點餐 執行計畫

- Issue：#16（承接 #10、Epic #8）
- 建立日期：2026-11-26
- 規模：Large。風險：高（跨裝置授權、斷線恢復、新增外部信令服務）
- 狀態：驗收 A1–A10（見 #16）已於 2026-11-26 核准；ADR 0109 已接受；P0 剩協定規格草案定稿
- 協定規格：[2026-11-26-pos-v2-protocol.md](./2026-11-26-pos-v2-protocol.md)

**目標** 讓管理統計頁成為店內 POS 主機，店員裝置與顧客手機經 WebRTC DataChannel 加入，所有寫入集中在主機的 IndexedDB。第一代 `#/solutions/pos/*` 保留不變。

**架構** 星狀拓撲：除了管理頁以外的角色都是遠端裝置（和主機在同一台電腦上也一樣），每台只和主機分頁建立一條 DataChannel，只做 RPC。主機驗證授權後呼叫自己的 repository，寫入成功才回覆並依角色推送資料。跨裝置互斥由主機的 readwrite transaction 依序執行保證，不需要分散式鎖。MessageBus 只用來通知同一台電腦上唯讀的其他管理分頁。

```text
顧客手機 / 店員裝置 ──DataChannel──┐
                                   ├─ 主機分頁（Web Lock：每個 namespace 一個）
信令（WSS，只交換 SDP/ICE）─────────┘      │ hub：驗證授權 → repository → 依角色推送
                                          ▼
                       IndexedDB vanilla_solution:<ns>:orders（v2 schema，唯一權威狀態）
```

## 已決定

見 #16「已決定（2026-11-26）」：第一代保留；前端維持 GitHub Pages；信令只提供自架、不維護公開端點（Node 參考伺服器＋Quick Tunnel，或自有帳號的 Cloudflare Worker＋Durable Object），信令網址只在主機端設定並帶進 QR Code；ADR 0109；程式放在 `components/pages/solutions/pos-v2/`；同網段＋STUN；不部署 TURN。

## 最大風險與優先驗證

1. **headless Chrome 的 WebRTC loopback**：mDNS 混淆 host candidate 可能讓 CI 連不起來。P3 的第一個任務是做 spike：兩個 CDP target 經本機信令建立 DataChannel 並互傳訊息，必要時調整 `tests/browser-runner.mjs` 的 Chrome 啟動參數。spike 不通過，就不往下做 P4。
2. **授權與 requestId 範圍**（A5、A6）：在 P1 以純函式與單元測試先鎖定，後面各階段只負責接線。
3. **主機重新整理後恢復**（A7）：P1 的 schema 就要包含房間、主機憑證與授權雜湊，不要等到 P7 才補 schema。

## 階段

### P0 規格與決策

- [x] #16 本文更新為已決定事項＋驗收 A1–A10，經使用者核准（2026-11-26）。
- [x] ADR 0109（WebRTC DataChannel 與主機授權的信任模型），2026-11-26 已接受並同步 #16。產出：`docs/decisions/0109-pos-v2-webrtc-host-authority.md`，並執行 `node scripts/update-adr-index.js`。完成判準：寫明和 ADR 0107 第 3 條決策的差異、信任範圍與正式上線差距；`--check` 通過；使用者確認與 #16 原描述不同的設計後，狀態改為已接受，並同步 #16。
- [x] 協定規格（草案已建立，隨 P1–P7 修訂）：信令訊息（主機席位、加入、轉送 SDP／ICE、離開）與 DataChannel RPC（訊息信封、錯誤碼、各角色可呼叫的方法、推送內容）。產出：`docs/superpowers/plans/2026-11-26-pos-v2-protocol.md`（草案，P8 併入 `docs/solutions/pos-v2.md`／`.en.md`）。驗收：A1–A7 的前置。

### P1 資料模型 v2（純函式與 repository）

- [x] `pos-v2-model.js`：桌位、用餐場次（開桌、關桌、輪換入桌碼）、授權種類（裝置、入桌、訂單查詢）與雜湊比對、驗證嘗試次數上限與冷卻、訂單加上 `tableId`／`diningSessionId`／`source`／`principal`、前面待備餐筆數。盡量匯入第一代 `pos-model.js` 的轉移規則，不複製。驗收：A4–A6。
- [x] `pos-v2-repository.js`（瀏覽器測試 `tests/pos-v2-browser.html`，15 項，由 `browser-runner.mjs` 執行；店員點餐的查詢 token 改由 `hostSecret` 以 HMAC 推導，不保存雜湊，重送也取得同一個值；第一代 `pos-repository.js` 只把 `runTransaction`／`requestToPromise` 加上 export）：自有資料庫與 `SCHEMA_VERSION`；store 包含 orders、tables、sessions、credentials、host；去重鍵為 `[principal, requestId]` 複合索引；送單時在同一個 transaction 內確認場次仍有效。驗收：A5–A7。
- [x] 單元測試 `tests/pos-v2-model.test.js`（23 項；第一代測試未修改照常通過）。完成判準：拿別人的 `requestId` 取不到別人的訂單、舊場次授權被拒、冷卻時間生效、排隊筆數正確；`node --test tests/pos-model.test.js` 照常通過（A8）。

### P2 QR Code encoder（可和 P1 並行）

- [x] 零依賴 encoder（byte mode、ECC M、版本 1–10、自動選遮罩），輸出 SVG 字串（深色模組用 `currentColor`）。產出：`components/pages/solutions/pos-v2/qr-code.js`。
- [x] 單元測試 `tests/qr-code.test.js`：31 組指定遮罩的參考向量（segno 1.6.6 產生，涵蓋版本 1–10 與遮罩 0–7，模組矩陣以 SHA-256 寫死），加上容量邊界、超長報錯與 SVG 輸出。segno 在資料已對齊碼字邊界時多補一個 `0x00`，不符 ISO/IEC 18004 7.4.10，產生向量時換成符合規格的補位。自動選遮罩的罰分解讀和 segno 不同，測試只要求自動結果等於以同一遮罩指定產生的矩陣。另以 zxing-cpp 解碼 117 個產生結果（13 種內容 × 8 種遮罩加自動），全部解出原文（2026-11-26，只在 scratchpad 執行，不進 repo）。

### P3 信令

- [x] **Spike：headless Chrome WebRTC loopback**（見最大風險 1，2026-11-26 本機通過）：同一個 headless Chrome 的兩個 target，信令由 Node 經 CDP 轉送、`iceServers: []`，約 0.4 秒建立 DataChannel 並雙向收發。預設的 host candidate 是 mDNS `.local` 名稱；加上 `--disable-features=WebRtcHideLocalIpsWithMdns` 後改為實際 IP，加上 `--no-sandbox`（CI 使用）也一樣能連。`tests/browser-runner.mjs` 加入 WebRTC 測試時一併加上這個參數，避免依賴 runner 的 multicast；GitHub Actions 上的結果要等第一個 WebRTC 瀏覽器測試推上去才能確認。
- [x] 信令協定與 client adapter：重連退避、斷線狀態事件、送出失敗明確回報。產出：`pos-v2/signaling-client.js`。
  - 結果（2026-11-26）：`tests/signaling-client.test.js` 7 項，連真的 `signaling.mjs` 測互傳、4001 不重連、4002 停在 replaced、伺服器重啟後依退避重連、未連線送出回傳 false，並以不回應的假 WebSocket 測心跳逾時。Node 22 的 WebSocket（undici）連線失敗時只發 `error`、不發 `close`，client 在尚未開啟時收到 `error` 就當成關閉處理。
- [x] Node 參考伺服器，**單一檔案、不匯入任何本地模組**（測試者只下載這一個檔案就能執行）。WebSocket 實作以 `tests/helpers/realtime-server.mjs` 為參考寫在檔案內；反過來由測試輔助程式匯入它，不讓它依賴 `tests/`。房間只允許一個主機席位（以主機 secret 認證）、由伺服器指定 `sender`、限制訊息大小、閒置房間逾時、`Origin` 白名單可設定（預設 GitHub Pages 網域與 `localhost`）。產出：`server/signaling.mjs`（確認 `update-sw-version.js` 的雜湊範圍是否要排除 `server/`）。完成判準：把檔案複製到空目錄後，`node signaling.mjs` 能啟動。
  - 結果（2026-11-26）：WebSocket 訊框處理直接寫在檔案內，沒有改動 `tests/helpers/realtime-server.mjs`（兩者各自獨立，不互相匯入）。`server/` 已加進 `update-sw-version.js` 的排除清單：它只給測試者下載，網站與 Service Worker 不會載入。
- [x] `signaling.mjs --tunnel`：啟動 `cloudflared tunnel --url http://localhost:<port>`，從輸出抓出 `trycloudflare.com` 網址，印出已帶好 `wss://` 信令位址的主機頁連結。找不到 `cloudflared` 或抓不到網址時，改印出手動步驟，不中止信令伺服器。抓網址的邏輯寫成純函式，以 cloudflared 的輸出樣本做單元測試。
  - 結果（2026-11-26）：本機以 cloudflared 實測，取得 Quick Tunnel 網址，經由公開的 `wss://` 完成主機與 peer 的轉送；`from` 被覆寫、不在白名單的 `Origin` 被拒。PATH 沒有 cloudflared 時印出手動步驟、伺服器照常運作，這部分由單元測試涵蓋。
- [x] Cloudflare Worker＋Durable Object 版，給測試者部署到自己的帳號；協定和 Node 版相同，共用同一份協定測試。產出：`server/cloudflare/worker.js`＋`wrangler.jsonc`，下載這兩個檔案到空目錄後 `npx wrangler deploy` 即可部署。Worker 首頁（GET `/`）顯示已帶好信令位址的主機頁連結。實作前確認 `npm create cloudflare -- --template` 能否直接從 repo 子目錄建立，可以的話文件多列這條路。
  - 結果（2026-11-26）：以 npx 快取裡的 wrangler 4.158.0 執行 `wrangler dev --local`，`SIGNALING_URL=ws://127.0.0.1:<port> node --test tests/signaling.test.js` 對 Worker 跑同一組協定測試，13 項通過、2 項 Node 專屬而略過。綁定逾時另以 `--var BINDING_TTL_MS:2000` 實測 alarm：逾時前其他 secret 被拒（4001），逾時後可以綁定。`npm create cloudflare --template` 不採用：2026-11-27 分支推上後以 `create-cloudflare@latest --template github:raybird/plainvanillaweb/server/cloudflare#feat/16-pos-v2` 實測，C3 回報「templates must contain a "package.json" file」；repo 不放 `package.json`（零依賴），文件只列「下載兩個檔案後 `npx wrangler@4 deploy`」。實際部署到 Cloudflare 帳號屬於 A10 的實機驗收。
- [x] Node 測試（`tests/signaling.test.js`，15 項）：第一個主機綁定房間、不同 secret 被拒（4001）、同一 secret 取代舊連線（4002）、偽造 sender 被覆寫、24 小時無主機後清除綁定、不在白名單的 `Origin` 被拒。另含訊框解析、限速（4008）、每房 64 個 peer（4009）、過大訊息（1009）、主機上下線通知，以及複製到空目錄執行。
- [x] 主機端信令設定（A9）：
  - 信令網址欄位存 localStorage，提供連線測試；貼 `https://…` 時自動轉成 `wss://`。所有 QR Code 網址都帶上信令位址。
  - 未設定時顯示兩種自架方式的指令與複製按鈕：Node＋Quick Tunnel（`curl -fsSLO …/server/signaling.mjs`、`node signaling.mjs --tunnel`）、自有 Worker（下載 `worker.js`／`wrangler.jsonc`、`npx wrangler login`、`npx wrangler deploy`）。指令依 `lib/version.js` 的 `VERSION` 組出 `cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v<VERSION>/…`，與頁面同版；只下載後執行，不提供 `curl | sh`。另附 cloudflared 官方安裝說明的連結。
  - 從網址參數（`sig=`）帶入的信令位址，要經使用者確認「要使用這個信令網址嗎？」才儲存，不直接套用：信令伺服器在信任範圍內，不能讓任意連結替換它。
  - 瀏覽器測試：指令中的版本號等於 `VERSION`；帶 `sig=` 的連結在確認前不改變已儲存的設定。
  - 結果（2026-11-26）：主機頁 `#/solutions/pos-v2/admin`（`PosV2AdminPage.js`）目前只有信令設定，房間與 hub 在 P4 加入；設定邏輯在 `signaling-settings.js`。連線測試以 peer 身分連到隨機空房間、收到 `welcome` 才算成功，所以也能抓出 Origin 白名單沒有包含網站的情況。`tests/signaling-settings.test.js` 5 項；`tests/browser-runner.mjs` 的 `runPosV2AdminTests` 在根目錄與子路徑各跑一次，連 runner 內建的兩個 `signaling.mjs`（一個只允許別的 Origin），驗證指令版本、儲存與連線測試、Origin 被拒、`sig` 確認前與拒絕後不改設定、重新載入後接受才儲存、格式不對時忽略。亮色與暗色截圖確認過。QR Code 帶上信令位址屬於 P4 起產生 QR Code 的頁面。

### P4 主機 hub 與連線層

- [x] 主機分頁的 Web Lock 單例；其他管理分頁進入唯讀模式。
- [x] hub：每台裝置一個 `RTCPeerConnection`、可設定的 `iceServers`、ICE 失敗時回報需要 TURN、心跳與在線狀態、`bufferedAmount` 背壓、安全 JSON parse 與大小上限、依授權分派 RPC、依角色推送。
- [x] 房間：第一次啟用時產生 `roomId` 與 `hostSecret`，存在 `vanilla_solution:<ns>:room`；「重設 demo 資料」保留房間；「重新產生房間」經使用者確認後換新，並處理 4001（房間已被其他主機使用）的提示（協定規格 3.2、第 8 節）。
- [x] 唯讀管理分頁：主機寫入後以 MessageBus 通知，同一台電腦上其他管理分頁重讀 IndexedDB。
- [x] 瀏覽器測試：主機與兩個 client target 互通；不合格訊息被拒並計數；未設定信令時頁面不出現 `console.error`（A9）。
- 結果（2026-11-26）：
  - 分層：`pos-v2-wire.js`（訊息信封）、`pos-v2-hub.js`（授權、RPC、推送、心跳、背壓、嘗試次數）、`pos-v2-rpc-client.js`（peer 端 RPC）、`peer-link.js`（WebRTC：主機端 `HostLinks`、peer 端 `PeerLink`）、`pos-v2-host.js`（Web Lock、房間、信令、MessageBus）。hub 與 RPC client 只依賴類 DataChannel 介面，`tests/pos-v2-hub.test.js` 以記憶體通道與沿用真模型函式的假 repository 測 15 項（權限、入桌與連線碼的嘗試次數、配對核准／拒絕、撤銷、查詢授權、接手的在線判斷與並行、不合格訊息、心跳、背壓、RPC 逾時與跳號）。
  - 配對核准、站台接手的 RPC 已在 hub 實作並有單元測試；管理頁的配對 UI 與遠端畫面屬於 P5。
  - `tests/browser-runner.mjs` 的 `runPosV2HubTests`（Chrome 加上 `--disable-features=WebRtcHideLocalIpsWithMdns`，每個分頁開新視窗，避免背景分頁的 requestAnimationFrame 暫停）：房間被搶先綁定時顯示被拒、確認後重新產生房間並連上信令；主機與兩個 client target 以 WebRTC 互通、角色推送、FORBIDDEN、不合格訊息計數顯示在主機頁、唯讀分頁同步、只允許 TURN 時 1.5 秒後停在 `failed` 並帶 `needTurn` 且不自動重試；關閉主機分頁後唯讀分頁接手、裝置自動重連並以原授權取回資料。根目錄與子路徑各一次，本機連跑 3 次穩定（單次約 16 秒）。
  - 主機分頁直接關閉時，對方的 DataChannel 不一定立刻觸發 `close`：`PeerLink` 另外監看 `connectionState`，並提供 `reconnect()` 讓上層在 RPC 心跳判定主機失聯時呼叫（P5 的 `RemotePosSession` 要接上）。
  - GitHub Actions 上的 WebRTC 結果要等推上去才能確認（見 P3 spike）。

### P5 店員裝置

- [x] 配對：管理端顯示配對 QR Code（網址帶房間與一次性配對碼）與短效連線碼；裝置申請加入；管理端核准並指定角色（廚房還要指定站台）。
- [x] `RemotePosSession`：介面和第一代 `PosSession` 一致，讓點餐、廚房、叫號畫面能重用第一代元件。需要修改第一代元件時只做相容的擴充（A8）。
- [x] 遠端站台接手：主機判斷 DataChannel 已斷線且心跳逾時，才允許接手；判斷與寫入在主機內依序執行。
- [x] 瀏覽器測試：A1、A2、A3。
- 結果（2026-11-27）：
  - 第一代只改 `pos/pos-page.js`：`PosRolePage` 加上擴充點 `static Session`、`titlePrefix`、`hubPath`、`hubLabel`、`unsupportedText` 與 `renderStatusPill()`，預設值就是原本的行為；第一代的測試沒有修改，全部通過（A8）。
  - 第二代：`pos-v2-remote.js`（網址參數、本機授權、信令＋WebRTC＋RPC 組成的 `PosV2Remote`）、`remote-pos-session.js`（`RemotePosSession`，把主機推送的快照換成第一代畫面用的形狀；廚房的 `activeStations` 由主機的 `takeoverAllowed` 推得）、`PosV2StaffPages.js`（以 mixin 包第一代的點餐、廚房、叫號元件，未連線、未配對、被撤銷或角色不符時顯示連線面板）、`PosV2JoinPage.js`（`/join`：帶 `pair` 時以 token 申請，沒有時輸入連線碼；核准後存授權並前往角色畫面）。
  - 主機頁：配對 QR Code（深色主題也維持白底黑碼）與連線碼、待核准清單（角色、廚房站台預設下一個沒人用的 `K<n>`）、已配對裝置與撤銷。
  - hub：叫號推送改帶 `{id, number, status}`（第一代叫號畫面要用 id 送「已取餐」）；站台斷線後，到可以接手的時間點再推送一次，廚房畫面才會出現接手按鈕。
  - `tests/browser-runner.mjs` 的 `runPosV2StaffTests`：QR Code 與連線碼兩種配對（含輸錯被拒）、核准前 `UNAUTHORIZED`、叫號認領 `FORBIDDEN`、遠端點餐→廚房→叫號→取餐與主機統計一致、兩個遠端廚房同時按認領只有一個成功且另一個顯示 `CONFLICT`、站台在線時接手被拒、關閉站台分頁後約 15–20 秒出現接手按鈕並接手成功、撤銷後畫面要求重新配對。根目錄與子路徑各一次，本機連跑 3 次穩定（單次約 29 秒，多半在等站台逾時）。
  - 實機部分（A1、A2 的 iOS Safari／Android Chrome）併入 A10 的實機驗收。

### P6 顧客端

- [x] 管理端桌位管理：開桌、關桌、輪換入桌碼、列印用的桌牌 QR Code。
- [x] 顧客路由：共用首頁（列出已開放的桌號）、桌牌入口、輸入入桌碼、點餐與加點、我的訂單（取餐號、進度、前面待備餐筆數）。
- [x] 櫃檯交接：點餐裝置的顧客側畫面顯示取餐號與訂單 QR Code；查單頁只能看那一筆。
- [x] 瀏覽器測試：A4、A5、A6。
- 結果（2026-11-27）：
  - 第一代再加兩個相容的擴充點：`PosRolePage` 的 `static meta`（標題），`PosKitchenPage` 的 `renderTicketExtra(order)`（第二代顯示桌號與場次）；第一代測試仍未修改、全部通過（A8）。
  - `remote-pos-session.js` 拆成共用基底與兩個工作階段：店員的 `RemotePosSession`、顧客的 `RemoteTableSession`（入桌授權存在 `vanilla_solution:<ns>:table:<roomId>`；場次關閉後顯示「用餐已結束」與自己的訂單，可輸入新的入桌碼）。桌邊點餐頁沿用第一代點餐元件，前面加入桌碼表單、後面加「我的訂單」與前面待備餐筆數。
  - `PosV2CustomerPages.js`：`/home`（已開桌清單與「店員加入」）、`/table?t=`、`/track?o=&k=`（`order.watch`，查詢授權存在 `vanilla_solution:<ns>:watches:<roomId>`）。點餐裝置送單後顯示訂單 QR Code（`PosV2StaffPages.js`）。
  - 主機頁：桌位清單（開桌、關桌、換新入桌碼、這個場次的訂單數、入桌碼錯誤次數）。入桌碼只在開桌或換新時顯示一次，存在主機分頁的記憶體，重新整理後要換新才看得到（主機只存雜湊）。桌牌 QR Code（店家入口＋每張桌）可列印：`@media print` 只印桌牌，以 `Page.printToPDF` 確認為單頁；直接按 Ctrl+P 時以 `beforeprint` 展開收合的區塊。QR Code 依網址快取，主機頁重繪不再重算。
  - `tests/browser-runner.mjs`：`openTab({ isolated: true })` 以 `Target.createBrowserContext` 開獨立的瀏覽器環境，模擬不同裝置（localStorage 不互通）；店員與顧客測試的每台裝置都用它。`runPosV2CustomerTests`：店家入口選桌與桌牌兩種入口、只有桌號時 `UNAUTHORIZED`、同桌兩支手機共用入桌碼、廚房看到兩筆同桌同場次、主機的場次訂單數、前面筆數由 1 變 0、手機看不到別人的訂單、假 token 查單被拒、拿別人的 `requestId` 只建立自己的新單、櫃檯訂單 QR Code 交接並隨認領更新、輸錯 5 次後冷卻（正確碼也拒絕）、關桌後仍看得到自己的訂單、再開桌後舊頁面 `SESSION_CLOSED`、舊碼 `CODE_INVALID`、新碼可以再點餐。本機連跑 3 次穩定（店員＋顧客約 39 秒）。
  - 手機尺寸（390×844）的桌邊點餐頁以截圖確認亮暗兩種主題。實機部分（A4、A6 的 iOS Safari／Android Chrome）併入 A10。
  - 完整檢查時 Farm（#11）的多分頁測試偶發一次「只有 1 個節點處理到圖片」，重跑通過；和本次變更無關，記錄備查。

### P7 中斷恢復

- [x] 用戶端把授權與待確認的 `requestId` 存在本機；重連後以原 `requestId` 重送，並顯示連線狀態。
- [x] 主機重新整理：從 IndexedDB 恢復房間與主機席位，各裝置自動重連並重新驗證。
- [x] 瀏覽器測試：A7（主機寫入後、回覆送達前中斷 DataChannel；重新整理主機分頁）。
- 結果（2026-11-27）：
  - 工作階段（`remote-pos-session.js`）：送單前存進 `vanilla_solution:<ns>:pending:<roomId>`，回覆是 `HOST_UNAVAILABLE` 時保留並拋 `PENDING`；`auth` 之後依序重送（店員點餐裝置與顧客都是），明確被拒絕的刪掉並告知，又斷線就停下；授權失效時不改用新授權重送，逐筆告知後刪掉（協定規格 7 補上這幾點）。
  - 畫面（`remote-page.js` 的 `recoverableOrderPage`，套在店員點餐與桌邊點餐）：等待確認的送單另列一區，斷線、重新整理期間都看得到；購物車清空、下一筆換新的 `requestId`；重送有結果後顯示取餐號碼（店員點餐裝置同時顯示訂單 QR Code）。
  - `PeerLink`：直連還開著卻收到 `host-online`（主機分頁重新整理）時立即重連，不等 15 秒心跳逾時。
  - 主機重新整理的恢復沿用 P3、P4：房間、授權雜湊與桌位場次都在 IndexedDB，主機席位以 TOFU 綁定，重新整理後自動取回。
  - 單元測試 `tests/pos-v2-remote-session.test.js`（8 項）：沒回覆保留、明確拒絕不保留、重送成立與 token、重送又斷線停下、重送被拒繼續下一筆、舊一輪驗證不再送、授權失效不重送、店員與顧客分開存。
  - 瀏覽器測試 `runPosV2RecoveryTests`：在主機頁把下一筆 `order.place` 改成「寫入後（或寫入前）關掉 DataChannel 並離開主機頁」，模擬回覆送達前主機消失。驗證手機顯示 1 筆等待確認、重新整理手機後仍在、主機回來後自動重送且主機只有一筆；店員點餐裝置在寫入前中斷，主機回來後建立一筆並顯示訂單 QR Code；主機分頁重新整理後手機與點餐裝置自動重連，不用重新配對或輸入入桌碼，手機能繼續點餐。多裝置測試的共用環境抽成 `posV2Rig()`，顧客端測試改用它。本機連跑 3 次穩定（中斷恢復＋顧客端約 30 秒）。

### P8 收尾與發版

- [ ] 文件：`docs/solutions/pos-v2.md`／`pos-v2.en.md`（依 reference app 文件範本）、`conventions.md` 範例清單、第一代 `pos.md` 的「正式上線差距」連到第二代、`Docs.js` 清單、Solutions 入口。
- [ ] 自架信令文件：Node＋Quick Tunnel 與自有 Worker 兩種步驟，寫在 `pos-v2.md`／`pos-v2.en.md`，內容和主機頁顯示的指令一致，並附上 `signaling.mjs`、`worker.js`、`wrangler.jsonc` 的 SHA-256 供比對。
- [ ] 發版順序：tag `v<VERSION>` 推上去之前，主機頁指令裡的 jsDelivr 網址會 404。實機驗收先用 commit SHA 的網址；推 tag（需使用者同意）後，再照主機頁指令重跑一次 Node＋Quick Tunnel，確認網址可下載。
- [ ] 實機驗收清單：管理筆電、iOS Safari、Android Chrome；同一 Wi-Fi；兩種自架信令各走一次，只照主機頁上顯示的指令操作，不參考其他文件（A1、A2、A4、A6、A10）。
- [ ] `node scripts/update-sw-version.js`、CHANGELOG、`lib/version.js` 升到 v3.4.0 並同步 README／docs 的 CDN 網址、`scripts/check.sh` 全部通過（A10）。
