# 跨執行環境協作基礎 (Browser Coordination Foundation)

> **更新日期**：2026-11-24（Phase 1 + Phase 2）  
> **獨立入口**：`./lib/coordination.js`  
> **架構決策**：[ADR 0103](./decisions/0103-browser-coordination-foundation.md) · [ADR 0104](./decisions/0104-leader-election-and-rpc.md) · [ADR 0101](./decisions/0101-core-entry-point.md)

`lib/coordination.js` 提供**可獨立選用（opt-in）、零依賴、零建置**的同源跨執行環境（多分頁、視窗及適用的 Worker）訊息傳遞、領導者選舉與跨分頁 RPC 基礎設施。僅匯入此模組不會建立 `BroadcastChannel`、申請 Web Lock、網路連線或背景任務。

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
| `lib/coordination.js` | 獨立協作入口（匯出 `BroadcastService`、`MessageBus`、`createMessageBus`、`LeaderElection`、`createLeaderElection`、`RpcChannel`、`createRpcChannel`、`RpcError`、`RPC_ERROR_CODES`、`getCoordinationCapabilities`、`ENVELOPE_VERSION`、`DEFAULT_CHANNEL_NAME`、`DEFAULT_NAMESPACE`、`DEFAULT_BUS_CHANNEL`、`DEFAULT_LOCK_PREFIX`、`DEFAULT_LEADER_SCOPE`、`DEFAULT_RPC_TIMEOUT_MS`、`createEnvelope`、`validateEnvelope`、`serializeRpcError`、`deserializeRpcError`、`VERSION`） | **無** |
| `lib/broadcast-channel.js` | 純類別 `BroadcastService`、版本化 envelope 與 capability 偵測 | **無** |
| `lib/leader-election.js` | 基於 Web Locks 的 scoped 互斥領導者選舉（`LeaderElection`） | **無** |
| `lib/rpc-channel.js` | 基於 `MessageBus` 的白名單跨分頁 RPC（`RpcChannel`、`RpcError`） | **無** |
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

## 6. `LeaderElection`（Web Locks 互斥與接管，Phase 2）

`LeaderElection` 僅以瀏覽器原生的 **Web Locks API**（`mode: 'exclusive'`、鎖名 `${lockPrefix}:${namespace}:${scope}`）作為唯一互斥依據，不使用 `{ steal: true }`，詳見 [ADR 0104](./decisions/0104-leader-election-and-rpc.md)。

```javascript
import { createMessageBus, createLeaderElection } from './lib/coordination.js';

const bus = createMessageBus({ namespace: 'orders' });
const election = createLeaderElection({
    namespace: 'orders',
    scope: 'sync-worker',
    bus,                      // 選用：僅用於觀測 heartbeat，不參與互斥
    heartbeatIntervalMs: 2000 // 預設 0（停用定時器）
});

election.on('role-change', ({ role, epoch, takeover }) => {
    console.log(`角色變更：${role} (epoch=${epoch}, takeover=${takeover})`);
});

const status = await election.start();
if (!status.supported) {
    console.warn('不支援 Web Locks API，不應假裝擁有跨分頁互斥鎖');
}

// 主動讓出或離開頁面時釋放資源
await election.release();
await election.dispose();
bus.dispose();
```

- **兩段式取得與自動接管**：`start()` 先以 `{ mode: 'exclusive', ifAvailable: true }` 立即探測，無人持鎖時直接成為 `'leader'`；已被持有時切為 `'follower'` 並立即在背景排隊（`{ mode: 'exclusive', signal }`），不會阻塞 `start()`。原 leader 分頁關閉、重載或呼叫 `release()` 後，排隊中的 follower 會自動接管並推進 `epoch`。
- **Heartbeat 僅供觀測**：即使停發 heartbeat 或觀察到其他訊息，系統也不會改變自身互斥角色或搶鎖。
- **背景凍結（Background Freeze）限制與 `releaseOnFreeze`**：當分頁進入背景凍結（Page Lifecycle `freeze`）時，瀏覽器會暫停 JS 計時器但**通常仍保留既有 Web Lock**。這代表互斥安全性不會被破壞（不會雙重 leader），但接管時間會延後到該分頁恢復或關閉。若應用場景可容忍主動讓出，可設定 `{ releaseOnFreeze: true }`，於 `freeze` 事件釋放鎖並在 `resume` 時重新參與競選。
- **不支援 API 行為**：無 `navigator.locks` 時明確回報 `supported: false`、`role: 'unsupported'`、`start()` 回傳 `{ acquired: false, role: 'unsupported', supported: false }`，絕不以 `localStorage` 假裝互斥。

---

## 7. `RpcChannel`（跨分頁 Request / Response，Phase 2）

`RpcChannel` 建立於 `MessageBus` 之上，提供可取消、具逾時與錯誤序列化的跨分頁方法呼叫：

```javascript
import { createRpcChannel, RPC_ERROR_CODES } from './lib/coordination.js';

const rpc = createRpcChannel({ namespace: 'orders', timeoutMs: 3000 });

const unregister = rpc.register('math.add', ({ a, b }, ctx) => {
    if (ctx.signal.aborted) return null;
    return a + b;
});

try {
    // 呼叫明確目標或同 namespace 唯一 provider（target 省略或為 null）
    const sum = await rpc.call('math.add', { a: 2, b: 3 }, { allowLocal: false });
    console.log(sum);
} catch (err) {
    if (err.code === RPC_ERROR_CODES.TIMEOUT) {
        console.warn('請求逾時，不會自動重試');
    }
}

unregister();
rpc.dispose();
```

- **方法白名單與目標路由**：僅接受透過 `register()` 註冊的方法（阻擋 `__proto__`/`constructor`/`prototype`）。指定 `target` 時非目標節點忽略、目標未註冊則回 `METHOD_NOT_FOUND`；`target: null` 適用於唯一服務提供者。
- **生命週期與清理**：支援單次 `timeoutMs` 與 `AbortSignal`，逾時或取消會立刻清除 `_pending` 與計時器並發出 best-effort `__rpc:cancel` 讓遠端 `context.signal` 中止；`dispose()` 會立即將所有未完成請求以 `CHANNEL_CLOSED` 結束並清空 `pendingCount`。
- **不自動重試與不回滾語意**：RPC 預設**不重試**任何失敗或逾時呼叫；取消／逾時僅代表呼叫端停止等待，不會回滾遠端已經產生的副作用。
- **重複回應與無傳輸層處理**：逾時後遲到或重複的回應會被安全忽略並發出 `'duplicate-response'` 事件；不支援 `BroadcastChannel` 時遠端呼叫會立即回報 `TRANSPORT_UNAVAILABLE`。

---

## 8. 限制與安全邊界

1. **同源不等同授權；`namespace` 不是安全邊界**：任何同源腳本皆可監聽或傳送至同一 channel 與 `namespace`。請勿廣播身份驗證權杖、密碼或敏感個資，也勿將訊息當作任意程式執行指令。
2. **純同源同儲存分區限制**：`BroadcastChannel` 無法跨越不同 Origin、不同瀏覽器或不同裝置，且受瀏覽器 Storage Partitioning 規範約束。
3. **不保證持久化與重播**：`BroadcastChannel` 僅投遞給當下活躍的上下文，離線或尚未開啟的分頁不會補收歷史訊息；持久化狀態請依賴 `Store`（`localStorage`）或後續持久層機制。
4. **Capability 降級行為**：不支援 `BroadcastChannel` 時不會拋錯也不會偽裝遠端成功，`supported` 為 `false`、`post()` 回傳 `false`、`publish()` 回傳 `remoteSent: false`。
