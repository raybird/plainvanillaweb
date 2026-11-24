# Phase 5 延伸評估報告：SharedWorker 與跨裝置 Transport Adapters

> **評估日期**：2026-11-24  
> **架構決策**：[ADR 0107](./decisions/0107-sharedworker-and-cross-device-transport-evaluation.md) · 相關主題：[跨執行環境協作指南](./coordination.md)  
> **定位聲明**：本文件僅針對 Issue #7 進行技術可行性比較、邊界定義與小型 PoC 驗證，**未對生產核心（`lib/core.js`）或協調 SDK（`lib/coordination.js`）做出發版承諾或改動**。

---

## 1. `SharedWorker` vs `Web Locks Leader` 模式完整比較

| 比較面向 | `Web Locks Leader` + `BroadcastChannel`（Phase 1–4 採用） | `SharedWorker` Hub（評估方案） | 評估結論 |
| :--- | :--- | :--- | :--- |
| **生命週期** | 鎖綁定於持有該鎖的瀏覽器 Tab / Window；Tab 重載或關閉即觸發釋鎖與自動接管（[ADR 0104](./decisions/0104-leader-election-and-rpc.md)）。 | 只要同一 Origin 仍有至少一個連接中的瀏覽器 Tab，SharedWorker 即可跨單一 Tab 重載持續存活；但所有 Tab 關閉後仍會終止。 | SharedWorker 適合在單頁刷新瞬間減少重連成本；但跨工作階段仍必須仰賴 IndexedDB。 |
| **平台／行動端支援度** | 桌面主流瀏覽器與 Android／iOS 現代瀏覽器廣泛支援 Web Locks 與 `BroadcastChannel`。 | **Android Chrome 不支援 `SharedWorker`**（`typeof SharedWorker === 'undefined'`），行動網頁兼容性有嚴重缺口。 | Android Chrome 缺口是決定預設架構採 **No-Go** 的關鍵主因。 |
| **CDN / jsDelivr 相容性** | 純 ES Module 腳本可直接自 jsDelivr 或任意靜態空間載入運行。 | `new SharedWorker(url)` 受同源策略限制，**無法直接傳入第三方 CDN（如 `cdn.jsdelivr.net`）腳本 URL**。 | 強依賴 SharedWorker 會破壞本專案零配置 CDN 引入體驗。 |
| **背景凍結（Page Freeze）** | 背景頁面遭凍結時仍可能保有 Web Lock（造成接管延遲），本 SDK 提供 `releaseOnFreeze: true` 緩解。 | SharedWorker 內部單獨擁有執行續較不易受單一 Tab 凍結波及，但若各連線 Tab 皆進凍結仍無法與頁外 UI 即時互動。 | 桌機多開頁面場景 SharedWorker 有微幅延遲與重連優勢。 |
| **資源與失效模式（Zombie Port）** | 由瀏覽器原生追蹤分頁與連線關閉並釋放鎖；`LeaderElection` 與 `PeerDiscovery`（heartbeat）職責分離。 | 分頁異常中斷、節電殺死或忘記呼叫 `port.close()` 時，瀏覽器未保證派發端口關閉事件，Worker 內容易殘留「殭屍 port」持續占用記憶體與轉發迴圈。 | 必須搭配顯式 `leave` 控制幀、TTL 掃描與應用層 heartbeat。 |
| **除錯與版本升級（Skew）** | 每個 Tab 重新整理即載入新版 JS；透過 `DurableTaskQueue` 版本化 handler 處理混版並存。 | 只要還有一個舊分頁開啟，舊版 SharedWorker 就會繼續服務後續新開分頁，易引發協定／程式碼版本錯置，需額外實作 worker 版號協商與自動更新流程。 | 顯著增加開發者升級與瀏覽器 Inspector 除錯複雜度。 |

### 小結：`SharedWorker` 結論

- **判定：No-Go（不納入預設核心；條件式延後至 v4.x 獨立可選 adapter）**。
- 既有的 `Web Locks Leader` + `BroadcastChannel` 架構在行動端覆蓋率、CDN 相容性與分頁重載版號一致性皆明顯更符合本專案定位。

---

## 2. 既有 `lib/webrtc-service.js` 與跨裝置 Transport 邊界

### 2.1 `lib/webrtc-service.js` 實查評估

檢視 [lib/webrtc-service.js](../lib/webrtc-service.js)（共 179 行）後確認其定位為單純教學展示組件：

1. **全域單例耦合**：模組尾端直接建立並匯出 `webrtcService` 單例，僅管理單一條 `this.pc` 與 `this.dataChannel`（無法作為多節點／多裝置 Mesh 路由層）。
2. **手動 SDP 與無完整信令協定**：`createOffer()`／`createAnswer()` 等待固定 2000ms `_waitForIceGathering()`，需人工交換完整 SDP 字串，缺乏 Trickle ICE 與連線房間協商。
3. **無 TURN 中繼與企業 NAT 穿透能力**：僅設定 Google 與 Twilio 公共 STUN（見該檔第 14–19 行），對稱型 NAT 或嚴格企業防火牆下容易建線失敗。
4. **無連線可靠性、背壓與安全機制**：未處理斷線自動退避重連、`bufferedAmount` 背壓節流、`sender` 密碼學認證或資料隔離驗證，且在通道未開啟時僅 `console.warn`（無法通知上層失敗）。

**判定**：直接修改 `lib/webrtc-service.js` 作為協調傳輸層為 **No-Go**；該檔案應維持教學示例專責。

### 2.2 跨裝置 Transport Adapter（WebSocket Relay vs WebRTC DataChannel）必要架構邊界

| 邊界項目 | 同機瀏覽器（Phase 1–4 現況） | Backend WebSocket Relay（建議未來優先評估） | WebRTC DataChannel Mesh / P2P |
| :--- | :--- | :--- | :--- |
| **連線建立與信令（Signaling）** | 同源自動探索，不需信令。 | 直接連至授權 WS 端點與房間參數（`room`）。 | 仍需要 HTTPS + WSS **信令伺服器**交換 SDP／ICE 與房間狀態，且對稱型 NAT 必須部署與維護 **TURN 伺服器**。 |
| **認證（AuthN）與授權（AuthZ）** | 同 Origin 共享瀏覽器儲存與通道（明確非安全邊界）。 | 連線握手採 `HttpOnly` Cookie／短效連線票證；由伺服器驗證房間存取權限與速率限制。 | 需在信令層完成 AuthN／AuthZ，且於每個 DataChannel 控制訊息強制對應授權角色（不依賴使用者前端宣稱）。 |
| **防偽造 `sender` 與隔離** | 信任同源上下文。 | **伺服器必須覆寫或驗證訊息信封的 `sender`／`verifiedIdentity`**，防止裝置 A 偽造裝置 B 身分。 | DTLS 僅確保點對點傳輸加密；在多節點拓撲下仍須綁定已驗證的 peerId。 |
| **斷線重連與資料一致性** | 本地 `IndexedDB` + Web Locks 提供單機單寫保證；failover 依賴 `onResync`。 | **斷線必有訊息遺失視窗**：禁止假裝離線可靠；重連後依賴後端 Fencing Token／序號遊標進行 `onResync`。 | P2P 兩端同時離線或 split-brain 時**極易腦裂**；必須將同步狀態限定為具冪等／最終一致性之 **CRDT**（見 [CRDT 指南](./crdt-sync.md)）或交由後端裁決。 |
| **序列化與容量** | `BroadcastChannel` 原生支援 Structured Clone（保留 `Date` 等型別）。 | JSON（或明確協定化之二進位）；必須防範 JSON 內嵌 `__proto__` 原型污染與型別遺失（如 `Date` 轉字串）。 | DataChannel 單則訊息受 SCTP chunk 上限限制（實務多需控在 16KB–64KB 內或實作分片），不適宜直接拋送大型 payload。 |
| **互斥鎖（Web Locks）** | 原生支援同 Origin 嚴格排他鎖。 | **無法跨裝置延伸**：必須明白宣示 `supportsWebLocks: false`；全站／帳號級唯一權限須由後端資料庫或分散式鎖負責。 | 同左（跨裝置無法共用任何本機 Web Lock）。 |

---

## 3. 可重現小型 PoC 實測證據與 Transport 差異反證

本次評估於 `tests/` 下建立最小可重現 PoC，在不更動任何 `lib/*.js` 生產程式碼的前提下完成實測：

- **Transport 配接器實作**：[tests/helpers/phase5-poc-transports.js](../tests/helpers/phase5-poc-transports.js)
  - `createSharedWorkerPortTransport(port)`：封裝 `MessagePort` 成符合 `BroadcastService` 期望的 `options.transport` 介面，同時公開唯讀 `capabilities`（如 `mobileAndroidChromeSupported: false`、`requiresSameOriginScript: true`、`survivesAllTabsClosed: false`）。
  - `createJsonWireTransportAdapter(socketLike)`：將 WebSocket／`RTCDataChannel`-like 雙向傳輸適配至 `BroadcastService` `options.transport`，並明確揭露 `supportsWebLocks: false`、`supportsStructuredClone: false`、`requiresExternalAuth: true`、`dropsWhileDisconnected: true`；提供即時統計 `getStats()`（`sent`、`received`、`droppedWhileDisconnected`、`rejectedPayloads`）與 `JSON.parse` 原型污染防護。
- **SharedWorker Hub**：[tests/helpers/phase5-shared-worker.js](../tests/helpers/phase5-shared-worker.js)（支援多端口中繼、顯式 `leave` 清理與記憶體狀態觀察）。
- **測試中繼支援**：[tests/helpers/realtime-server.mjs](../tests/helpers/realtime-server.mjs) 擴充 `?relay=1` 房間文字幀轉發。

### PoC 驗證涵蓋項目

1. **協定可重用性驗證（[tests/phase5-poc.test.js](../tests/phase5-poc.test.js) 與 [tests/browser-runner.mjs](../tests/browser-runner.mjs) 第 2.9 節）**：
   - 未改動任何 `lib/coordination.js` 模組，即成功在 `SharedWorker`（Node `MessageChannel` 與 Headless Chrome 真實 `new SharedWorker(...)`）及 `WebSocket ?relay=1` 上完整驅動 v1 信封、`MessageBus`、`PeerDiscovery` 與 `RpcChannel`。
   - 真實 Chrome 多分頁下驗證：Tab 1 離開並關閉後，SharedWorker 仍存活並為 Tab 2 保留 hub 記憶體狀態與回收離開之 port；跨分頁 WebSocket Relay RPC 正常完成且關閉連線後無殘留。
2. **禁止掩蓋差異與假承諾（[tests/phase5-poc.test.js](../tests/phase5-poc.test.js) Test 3）**：
   - **序列化差異實證**：`Date` 實例經由 JSON wire transport 往返後降級為 ISO 字串，與 `BroadcastChannel` Structured Clone 不同；夾帶 `__proto__` 的 JSON 訊框立即遭 `rejectedPayloads` 攔截並觸發 `messageerror`。
   - **斷線靜默假象實證**：當底層 Socket 未連線時，`BroadcastService.post()` 因同步 fire-and-forget 契約仍無法感知遠端斷線；因此 adapter 必須於 `capabilities` 與統計計數（`droppedWhileDisconnected`）明確公開丟失狀態，不可偽造離線必達語意。
   - **雙重 Leader 反證**：當兩台獨立裝置持有各自獨立的 `LockManager` 時，即使透過跨裝置 transport 互聯，兩端呼叫 `LeaderElection.start()` **仍會同時成為 `'leader'`**（`acquired: true`），實證絕不可將 `LeaderElection` 直接套用於跨裝置叢集控制。

### 本機重現方式

```bash
# 1. 執行 Phase 5 PoC 單元測試（Node built-in test runner）
node --test tests/phase5-poc.test.js

# 2. 執行含真實 Chrome 雙分頁 SharedWorker 與 WS Relay 的完整 CI 驗證
bash scripts/check.sh
```
