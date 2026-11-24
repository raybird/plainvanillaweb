# ADR 0105: 節點探索（Peer Discovery）與共享即時連線（SharedConnection）

## 狀態
已接受 (Accepted)，2026-11-24。

## 背景
[ADR 0103](./0103-browser-coordination-foundation.md) 與 [ADR 0104](./0104-leader-election-and-rpc.md) 建立了跨執行環境的 `MessageBus`、基於 Web Locks 的互斥 `LeaderElection` 與白名單 `RpcChannel`（Phase 1–2）。在此基礎上，多數現代網頁應用還面臨兩個跨分頁挑戰（Epic #2 / Issue #5）：

1. **節點可觀測性（Peer Discovery）**：分頁與 Worker 之間需要互相宣告節點識別碼與支援能力、定期透過 heartbeat 維持活躍狀態、並明確區分「主動離開（`peer-leave`）」與「失去心跳逾時（`peer-expire`）」。
2. **集中式即時連線（Shared WebSocket / SSE Connection）**：使用者同時開啟 5–10 個同源分頁時，若每個分頁各自開啟一條 WebSocket 或 EventSource，容易耗盡瀏覽器／伺服器連線額度並重複消耗後端推播與重連配額；且不同登入帳號、不同 endpoint 或不同連線設定絕不能共用同一條連線。

## 決策

### 1. 模組邊界、重用既有設施與零副作用（延續 ADR 0101 / 0103 / 0104）
- **`lib/peer-discovery.js`**：僅依賴 `lib/base-service.js`、`lib/broadcast-channel.js` 與 `lib/message-bus.js`，匯出 `PeerDiscovery`、`createPeerDiscovery()`、`DEFAULT_PEER_HEARTBEAT_MS` 與 `DEFAULT_PEER_TIMEOUT_MS`。
- **`lib/shared-connection.js`**：重用 `MessageBus`、Web Locks `LeaderElection` 與 `RpcChannel`，匯出 `SharedConnection`、`createSharedConnection()`、`buildConnectionScope()`、`SharedConnectionError`、`SHARED_CONNECTION_ERROR_CODES` 與 `DEFAULT_RECONNECT_OPTIONS`。
- **能力偵測擴充**：於 `lib/broadcast-channel.js` 的 `getCoordinationCapabilities()` 新增 `webSocket` 與 `eventSource` 布林欄位。
- **嚴格 opt-in**：匯入 `lib/coordination.js` 與 `lib/vanilla-sdk.js` 或僅呼叫 `new PeerDiscovery()`／`new SharedConnection()` 均**絕不**建立 `BroadcastChannel`、`WebSocket`、`EventSource`、請求 Web Lock 或啟動背景定時器。

### 2. Peer Discovery：能力宣告、Heartbeat 與「過期 ≠ 釋鎖」不變量
- **身分與安全過濾**：節點可宣告物件或字串陣列形式的 `capabilities` 與純物件 `meta`；所有收發酬載皆經過結構化複製並拒絕 `__proto__`、`constructor`、`prototype` 等不安全鍵，以單調遞增 `seq` 與 `startedAt` 過濾過期／亂序訊息。
- **活躍、過期與重新加入**：
  - `start()` 發送 `__peer:hello`，定期廣播 `__peer:heartbeat` 並掃描逾時（`now - lastSeenAt >= peerTimeoutMs`）的節點。
  - 逾時節點轉為 `'expired'` 並發出 `'peer-expire'`（原因 `'timeout'`）；若該分頁稍後從背景恢復並再次送出 heartbeat，會切回 `'alive'` 並發出 `rejoined: true` 的 `'peer-join'`。
  - 呼叫 `stop()`、`dispose()` 或分頁觸發 `pagehide` 時發出 best-effort `__peer:leave` 並移除該節點（`'peer-leave'`）。
- **核心原則：Peer 過期絕不代表鎖已釋放**：`PeerDiscovery` 僅提供可觀測性，絕不操作或判定 Web Locks。背景分頁可能因節電被瀏覽器凍結而觸發 `peer-expire`，但其 Web Lock 仍可能由瀏覽器持有（見 ADR 0104）。

### 3. SharedConnection：Canonical Scope、WebSocket 雙向轉發與 SSE 嚴格單向
- **嚴格 Scope 隔離（`buildConnectionScope`）**：
  - 連線範圍 key `scopeKey` 由 `transport`（`'websocket' | 'sse'`）、正規化 `url`（拒絕內嵌 `username:password@` 認證）、`identityKey`、`configKey` 及 `protocols`／`withCredentials` 以 `encodeURIComponent` 串接組成，並以此作為 Web Locks `scope`、`MessageBus` 主題與 `RpcChannel` 方法後綴。
  - 任何帳號切換（不同 `identityKey`）、端點或參數差異皆會對應至不同的鎖與頻道，絕不會跨身分或跨設定共享同一條伺服器連線。
- **單連線與角色職責**：
  - Leader 由 Web Locks `exclusive` 鎖唯一決定：僅 leader 建立並持有單一 `WebSocket` 或 `EventSource`；所有節點共用來自 leader 廣播的 `'message'`、`'state-change'` 與 `'resync'` 事件。
  - 缺乏 Web Locks 或對應 `WebSocket`／`EventSource` API 時，`supported` 為 `false`、`state` 為 `'unsupported'`、`start()` 明確回傳不支援，絕不假裝跨分頁單連線保證。
- **WebSocket 雙向轉發 vs SSE 嚴格單向**：
  - **WebSocket**：leader 註冊 scoped `RpcChannel` 方法；follower 呼叫 `send(data)` 時透過 `RpcChannel` 轉發至目前唯一 leader 送出。**沿用 ADR 0104 原則，絕不自動重試任何失敗或逾時的 `send()`**，避免重複執行具副作用的傳輸。
  - **SSE（`EventSource`）**：本質為伺服器單向事件流；`canSend` 恆為 `false`，**絕不註冊傳送 RPC 方法**，無論 leader 或 follower 呼叫 `send()` 均立即 reject `SharedConnectionError(UNSUPPORTED_OPERATION)`，不提供虛假雙向傳輸。SSE 透過追蹤與廣播 `lastEventId` 及自訂 `eventTypes`，讓重連或接管後的新 leader 能接續事件位置。
- **Reconnect / Backoff、訂閱同步與 Resync**：
  - Leader 端採指數退避（`initialDelayMs`、`factor`、`maxDelayMs`、`jitter`、`maxAttempts`）重連；連線建立或重連後重設重試計數，並於就緒時執行選用 `onResync` callback，同時在所有節點發出 `'resync'` 事件。
  - 節點可呼叫 `subscribe(channel)`／`unsubscribe(channel)` 維護訂閱集；leader 維護各活躍節點的聯集並在變化時呼叫 `onSubscriptionsChange`，接管時透過 `__sc:subs-query` 重新彙整各分頁訂閱，分頁停止或離開時自動移除其訂閱。

### 4. Failover、背景凍結與服務端限制（必須記錄於設計契約）
1. **Failover 期間的訊息缺口（Message Gap）與短暫重複連線**：
   - 當現任 leader 分頁無預警崩潰或關閉時，從連線中斷、Web Locks 偵測釋放到新 leader 完成連線與 `onResync` 之間必然存在時間差，此期間伺服器發出的即時訊息無法被前端捕捉，因此應用必須實作 `onResync`（或依賴 SSE `lastEventId`）進行狀態補齊／對帳。
   - 在分頁假死、網路半開或極端切換瞬間，伺服器端 TCP 連線的清除可能略晚於新 leader 連線建立，使伺服器短時間同時看到兩條連線。
2. **服務端 Fencing 與世代驗證**：
   - `LeaderElection.epoch` 為單一實例內的單調整數，不同分頁之間各自維護自己的 `epoch`，無法單靠純前端整數防止分散式亂序寫入。若業務要求嚴格單一寫入者或順序保證，後端必須驗證與連線綁定的 `fencing token` 或連線世代（由 `resolveUrl` 取得）。
3. **禁止廣播認證 Token**：
   - 認證憑證（JWT、Bearer Token、Session ID）**絕不可**放進 `url`、`identityKey`、`configKey`、`MessageBus` 或 `PeerDiscovery` 宣告。建議使用 `HttpOnly` Cookie（SSE 同源或搭配 `withCredentials: true`），或在僅於 leader 本地執行且結果不對外廣播的 `resolveUrl()` 中換取單次／短效連線票證。
4. **背景凍結（Background Freeze）**：
   - 如 ADR 0104 所述，預設 `releaseOnFreeze: false` 時被瀏覽器凍結的背景 leader 仍持有鎖，可能暫停推播直到分頁恢復或關閉；顯式開啟 `releaseOnFreeze: true` 時，分頁進入 `freeze` 會主動關閉上游連線、註銷 RPC handler 並釋放 Web Lock 讓其他活躍分頁即時接管。

## 後果
- **優點**：在支援 Web Locks 的同源分頁間，同一 `scopeKey` 在穩定狀態只維持 1 條上游 WebSocket／SSE 連線；多帳號與多設定以 `scopeKey` 嚴格隔離；SSE 不偽造雙向語意；元件皆顯式 opt-in 且與展示站完全隔離。
- **代價**：重度依賴各分頁配合不直接繞過 `SharedConnection` 自行連線；Failover 期需由應用層 `onResync` 與伺服器端 `lastEventId`／cursor 補齊訊息缺口。
- **相關文件**：見 [跨執行環境協作指南](../coordination.md)、[ADR 0103](./0103-browser-coordination-foundation.md) 與 [ADR 0104](./0104-leader-election-and-rpc.md)。
