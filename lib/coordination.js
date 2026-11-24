/**
 * Plain Vanilla Browser Coordination SDK 獨立入口：
 * - Phase 1：跨執行環境訊息信封、`BroadcastService`、`MessageBus` 與能力偵測
 * - Phase 2：基於 Web Locks 的 `LeaderElection` 與跨分頁 `RpcChannel`
 * - Phase 3：節點探索 `PeerDiscovery` 與共享即時連線 `SharedConnection`（WebSocket / SSE）
 * - Phase 4：基於 IndexedDB 的持久工作佇列 `DurableTaskQueue`（單 transaction 原子認領與租約防護）
 *
 * 設計保證：
 * - 完全 opt-in：匯入本檔零副作用，僅在顯式呼叫建構子／工廠並啟動時才開啟通道、開啟 IndexedDB、請求 Web Lock 或建立網路連線。
 * - 邊界隔離：不依賴 UI 元件、router、Store 或任何展示用 service，可在分頁、視窗或 Worker 中使用。
 * - 安全界線：同源不等同授權，namespace / scope 不是安全邊界；請勿廣播憑證，RPC／轉發僅允許白名單方法且不自動重試副作用操作。
 *
 *   import { MessageBus, LeaderElection, RpcChannel, PeerDiscovery, SharedConnection, DurableTaskQueue } from './lib/coordination.js';
 */
export { VERSION } from './version.js';
export {
    ENVELOPE_VERSION,
    DEFAULT_CHANNEL_NAME,
    DEFAULT_NAMESPACE,
    BroadcastService,
    getCoordinationCapabilities,
    createEnvelope,
    validateEnvelope,
} from './broadcast-channel.js';
export { MessageBus, createMessageBus, DEFAULT_BUS_CHANNEL } from './message-bus.js';
export {
    DEFAULT_LOCK_PREFIX,
    DEFAULT_LEADER_SCOPE,
    LeaderElection,
    createLeaderElection,
} from './leader-election.js';
export {
    DEFAULT_RPC_TIMEOUT_MS,
    RPC_ERROR_CODES,
    RpcError,
    RpcChannel,
    createRpcChannel,
    serializeRpcError,
    deserializeRpcError,
} from './rpc-channel.js';
export {
    DEFAULT_PEER_HEARTBEAT_MS,
    DEFAULT_PEER_TIMEOUT_MS,
    PeerDiscovery,
    createPeerDiscovery,
} from './peer-discovery.js';
export {
    SHARED_CONNECTION_ERROR_CODES,
    SharedConnectionError,
    DEFAULT_RECONNECT_OPTIONS,
    buildConnectionScope,
    SharedConnection,
    createSharedConnection,
} from './shared-connection.js';
export {
    TASK_SCHEMA_VERSION,
    DEFAULT_TASK_DB_NAME,
    DEFAULT_TASK_STORE_NAME,
    DEFAULT_LEASE_DURATION_MS,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_RECLAIM_INTERVAL_MS,
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_RETENTION_MS,
    TASK_STATUS,
    TASK_QUEUE_ERROR_CODES,
    TaskQueueError,
    createMemoryTaskStorage,
    createIndexedDBTaskStorage,
    DurableTaskQueue,
    createDurableTaskQueue,
} from './task-queue.js';
