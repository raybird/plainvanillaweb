/**
 * Plain Vanilla Browser Coordination SDK 獨立入口：
 * - Phase 1：跨執行環境訊息信封、`BroadcastService`、`MessageBus` 與能力偵測
 *
 * 設計保證：
 * - 完全 opt-in：匯入本檔零副作用，僅在顯式呼叫建構子／工廠時才建立通道。
 * - 邊界隔離：不依賴 UI 元件、router、Store 或任何展示用 service，可在分頁、視窗或 Worker 中使用。
 * - 安全界線：同源不等同授權，namespace / channelName 不是安全邊界，請勿廣播憑證或當作 RPC 指令執行。
 *
 *   import { MessageBus, BroadcastService } from './lib/coordination.js';
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
