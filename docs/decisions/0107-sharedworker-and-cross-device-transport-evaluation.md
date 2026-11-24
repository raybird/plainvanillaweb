# ADR 0107: Phase 5 延伸評估 — SharedWorker 與跨裝置 Transport Adapters

- 狀態: 已接受 (Accepted)
- 日期: 2026-11-24
- 相關議題: [Epic #2](https://github.com/raybird/plainvanillaweb/issues/2) · [Issue #7](https://github.com/raybird/plainvanillaweb/issues/7)
- 前置決策: [ADR 0101](./0101-core-entry-point.md) · [ADR 0103](./0103-browser-coordination-foundation.md) · [ADR 0104](./0104-leader-election-and-rpc.md) · [ADR 0105](./0105-peer-discovery-and-shared-connection.md) · [ADR 0106](./0106-durable-task-queue-and-cluster-lab.md)

## 背景

Phase 1–4 已透過 `lib/coordination.js` 交付同源跨執行環境協調 SDK（`BroadcastService`、`MessageBus`、`LeaderElection`、`RpcChannel`、`PeerDiscovery`、`SharedConnection`、`DurableTaskQueue`），並以 `Browser Cluster Lab` 驗證了無建置、零依賴的原生整合架構。

依 Epic #2 與 Issue #7 規範，Phase 5 的任務是**純架構評估與可重現 PoC 驗證**，不預先承諾實作或發版：

1. 比較 `SharedWorker` 與既有「Web Locks Leader + `BroadcastChannel`」模式在生命週期、平台支援度、資源成本與失效模式之差異。
2. 檢視既有 [WebRTCService](../../lib/webrtc-service.js) 與後端中繼方案，定義跨裝置 Transport Adapter 所需的信令、認證、授權、重連與資料一致性邊界。
3. 以位於 `tests/` 的小型 PoC 實證既有 v1 信封與 `options.transport` 介面可否直接重用，同時避免把 transport 差異隱藏為虛假的可靠性或互斥保證。

完整技術比較表與實測數據見 [Phase 5 延伸評估報告](../coordination-phase5-evaluation.md)。

---

## 評估發現摘要

### 1. `SharedWorker` vs `Web Locks Leader`

- **最大相容性缺口（行動端）**：`SharedWorker` 在桌面主流瀏覽器（Chrome／Edge／Firefox／Safari 16+）可用，但 **Android Chrome 長期不支援 `SharedWorker`**（回傳 `undefined`），若將核心協調依賴 `SharedWorker`，所有 Android 行動端瀏覽器都會直接失效；反觀 Web Locks + `BroadcastChannel` 在桌面與行動端主流瀏覽器皆屬 Baseline 廣泛可用。
- **跨網域 CDN（jsDelivr）限制**：本專案支援透過 `https://cdn.jsdelivr.net/.../lib/core.js` 免建置引入，而 `new SharedWorker(scriptURL)` **嚴格要求同源腳本**（無法直接以第三方 CDN 腳本網址啟動），必須要求使用者自架同源 worker 檔案或以 `Blob` URL 包裝再處理相對 ESM 匯入路徑解析。
- **失效與生命週期差異**：`SharedWorker` 在單一分頁重載或關閉時可保留背景 Hub 記憶體狀態（由實測 PoC 第 2.9.1 節驗證），但瀏覽器並無統一強制事件清理非預期凍結／關閉分頁的 `MessagePort`（易殘留殭屍 port，需顯式 `leave` 訊息與應用層心跳掃除）；且當最後一個連線分頁關閉後，`SharedWorker` 本身同樣會終止，無法替代 `IndexedDB` 持久化。

### 2. 既有 `lib/webrtc-service.js` 與跨裝置 Transport Adapter

- **`lib/webrtc-service.js` 實查評估**：目前為展示導向單例類別（[webrtc-service.js](../../lib/webrtc-service.js)），採 1-to-1 手動複製貼上 SDP、2000ms 固定等待 ICE gathering、僅含公共 STUN（無 TURN 無法穿透對稱型 NAT）、缺乏自動重連／背壓控制／身分驗證／權限邊界、並預設以 JSON 字串收發（未連通時僅 `console.warn`）。因此**不應直接改造 `lib/webrtc-service.js` 作為協調傳輸層**。
- **協定重用與誠實邊界實證**：
  - 既有 `BroadcastService` 的 `options.transport`（只需 `postMessage` / `close` / `onmessage` / `onmessageerror`）與 `MessageBus`／`RpcChannel`／`PeerDiscovery` 的 v1 信封協定**可於零修改 `lib/` 原始碼下直接承載 SharedWorker Port 與 WebSocket Relay PoC**。
  - 然而，PoC 同時證實若隱藏 transport 語意將造成嚴重誤判：
    1. **序列化語意不同**：`BroadcastChannel`／`MessagePort` 採 Structured Clone（可保留 `Date` 等型別）；JSON wire transport 會將 `Date` 降級為 ISO 字串，且接收 `JSON.parse` 須主動遞迴過濾 `__proto__` 等原型污染鍵。
    2. **投遞與斷線可見性不同**：`BroadcastService.post()` 預期同步 fire-and-forget，若跨裝置 WebSocket／DataChannel 處於斷線狀態而不顯式揭露（或拋錯／統計 `droppedWhileDisconnected`），上層 `MessageBus.publish()` 仍會回傳看似成功的 `remoteSent: true`。
    3. **無跨裝置互斥鎖**：Web Locks 僅作用域於單一裝置、單一瀏覽器、單一 Origin 與儲存分區；跨裝置環境不具備瀏覽器原生分散式鎖，強行重用 `LeaderElection` 只會造成各裝置各自選主（雙重 Leader）。

---

## 決策（Go / No-Go 與非目標）

1. **`SharedWorker` Adapter — No-Go（現階段不納入預設核心；條件式延後至 v4.x 可選擴充）**：
   - 因 Android Chrome 缺乏支援且與 jsDelivr 跨網域引入模式衝突，現有「Web Locks Leader + `BroadcastChannel`」已充分涵蓋同源跨分頁需求。僅當未來出現「僅鎖定桌面端且明確需要單一頁面重載期間維持不斷線 WebSocket／計算核心」的獨立需求時，才另開 issue 作為外掛可選 adapter 評估實作。
2. **改造 `lib/webrtc-service.js` — No-Go**：
   - `lib/webrtc-service.js` 維持原本展示教學職責與公開介面不變。
3. **跨裝置 Transport Adapter（Backend WebSocket Relay 優先，WebRTC DataChannel 次之）— Conditional Go（未來另開獨立 issue 實作）**：
   - 允許於後續獨立 issue 建立跨裝置 adapter，但必須滿足五項前置條件：
     1. 明確區分 **local（同機 Structured Clone + Web Locks + IDB）** 與 **remote（跨裝置 JSON + 無瀏覽器全域鎖）** capability，絕不對外宣稱 `supportsWebLocks: true` 或離線必達。
     2. 由外部後端提供房室信令（Signaling／Room Broker）、使用者認證（AuthN）與授權（AuthZ），並**由伺服器驗明或覆寫 `sender`／`identityKey`，禁止信任用戶端自報身分**。
     3. 若使用 WebRTC 必須部署自有 TURN 並評估頻寬／中繼維運成本；一般情境優先採用 Backend WebSocket Relay + 服務端 Session／Fencing Token 與應用層重同步（`onResync`／游標）或 CRDT 收斂。
     4. 嚴格實作斷線明確錯誤／丟棄計數與重連退避策略，不得靜默吞掉離線失敗。
     5. 不破壞 `lib/core.js`、零執行期第三方依賴與 opt-in 零副作用原則。

---

## 後果、成本與非目標

- **本階段（Phase 5）零生產風險**：僅交付本 ADR、技術比較文件與位於 `tests/` 的 PoC 驗證；所有生產模組（`lib/core.js`、`lib/coordination.js`、`lib/vanilla-sdk.js`、`lib/webrtc-service.js` 等）維持零變動，亦不阻擋後續 Reference Applications（Issue #8）。
- **明確非目標**：不在未獨立授權開案前引入跨裝置同步引擎、自建後端認證伺服器、TURN 基礎建設或修改 `BroadcastService` 既有同步契約。
