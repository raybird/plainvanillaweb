# 跨執行環境協作基礎 (Browser Coordination Foundation)

> **更新日期**：2026-11-24（Phase 1 + Phase 2 + Phase 3）  
> **獨立入口**：`./lib/coordination.js`  
> **架構決策**：[ADR 0103](./decisions/0103-browser-coordination-foundation.md) · [ADR 0104](./decisions/0104-leader-election-and-rpc.md) · [ADR 0105](./decisions/0105-peer-discovery-and-shared-connection.md) · [ADR 0101](./decisions/0101-core-entry-point.md)

`lib/coordination.js` 提供**可獨立選用（opt-in）、零依賴、零建置**的同源跨執行環境（多分頁、視窗及適用的 Worker）訊息傳遞、領導者選舉、跨分頁 RPC、節點探索與共享即時連線基礎設施。僅匯入此模組不會建立 `BroadcastChannel`、申請 Web Lock、建立 `WebSocket`／`EventSource` 或啟動背景任務。

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
| `lib/coordination.js` | 獨立協作入口（匯出 `BroadcastService`、`MessageBus`、`createMessageBus`、`LeaderElection`、`createLeaderElection`、`RpcChannel`、`createRpcChannel`、`RpcError`、`RPC_ERROR_CODES`、`PeerDiscovery`、`createPeerDiscovery`、`SharedConnection`、`createSharedConnection`、`buildConnectionScope`、`SharedConnectionError`、`SHARED_CONNECTION_ERROR_CODES`、`DEFAULT_RECONNECT_OPTIONS`、`DEFAULT_PEER_HEARTBEAT_MS`、`DEFAULT_PEER_TIMEOUT_MS`、`getCoordinationCapabilities`、`ENVELOPE_VERSION`、`DEFAULT_CHANNEL_NAME`、`DEFAULT_NAMESPACE`、`DEFAULT_BUS_CHANNEL`、`DEFAULT_LOCK_PREFIX`、`DEFAULT_LEADER_SCOPE`、`DEFAULT_RPC_TIMEOUT_MS`、`createEnvelope`、`validateEnvelope`、`serializeRpcError`、`deserializeRpcError`、`VERSION`） | **無** |
| `lib/broadcast-channel.js` | 純類別 `BroadcastService`、版本化 envelope 與 capability 偵測 | **無** |
| `lib/leader-election.js` | 基於 Web Locks 的 scoped 互斥領導者選舉（`LeaderElection`） | **無** |
| `lib/rpc-channel.js` | 基於 `MessageBus` 的白名單跨分頁 RPC（`RpcChannel`、`RpcError`） | **無** |
| `lib/peer-discovery.js` | 跨執行環境節點探索、能力宣告與心跳觀測（`PeerDiscovery`） | **無** |
| `lib/shared-connection.js` | 基於 Web Locks 與 RPC 的同 scope 共享即時連線（`SharedConnection`） | **無** |
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

## 8. `PeerDiscovery`（節點能力宣告與心跳觀測，Phase 3）

`PeerDiscovery` 提供同 `namespace` 內跨執行環境的節點可觀測性，詳見 [ADR 0105](./decisions/0105-peer-discovery-and-shared-connection.md)：

```javascript
import { createPeerDiscovery } from './lib/coordination.js';

const discovery = createPeerDiscovery({
    namespace: 'workspace-1',
    capabilities: ['sync', 'audio'],
    heartbeatIntervalMs: 2000,
    peerTimeoutMs: 6000,
});

discovery.on('peer-join', ({ peer, rejoined }) => {
    console.log(peer.nodeId, peer.capabilities, rejoined);
});
discovery.on('peer-expire', ({ peer }) => {
    console.warn('失去心跳（僅代表不可觀測，不代表 Web Lock 已釋放）:', peer.nodeId);
});

discovery.start();
discovery.updateCapabilities(['sync', 'audio', 'ws']);
discovery.dispose();
```

- **能力宣告與查詢**：支援物件或字串陣列格式的 `capabilities`（阻擋 `__proto__`/`constructor`/`prototype`），可用 `getPeers({ includeSelf, includeExpired, capability })` 篩選查詢；以單調遞增 `seq` 忽略過期或亂序訊息。
- **過期與離開語意**：主動呼叫 `stop()`、`dispose()` 或分頁觸發 `pagehide` 會發出 `'peer-leave'` 並移除節點；超過 `peerTimeoutMs` 未見心跳則轉為 `'expired'` 並發出 `'peer-expire'`，恢復送出心跳時會切回 `'alive'` 並觸發 `{ rejoined: true }`。
- **重要原則**：`peer-expire` 僅作狀態觀測，**絕不表示該節點持有的 Web Lock 已釋放或可安全搶鎖**。

---

## 9. `SharedConnection`（共享 WebSocket / SSE 連線，Phase 3）

`SharedConnection` 重用 `MessageBus`、`LeaderElection`（Web Locks）與 `RpcChannel`，使同 `scopeKey` 的多個分頁在穩定狀態只維持 **1 條**上游即時連線：

```javascript
import {
    createSharedConnection,
    SHARED_CONNECTION_ERROR_CODES,
} from './lib/coordination.js';

const conn = createSharedConnection({
    transport: 'websocket', // 或 'sse'
    url: 'wss://example.com/stream',
    identityKey: 'user:42',   // 不同帳號必須使用不同 identityKey，絕不混用連線
    configKey: 'v1',          // 設定差異也會納入 scopeKey 隔離
    resolveUrl: ({ url, epoch, lastEventId }) => `${url}?epoch=${epoch}&cursor=${lastEventId}`,
    onResync: ({ reason, subscriptions }) => console.log('重新同步:', reason, subscriptions),
});

conn.on('message', ({ data, relayed }) => console.log('收到推播:', data, { relayed }));
await conn.start();

// WebSocket 支援雙向轉發（不自動重試）；SSE 的 canSend 為 false，呼叫 send() 會立即以 UNSUPPORTED_OPERATION 拒絕
if (conn.canSend) {
    await conn.send(JSON.stringify({ type: 'ping' }));
}
await conn.dispose();
```

- **嚴格 Scope 隔離（`buildConnectionScope`）**：將 `transport`、正規化 `url`（拒絕內嵌 `user:pass@`）、`identityKey`、`configKey` 與 `protocols`/`withCredentials` 以 `encodeURIComponent` 組合為唯一 `scopeKey`，防止不同帳號或參數錯用同一條伺服器連線。
- **WebSocket vs SSE 明確分工**：
  - WebSocket leader 持有連線並向 followers 廣播訊息；follower 呼叫 `send()` 透過 `RpcChannel` 轉發至 leader，失敗或逾時**不自動重試**。
  - SSE 為嚴格單向接收：`canSend === false`、不註冊傳送 RPC、`send()` 無論在 leader 或 follower 均立即 reject `UNSUPPORTED_OPERATION`，並追蹤與同步 `lastEventId` 及自訂 `eventTypes`。
- **重連、訂閱同步與環境降級**：支援指數退避重連（`reconnect`）、跨分頁 `subscribe(channel)` 聯集同步、`onResync` 重新對帳與 `releaseOnFreeze`（未觸發 `pagehide` 或強行關閉的分頁訂閱會於下次切鎖時重整清除）；缺乏 Web Locks 或對應 `WebSocket`/`EventSource` 時明確回報 `state: 'unsupported'`，絕不偽裝單連線保證。

---

## 10. 限制、Failover 缺口與安全邊界

1. **同源不等同授權；絕不廣播認證 Token**：任何同源腳本皆可監聽同 channel 與 `namespace`。請勿將 JWT、Bearer Token、密碼或敏感憑證放進 `url`、`identityKey`、`configKey`、`MessageBus` 或 `PeerDiscovery` 宣告。建議搭配 `HttpOnly` Cookie，或使用僅在 leader 本地執行且結果絕不廣播的 `resolveUrl()` 取得短效單次連線票證。
2. **Failover 訊息缺口、短暫雙連線與服務端 Fencing**：leader 分頁關閉、重載或崩潰後，從斷線到新 leader 取得 Web Lock 並完成握手之間必定存在空窗期（會產生訊息缺口），且極端情境下伺服器可能短暫同時存在舊連線與新連線。請務必實作 `onResync`／SSE `lastEventId` 補齊資料；由於純前端 `epoch` 僅為單實例單調遞增，需要嚴格單一寫入保證時須由服務端實施 fencing token 驗證。
3. **背景凍結（Background Freeze）與 `releaseOnFreeze`**：背景分頁被凍結後計時器與心跳會暫停，可能觸發 `PeerDiscovery` `peer-expire`，但瀏覽器通常會維持其持有的 Web Lock 直到恢復或關閉；需主動交接上游連線時請設定 `releaseOnFreeze: true`。
4. **純同源、非持久廣播與能力降級**：`BroadcastChannel` 受同源與 Storage Partitioning 限制、不保證歷史重播（持久狀態請交給 `Store`）；不支援原生 API 時明確以 `supported: false` 降級而不拋錯或偽裝成功。
