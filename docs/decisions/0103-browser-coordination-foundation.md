# ADR 0103: 跨執行環境協作基礎架構與 Store 同步隔離

## 狀態
已接受 (Accepted)，2026-11-24。

## 背景
v3.1.0 已具備 [BroadcastService](../../lib/broadcast-service.js)、[Store](../../lib/store.js)、`IDBService`、`SyncService` 與 Web Locks 實驗室，但現有跨分頁機制仍停留在展示與全域單例階段，若直接作為可重複使用的跨上下文協作基礎（Epic #2），存在數個結構性缺口：

1. **全域初始化副作用**：`lib/broadcast-service.js` 載入時直接建立 `new BroadcastChannel('vanilla_web_sync')` 並匯出單例，在不支援 `BroadcastChannel` 的執行環境會直接拋錯，也無法讓外部以 opt-in 方式載入而不產生連線。
2. **無命名空間與訊息版本**：訊息缺乏版本與命名空間欄位，無輸入驗證、無 `close()`/`dispose()` 生命週期，也無法注入模擬 transport 進行測試。
3. **Store 同步相互污染**：`Store` 收發 `sync_state` 與 `sync_snapshot` 未帶 `storageKey`，多個不同 `storageKey` 的 `Store` 實例會互相覆蓋狀態；刪除頂層屬性廣播 `{ key, value: undefined }` 後接收端卻執行賦值而非 `delete`；建構子對全域單例註冊匿名監聽器且無法釋放；不同分頁同時更新不同鍵時各自寫回整包 `localStorage` 容易彼此覆蓋。
4. **缺少發布／訂閱抽象**：目前只有裸 `BroadcastService.post()` 與單純事件派發，沒有明確定義本地投遞（local）與遠端投遞（remote）語意的 `MessageBus`。

## 決策

### 1. 模組分層與無副作用入口（延續 ADR 0101）
延續 [ADR 0101](./0101-core-entry-point.md) 的邊界原則，維持 zero-build、zero-dependency 與原生 ESM：
- **`lib/broadcast-channel.js`（純類別與協定層）**：僅依賴 `lib/base-service.js`，匯出 `BroadcastService`、`ENVELOPE_VERSION`、`getCoordinationCapabilities()`、`createEnvelope()`、`validateEnvelope()`，模組頂層不建立任何實例或 `BroadcastChannel`。
- **`lib/broadcast-service.js`（核心單例相容層）**：從 `lib/broadcast-channel.js` 重新匯出並保留 `broadcastService` 預設單例，維持 `lib/core.js` 的公開匯出清單（`CORE_EXPORTS`）與既有程式碼完全相容。
- **`lib/message-bus.js`（發布／訂閱匯流排）**：提供 `MessageBus` 與 `createMessageBus()`，僅依賴 `lib/base-service.js` 與 `lib/broadcast-channel.js`。
- **`lib/coordination.js`（獨立可選入口）**：匯出協作基礎能力與 `VERSION`，不依賴 UI、`BaseComponent`、`router`、`Store` 或任何展示用 service，且 import 本身不開啟 channel、網路連線或計時器。
- **`lib/vanilla-sdk.js`**：僅重新匯出協作類別與工廠函式，不自動初始化連線或實例。

### 2. 版本化 Envelope 協定（`ENVELOPE_VERSION = 1`）
跨執行環境訊息採用版本化信封格式，並作為既有 v0 格式（`{ type, payload, sender, timestamp }`）的嚴格超集合：

```json
{
  "v": 1,
  "ns": "default",
  "id": "uuid-or-unique-id",
  "type": "topic-or-event-type",
  "payload": {},
  "sender": "tab-or-context-id",
  "timestamp": 1700000000000
}
```

- **Namespace 隔離**：每個 `BroadcastService`／`MessageBus` 綁定單一非空字串 `namespace`（預設 `'default'`）。接收端收到不同 `ns` 的 v1 訊息時直接忽略。
- **輸入驗證與錯誤觀測**：`post()` 驗證 `type` 為非空字串，不吞掉 `DataCloneError` 等結構化複製錯誤；接收端遇到非純物件、缺少必要欄位或未知 `v` 版本時忽略該訊息並發出 `invalid-message` 事件；傳輸序列化失敗轉為 `messageerror` 事件。
- **Sender ID 與自我回聲過濾**：優先以 `crypto.randomUUID()` 產生執行上下文識別碼（無則退回時間戳與隨機值，不使用已廢棄的 `String.prototype.substr`）；接收端忽略 `sender === this.tabId` 的訊息。
- **舊協定遷移策略**：未帶 `v` 欄位的 v0 訊息預設僅在 `namespace === 'default'`（`acceptLegacy: true`）時接受，並正規化為 `{ v: 0, ns, id: null, ..., legacy: true }`；自訂 namespace 預設 `acceptLegacy: false`，避免舊版廣播跨命名空間污染。

### 3. `MessageBus` 的本地／遠端投遞語意
- **`publish(topic, payload, { local = false, remote = true })`**：
  - 預設為 `remote: true`、`local: false`，與原生 `BroadcastChannel` 不投遞給自己的行為一致，避免既有的雙端元件重複處理自身訊息。
  - 若 `local: true`，先以 `structuredClone` 驗證並隔離每一份傳給本地訂閱者的 payload，確保與遠端結構化複製語意一致且不共享可變物件參照。
  - 每次投遞都會傳入不可變意義的中繼資訊 `meta`（含 `id`、`topic`、`ns`、`v`、`sender`、`timestamp`、`origin: 'local' | 'remote'`、`local`、`remote`）。
  - 回傳 `{ id, localCount, remoteSent }`；當底層不支援 `BroadcastChannel` 或實例已關閉時，明確回傳 `remoteSent: false`，不偽裝成功。
- **`subscribe(topic, handler, { receive = 'all' })`**：支援精確主題與同命名空間萬用字元 `'*'`，可透過 `receive: 'all' | 'remote' | 'local'` 過濾來源，回傳冪等 `unsubscribe()` 函式；個別 handler 例外會被隔離並發出 `handler-error` 事件。

### 4. `Store` 同步隔離與衝突策略
- **依 `storageKey` 隔離**：`sync_state` payload 攜帶 `{ storageKey, key, value?, deleted, clock }`；`sync_snapshot` payload 攜帶 `{ storageKey, snapshot, replace, clock }`。
  - 僅當 `storageKey === 'app_state'`（或顯式指定 `acceptLegacy: true`）時，才相容無 `storageKey` 欄位的舊協定訊息；其餘自訂 `storageKey` 的 `Store` 一律忽略無 `storageKey` 或不同 `storageKey` 的訊息。
- **刪除與快照語意**：
  - 頂層 `delete store.state[key]` 廣播 `deleted: true`，遠端實際執行 `delete baseState[key]`（而非寫入 `undefined`）。
  - `applySnapshot(snapshot, { replace = true })` 預設為完整快照替換，會刪除快照中未出現的既有頂層鍵；需相容合併模式時可傳 `{ replace: false }`。
  - 所有本機與遠端鍵名均阻擋 `__proto__`、`constructor`、`prototype`，防範原型鏈污染。
- **並行更新與持久化一致性**：
  - **不同頂層鍵並行**：單鍵更新與 `applySnapshot(..., { replace: false })` 改用增量合併寫入 `localStorage[storageKey]`，保留其他分頁尚未透過廣播送達的並行鍵且不復活本分頁已刪除鍵，避免各自整包覆寫遺失彼此修改。
  - **同一頂層鍵並行**：採 **頂層鍵粒度的混合邏輯時鐘（HLC：`Math.max(Date.now(), _clock + 1)`）搭配 `sender` 字典序 Tie-breaker（LWW）**，並將最大時鐘基線獨立寫入 `__vanilla_store_clock__:${storageKey}`，不破壞 `localStorage[storageKey]` 的純資料 JSON 結構，同時確保晚加入／重整分頁的寫入不會因時鐘歸零而被既有分頁拒收。當勝出方收到落敗方廣播時，若落敗方先前已把舊值寫入 `localStorage`，勝出方會主動以勝出狀態修復 `localStorage`，使記憶體與持久化決定性收斂。
  - **已知限制**：在未整合 Web Locks（Phase 2）前，多執行緒幾乎同時讀寫同一個 `localStorage` key 仍存在極短的非原子讀寫視窗；`Store` 適合 UI 狀態與設定同步，不作為嚴格 ACID 事務或欄位級 CRDT 引擎。
- **生命週期清理**：`Store.prototype.dispose()` 冪等解除對 `BroadcastService` 的監聽並清理透過 `BaseService.on()` 註冊的監聽器，允許動態建立的 `Store` 被垃圾回收。

### 5. 安全邊界、能力偵測與非目標
- **同源不等同授權；`namespace` 不是安全邊界**：任何同源腳本皆可打開相同 channel 與 namespace。禁止透過協調通道廣播權杖、憑證或敏感個資；訊息只能作為資料事件處理，不得轉為動態執行指令。
- **Capability 透明回報**：不支援 `BroadcastChannel` 時不拋錯、不偽裝跨分頁投遞成功，`supported` 回傳 `false`，`getCoordinationCapabilities()` 明確回報各項 API 可用性。
- **非目標**：不涵蓋跨 Origin、跨瀏覽器或跨裝置通訊；`BroadcastChannel` 本身不保證訊息持久化或歷史重播；本階段不提前實作 Leader Election、RPC（Phase 2）、Shared Connection（Phase 3）或 Durable Queue（Phase 4）。

## 後果
- **優點**：`lib/coordination.js` 可零副作用獨立引入並進行單元／多分頁測試；各 `Store` 徹底隔離且刪除／快照／並行語意明確；舊版 `core.js` 與展示站（`appStore`、`crdtService`、`Dashboard`）無痛相容。
- **代價**：新增 `lib/broadcast-channel.js` 須納入 `tests/core.test.js` 的 `CORE_FILES` 允許清單；`BroadcastService` 與 `Store` 的內部協定多了信封與版本檢查開銷，但屬於輕量原生檢查、無額外執行期依賴。
- **相容性**：未改動 `lib/core.js` 既有公開匯出清單 `CORE_EXPORTS`，既有 API 簽名完全保留；相關設計文件見 [協調基礎使用指南](../coordination.md) 與 [ADR 0031](./0031-cross-tab-sync.md)。
