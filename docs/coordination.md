# 跨執行環境協作基礎 (Browser Coordination Foundation)

> **更新日期**：2026-11-24（Phase 1）  
> **獨立入口**：`./lib/coordination.js`  
> **架構決策**：[ADR 0103](./decisions/0103-browser-coordination-foundation.md) · [ADR 0101](./decisions/0101-core-entry-point.md)

`lib/coordination.js` 提供**可獨立選用（opt-in）、零依賴、零建置**的同源跨執行環境（多分頁、視窗及適用的 Worker）訊息傳遞基礎設施。僅匯入此模組不會建立 `BroadcastChannel`、網路連線或背景任務。

---

## 1. 快速開始

```javascript
import {
    createMessageBus,
    getCoordinationCapabilities,
} from './lib/coordination.js';

const caps = getCoordinationCapabilities();
if (!caps.broadcastChannel) {
    console.warn('此環境不支援 BroadcastChannel，將僅能做本地發布。');
}

const bus = createMessageBus({ namespace: 'orders' });

const unsubscribe = bus.subscribe('order:updated', (payload, meta) => {
    console.log(`[${meta.origin}] 來自 ${meta.sender}:`, payload);
});

// 預設僅遠端投遞（local: false, remote: true）
const result = bus.publish('order:updated', { id: 42, status: 'paid' });
console.log(result); // { id: '...', localCount: 0, remoteSent: true }

// 需要釋放資源時（例如元件離開頁面）
unsubscribe();
bus.dispose();
```

如需最小化雙分頁實機驗證，可直接用本機 HTTP 伺服器開啟 [coordination-demo.html](../coordination-demo.html)。

---

## 2. 模組組成與入口邊界

| 模組 / 入口 | 職責 | Import 副作用 |
| :--- | :--- | :--- |
| `lib/coordination.js` | 獨立協作入口（匯出 `BroadcastService`、`MessageBus`、`createMessageBus`、`getCoordinationCapabilities`、`ENVELOPE_VERSION`、`DEFAULT_CHANNEL_NAME`、`DEFAULT_NAMESPACE`、`DEFAULT_BUS_CHANNEL`、`createEnvelope`、`validateEnvelope`、`VERSION`） | **無** |
| `lib/broadcast-channel.js` | 純類別 `BroadcastService`、版本化 envelope 與 capability 偵測 | **無** |
| `lib/message-bus.js` | 跨執行環境發布／訂閱 `MessageBus` | **無** |
| `lib/broadcast-service.js` | 保留 `broadcastService` 預設單例供 `lib/core.js` 與現有展示頁向下相容 | 建立預設全域單例 |
| `lib/core.js` | 維持輕量核心 API，不引入協調進階抽象 | 維持既有行為 |
| `lib/vanilla-sdk.js` | 額外重新匯出協作類別與工廠函式（不自動連線） | 維持既有行為 |

---

## 3. `BroadcastService` 與版本化 Envelope

`BroadcastService` 支援通道名稱、邏輯 `namespace`、自訂 `tabId`、可注入 `transport` 與資源清理：

```javascript
import { BroadcastService } from './lib/coordination.js';

const channel = new BroadcastService('my_app_channel', {
    namespace: 'editor',
});

const offMessage = channel.on('message', (envelope) => {
    console.log(envelope.v, envelope.ns, envelope.type, envelope.payload);
});

const sent = channel.post('cursor:move', { x: 120, y: 80 });
if (!sent) {
    console.warn('底層傳輸不可用或已關閉');
}

offMessage();
channel.dispose();
```

- **Envelope v1 結構**：`{ v: 1, ns, id, type, payload, sender, timestamp }`。
- **可觀測事件**：
  - `'message'`：收到合法且同 `namespace`、非自身發出的訊息（`detail` 為正規化信封）。
  - `'invalid-message'`：收到畸形資料或未知協定版本（`detail` 含 `{ reason, raw }`）。
  - `'messageerror'`：底層 `BroadcastChannel` 發生反序列化錯誤。
  - `'close'`：呼叫 `close()`／`dispose()` 時觸發。
- **舊協定相容**：未帶 `v` 欄位的 v0 訊息預設僅在 `namespace === 'default'` 時接受（並標記 `legacy: true`）；自訂 `namespace` 預設拒收，可透過 `{ acceptLegacy: true }` 顯式開啟。

---

## 4. `MessageBus` 投遞語意

`MessageBus` 建立在 `BroadcastService`（可自行建立或傳入 `{ broadcast }` 注入既有實例）之上，明確區分本地與遠端投遞：

- **`publish(topic, payload, { local = false, remote = true })`**：
  - 預設 `local: false, remote: true`：只送到其他執行上下文，避免與原生 `BroadcastChannel` 行為混亂。
  - 設定 `{ local: true }`：同時透過 `structuredClone` 複製獨立複本投遞給同實例上的訂閱者；設定 `{ local: true, remote: false }` 可僅做同頁內匯流排測試。
  - 回傳 `{ id, localCount, remoteSent }`；不支援 `BroadcastChannel` 時 `remoteSent` 會明確回傳 `false`。
  - 不可對萬用主題 `'*'` 執行 `publish()`（會拋出 `TypeError`）。
- **`subscribe(topic, handler, { receive = 'all' })`**：
  - `topic` 可為具體名稱或 `'*'`（訂閱本 `namespace` 全部主題）。
  - `receive` 可選 `'all'`、`'remote'` 或 `'local'`。
  - 訂閱回呼錯誤會被隔離，並發出 `'handler-error'` 事件 `{ topic, error, meta }`。
  - 呼叫 `dispose()` 會移除監聽與訂閱；若未傳入外部 `broadcast` 實例，會一併關閉內部建立的 `BroadcastService`。

---

## 5. `Store` 同步隔離與衝突策略

`lib/store.js` 的每個 `Store` 實例均依 `storageKey` 進行同步隔離，詳細設計見 [狀態管理](./state-management.md) 與 [ADR 0103](./decisions/0103-browser-coordination-foundation.md)：

- **跨 Store 隔離**：`sync_state` 與 `sync_snapshot` 均攜帶 `storageKey`，不同 `storageKey` 的 `Store`（包含預設 `appStore`）不會互相覆蓋；未帶 `storageKey` 的舊版訊息僅 `storageKey === 'app_state'`（或顯式設定 `acceptLegacy: true`）才接受。
- **刪除與快照語意**：
  - `delete store.state[key]` 會在遠端真正執行 `delete`（`!(key in remote.state)`），不再殘留 `undefined` 屬性。
  - `applySnapshot(snapshot, { replace = true })` 預設會移除快照以外的既有頂層鍵；傳入 `{ replace: false }` 可僅合併快照中的鍵。
  - 所有鍵名均拒絕 `__proto__`、`constructor`、`prototype`。
- **並行與衝突策略**：
  - 不同頂層鍵同時變更（含 `applySnapshot(..., { replace: false })`）時透過增量合併寫回 `localStorage`，降低整包覆蓋彼此資料的風險。
  - 同一頂層鍵發生衝突時，採用**頂層鍵粒度的混合邏輯時鐘（HLC）＋獨立持久化基線（`__vanilla_store_clock__:<storageKey>`）＋ `sender` 字典序 LWW**，確保新開／重整分頁的寫入不會被既有分頁當成過期更新丟棄，且勝出方在收到落敗方廣播時會主動修復 `localStorage`，使各分頁記憶體與持久化決定性收斂。
- **資源清理**：動態建立的 `Store` 不再使用時請呼叫 `store.dispose()`，解除對廣播通道的監聽。

---

## 6. 限制與安全邊界

1. **同源不等同授權；`namespace` 不是安全邊界**：任何同源腳本皆可監聽或傳送至同一 channel 與 `namespace`。請勿廣播身份驗證權杖、密碼或敏感個資，也勿將訊息當作任意程式執行指令。
2. **純同源同儲存分區限制**：`BroadcastChannel` 無法跨越不同 Origin、不同瀏覽器或不同裝置，且受瀏覽器 Storage Partitioning 規範約束。
3. **不保證持久化與重播**：`BroadcastChannel` 僅投遞給當下活躍的上下文，離線或尚未開啟的分頁不會補收歷史訊息；持久化狀態請依賴 `Store`（`localStorage`）或後續持久層機制。
4. **Capability 降級行為**：不支援 `BroadcastChannel` 時不會拋錯也不會偽裝遠端成功，`supported` 為 `false`、`post()` 回傳 `false`、`publish()` 回傳 `remoteSent: false`。
