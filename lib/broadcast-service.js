import {
    BroadcastService,
    ENVELOPE_VERSION,
    DEFAULT_CHANNEL_NAME,
    DEFAULT_NAMESPACE,
    getCoordinationCapabilities,
    createEnvelope,
    validateEnvelope,
} from './broadcast-channel.js';

export {
    BroadcastService,
    ENVELOPE_VERSION,
    DEFAULT_CHANNEL_NAME,
    DEFAULT_NAMESPACE,
    getCoordinationCapabilities,
    createEnvelope,
    validateEnvelope,
};

/** 預設全域 BroadcastService 單例，保留供 core.js、appStore 與既有展示頁使用 */
export const broadcastService = new BroadcastService();
