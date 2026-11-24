# ADR 0106: IndexedDB Durable Task Queue 與 Browser Cluster Lab

- 狀態: 已接受
- 日期: 2026-11-24

## 背景

在完成 Phase 1（`BroadcastService` / `MessageBus`）、Phase 2（`LeaderElection` / `RpcChannel`）與 Phase 3（`PeerDiscovery` / `SharedConnection`）後，跨分頁協作架構已具備即時通訊、選主與連線抽象能力，但尚未提供可跨頁面重載保留的持久化工作佇列，也缺乏整合展示所有模組互動的互動式實驗室（Issue #6 / Phase 4）。

本專案先前已有 `lib/idb-service.js`、`lib/db-service.js` 與 `lib/sync-service.js`，需評估是否可直接複用或應新增獨立模組。

## 決策

### 1. 既有 IndexedDB / Sync 服務複用評估

經檢視既有模組後，決定保留既有檔案維持向後相容，並新增無副作用的 `lib/task-queue.js`：

- `lib/idb-service.js`：匯入時透過 Proxy 建立單例並依賴 `compression-service.js`，使用 `VanillaDB` v3（`api_cache`、`actions_queue`，keyPath 為自增 `id`），各操作各自開啟獨立 transaction，缺乏複合／namespace 索引與單一 `readwrite` transaction 原子認領能力。
- `lib/db-service.js`：為 Notes 功能專用的 `vanilla-db` v1 單例（store `notes`）。
- `lib/sync-service.js`：展示用離線佇列單例，匯入即掛載 `connectivityService` 與 `notificationService` 事件並以 `setTimeout` 模擬同步。

上述三者皆不符合 Phase 1–4 協作層「匯入零副作用（zero side effects）」、「可傳入獨立實例與 namespace 隔離」及「單一 IndexedDB `readwrite` transaction 原子認領」之約束，因此不直接改動既有展示單例，而是實作獨立的 `DurableTaskQueue`（IndexedDB `vanilla_coordination_tasks` v1，並附可注入的 `MemoryTaskStorage` 供單元測試與不支援 IndexedDB 環境明確降級）。

### 2. DurableTaskQueue 核心設計

- **原子認領與狀態機**：支援 `pending`、`running`、`completed`、`failed`、`cancelled`。`claimAtomic` 在單一 IndexedDB `readwrite` transaction 內掃描當前 `namespace` 中符合條件且處於 `pending`（含退避時間 `nextRunAt <= now`）或租約已過期（`running` 且 `leaseExpiresAt <= now`）之任務，依 `priority` 降冪、`nextRunAt` 升冪、`createdAt` 升冪與 `id` 升冪選出候選者並原子寫入 `running`、`ownerId`、`leaseId`、`leaseExpiresAt` 及遞增後的 `attemptCount`。
- **租約防護（`leaseId` fencing）**：每次成功認領或續約皆產生新的 `leaseId`。`renewLeaseAtomic`、`completeAtomic`、`failAtomic`、`reclaimExpiredAtomic` 嚴格比對當前儲存的 `leaseId`，防止已過期或被其他 worker 接手的舊執行續寫入覆蓋新狀態。
- **可選 Web Locks 孤兒偵測與快收**：認領成功時若 `navigator.locks` 可用，Worker 可為該任務取得專屬獨占名稱鎖（`mode: 'exclusive'` 搭配 `{ ifAvailable: true }`，絕不使用 `{ steal: true }`），並可在安全條件下協助偵測已異常終止分頁所遺留的過期任務，加速狀態回收。
- **版本化處理器與重試上限**：透過 `registerHandler(type, fn, { version })` 註冊明確版本化的任務處理器；`schemaVersion` 預設隨每筆任務保存。失敗時依指數退避重排程，達到 `maxAttempts` 上限（含租約逾時達上限者）即轉入 `failed`。
- **冪等鍵與命名空間隔離**：`idempotencyKey` 採 `(namespace, idempotencyKey)` 複合唯一約束，同一 namespace 去重、不同 namespace 互不干擾。
- **語義邊界與降級**：明確定位為 **at-least-once** 投遞語義，不宣稱 exactly-once，也不宣稱能在無任何活躍瀏覽器 context 下保證背景執行。當 `indexedDB` 不可用時回傳 `{ supported: false }`，不靜默偽造持久化。

### 3. Browser Cluster Lab（`#/lab/browser-cluster`）

- **真實多分頁叢集整合實驗室**：頁面保持 **opt-in** 啟動，載入 `BrowserClusterPage` 時不自動 join、不自動連線，避免側寫效應與背景資源耗損。
- **Mock `SharedConnection` 明確標註**：為配合靜態展示部署，`SharedConnection` 在實驗室預設切換為模擬傳輸層（`MockSharedConnection`）並在介面清楚標示「模擬傳輸層（靜態展示）」；真實 WebSocket / SSE 行為已透過 `tests/helpers/realtime-server.mjs` 與瀏覽器整合測試驗證。
- **確定性任務與協作面板**：整合節點身分、Leader 狀態、`PeerDiscovery` 清單與心跳、`RpcChannel`（`cluster.stats` / `cluster.ping`）、`DurableTaskQueue`（`chunk.checksum`、`transform.normalize`）、目前命名空間資料重置與復原指引。
- **無障礙與響應式表格**：依循 `modern-web-guidance` 建立具 `<label for>` 關聯、單一 `aria-live="polite"` 狀態公告區、以及 `tabindex="0"` + `container-type: inline-size` 響應式表格包裝容器。

## 後果與限制

- 正面影響：建立零建置、零第三方依賴且具多標籤頁持久化容錯能力的工作佇列與整合實驗室。
- 限制與風險：跨分頁佇列仍依賴至少一個開啟的瀏覽器分頁驅動執行；在未提供 Web Locks 的環境下，僅靠 IndexedDB 租約時間戳記進行回收，短暫逾時視窗內可能出現 at-least-once 重複執行，需仰賴下游業務或 `idempotencyKey` 處理冪等性。
