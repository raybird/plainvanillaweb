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

- [ ] 零依賴 encoder（byte mode、ECC M、版本 1–10、自動選遮罩），輸出 SVG 字串或 `<canvas>`。產出：`components/pages/solutions/pos-v2/qr-code.js`。
- [ ] 單元測試：以已知輸入比對預期的模組矩陣（向量另外產生後寫死在測試裡），並驗證容量邊界與超長輸入報錯。

### P3 信令

- [x] **Spike：headless Chrome WebRTC loopback**（見最大風險 1，2026-11-26 本機通過）：同一個 headless Chrome 的兩個 target，信令由 Node 經 CDP 轉送、`iceServers: []`，約 0.4 秒建立 DataChannel 並雙向收發。預設的 host candidate 是 mDNS `.local` 名稱；加上 `--disable-features=WebRtcHideLocalIpsWithMdns` 後改為實際 IP，加上 `--no-sandbox`（CI 使用）也一樣能連。`tests/browser-runner.mjs` 加入 WebRTC 測試時一併加上這個參數，避免依賴 runner 的 multicast；GitHub Actions 上的結果要等第一個 WebRTC 瀏覽器測試推上去才能確認。
- [ ] 信令協定與 client adapter：重連退避、斷線狀態事件、送出失敗明確回報。產出：`pos-v2/signaling-client.js`。
- [ ] Node 參考伺服器，**單一檔案、不匯入任何本地模組**（測試者只下載這一個檔案就能執行）。WebSocket 實作以 `tests/helpers/realtime-server.mjs` 為參考寫在檔案內；反過來由測試輔助程式匯入它，不讓它依賴 `tests/`。房間只允許一個主機席位（以主機 secret 認證）、由伺服器指定 `sender`、限制訊息大小、閒置房間逾時、`Origin` 白名單可設定（預設 GitHub Pages 網域與 `localhost`）。產出：`server/signaling.mjs`（確認 `update-sw-version.js` 的雜湊範圍是否要排除 `server/`）。完成判準：把檔案複製到空目錄後，`node signaling.mjs` 能啟動。
- [ ] `signaling.mjs --tunnel`：啟動 `cloudflared tunnel --url http://localhost:<port>`，從輸出抓出 `trycloudflare.com` 網址，印出已帶好 `wss://` 信令位址的主機頁連結。找不到 `cloudflared` 或抓不到網址時，改印出手動步驟，不中止信令伺服器。抓網址的邏輯寫成純函式，以 cloudflared 的輸出樣本做單元測試。
- [ ] Cloudflare Worker＋Durable Object 版，給測試者部署到自己的帳號；協定和 Node 版相同，共用同一份協定測試。產出：`server/cloudflare/worker.js`＋`wrangler.jsonc`，下載這兩個檔案到空目錄後 `npx wrangler deploy` 即可部署。Worker 首頁（GET `/`）顯示已帶好信令位址的主機頁連結。實作前確認 `npm create cloudflare -- --template` 能否直接從 repo 子目錄建立，可以的話文件多列這條路。
- [ ] Node 測試：第一個主機綁定房間、不同 secret 被拒（4001）、同一 secret 取代舊連線（4002）、偽造 sender 被覆寫、24 小時無主機後清除綁定、不在白名單的 `Origin` 被拒。
- [ ] 主機端信令設定（A9）：
  - 信令網址欄位存 localStorage，提供連線測試；貼 `https://…` 時自動轉成 `wss://`。所有 QR Code 網址都帶上信令位址。
  - 未設定時顯示兩種自架方式的指令與複製按鈕：Node＋Quick Tunnel（`curl -fsSLO …/server/signaling.mjs`、`node signaling.mjs --tunnel`）、自有 Worker（下載 `worker.js`／`wrangler.jsonc`、`npx wrangler login`、`npx wrangler deploy`）。指令依 `lib/version.js` 的 `VERSION` 組出 `cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v<VERSION>/…`，與頁面同版；只下載後執行，不提供 `curl | sh`。另附 cloudflared 官方安裝說明的連結。
  - 從網址參數（`sig=`）帶入的信令位址，要經使用者確認「要使用這個信令網址嗎？」才儲存，不直接套用：信令伺服器在信任範圍內，不能讓任意連結替換它。
  - 瀏覽器測試：指令中的版本號等於 `VERSION`；帶 `sig=` 的連結在確認前不改變已儲存的設定。

### P4 主機 hub 與連線層

- [ ] 主機分頁的 Web Lock 單例；其他管理分頁進入唯讀模式。
- [ ] hub：每台裝置一個 `RTCPeerConnection`、可設定的 `iceServers`、ICE 失敗時回報需要 TURN、心跳與在線狀態、`bufferedAmount` 背壓、安全 JSON parse 與大小上限、依授權分派 RPC、依角色推送。
- [ ] 房間：第一次啟用時產生 `roomId` 與 `hostSecret`，存在 `vanilla_solution:<ns>:room`；「重設 demo 資料」保留房間；「重新產生房間」經使用者確認後換新，並處理 4001（房間已被其他主機使用）的提示（協定規格 3.2、第 8 節）。
- [ ] 唯讀管理分頁：主機寫入後以 MessageBus 通知，同一台電腦上其他管理分頁重讀 IndexedDB。
- [ ] 瀏覽器測試：主機與兩個 client target 互通；不合格訊息被拒並計數；未設定信令時頁面不出現 `console.error`（A9）。

### P5 店員裝置

- [ ] 配對：管理端顯示配對 QR Code（網址帶房間與一次性配對碼）與短效連線碼；裝置申請加入；管理端核准並指定角色（廚房還要指定站台）。
- [ ] `RemotePosSession`：介面和第一代 `PosSession` 一致，讓點餐、廚房、叫號畫面能重用第一代元件。需要修改第一代元件時只做相容的擴充（A8）。
- [ ] 遠端站台接手：主機判斷 DataChannel 已斷線且心跳逾時，才允許接手；判斷與寫入在主機內依序執行。
- [ ] 瀏覽器測試：A1、A2、A3。

### P6 顧客端

- [ ] 管理端桌位管理：開桌、關桌、輪換入桌碼、列印用的桌牌 QR Code。
- [ ] 顧客路由：共用首頁（列出已開放的桌號）、桌牌入口、輸入入桌碼、點餐與加點、我的訂單（取餐號、進度、前面待備餐筆數）。
- [ ] 櫃檯交接：點餐裝置的顧客側畫面顯示取餐號與訂單 QR Code；查單頁只能看那一筆。
- [ ] 瀏覽器測試：A4、A5、A6。

### P7 中斷恢復

- [ ] 用戶端把授權與待確認的 `requestId` 存在本機；重連後以原 `requestId` 重送，並顯示連線狀態。
- [ ] 主機重新整理：從 IndexedDB 恢復房間與主機席位，各裝置自動重連並重新驗證。
- [ ] 瀏覽器測試：A7（主機寫入後、回覆送達前中斷 DataChannel；重新整理主機分頁）。

### P8 收尾與發版

- [ ] 文件：`docs/solutions/pos-v2.md`／`pos-v2.en.md`（依 reference app 文件範本）、`conventions.md` 範例清單、第一代 `pos.md` 的「正式上線差距」連到第二代、`Docs.js` 清單、Solutions 入口。
- [ ] 自架信令文件：Node＋Quick Tunnel 與自有 Worker 兩種步驟，寫在 `pos-v2.md`／`pos-v2.en.md`，內容和主機頁顯示的指令一致，並附上 `signaling.mjs`、`worker.js`、`wrangler.jsonc` 的 SHA-256 供比對。
- [ ] 發版順序：tag `v<VERSION>` 推上去之前，主機頁指令裡的 jsDelivr 網址會 404。實機驗收先用 commit SHA 的網址；推 tag（需使用者同意）後，再照主機頁指令重跑一次 Node＋Quick Tunnel，確認網址可下載。
- [ ] 實機驗收清單：管理筆電、iOS Safari、Android Chrome；同一 Wi-Fi；兩種自架信令各走一次，只照主機頁上顯示的指令操作，不參考其他文件（A1、A2、A4、A6、A10）。
- [ ] `node scripts/update-sw-version.js`、CHANGELOG、`lib/version.js` 升到 v3.4.0 並同步 README／docs 的 CDN 網址、`scripts/check.sh` 全部通過（A10）。
