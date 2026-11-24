import { BaseService } from './base-service.js';

/** 跨執行環境訊息信封協定版本 */
export const ENVELOPE_VERSION = 1;

/** 預設 BroadcastChannel 名稱（保留與既有一致以維持向下相容） */
export const DEFAULT_CHANNEL_NAME = 'vanilla_web_sync';

/** 預設命名空間 */
export const DEFAULT_NAMESPACE = 'default';

/**
 * 檢查值是否為純物件（非 null、非陣列、原型為 Object.prototype 或 null）
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * 檢查值是否為非空字串
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 產生不依賴棄用 API 的唯一識別碼
 * @returns {string}
 */
export function generateContextId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 偵測目前瀏覽器／執行環境對跨執行環境協作相關原生 API 的支援情況。
 * 不會建立任何通道或觸發連線副作用。
 * @returns {{ broadcastChannel: boolean, webLocks: boolean, indexedDB: boolean, localStorage: boolean }}
 */
export function getCoordinationCapabilities() {
    let hasLocalStorage = false;
    try {
        hasLocalStorage =
            typeof globalThis.localStorage !== 'undefined' &&
            globalThis.localStorage !== null &&
            typeof globalThis.localStorage.getItem === 'function' &&
            typeof globalThis.localStorage.setItem === 'function';
    } catch {
        hasLocalStorage = false;
    }

    let hasIndexedDB = false;
    try {
        hasIndexedDB =
            typeof globalThis.indexedDB !== 'undefined' &&
            globalThis.indexedDB !== null &&
            typeof globalThis.indexedDB.open === 'function';
    } catch {
        hasIndexedDB = false;
    }

    return {
        broadcastChannel: typeof globalThis.BroadcastChannel === 'function',
        webLocks:
            typeof globalThis.navigator !== 'undefined' &&
            globalThis.navigator !== null &&
            typeof globalThis.navigator.locks?.request === 'function',
        indexedDB: hasIndexedDB,
        localStorage: hasLocalStorage,
    };
}

/**
 * 建立符合 v1 協定的訊息信封。
 * @param {object} options
 * @param {string} [options.ns] 命名空間（預設 'default'）
 * @param {string} options.type 訊息類型／主題
 * @param {any} [options.payload] 訊息酬載（須支援結構化複製）
 * @param {string} options.sender 發送端識別碼
 * @param {string} [options.id] 訊息唯一識別碼
 * @param {number} [options.timestamp] Unix 毫秒時間戳
 * @returns {{ v: number, ns: string, id: string, type: string, payload: any, sender: string, timestamp: number }}
 */
export function createEnvelope({
    ns = DEFAULT_NAMESPACE,
    type,
    payload,
    sender,
    id,
    timestamp,
} = {}) {
    if (!isNonEmptyString(ns)) {
        throw new TypeError('Envelope namespace (ns) must be a non-empty string');
    }
    if (!isNonEmptyString(type)) {
        throw new TypeError('Envelope type must be a non-empty string');
    }
    if (!isNonEmptyString(sender)) {
        throw new TypeError('Envelope sender must be a non-empty string');
    }
    const resolvedId = id === undefined ? generateContextId() : id;
    if (!isNonEmptyString(resolvedId)) {
        throw new TypeError('Envelope id must be a non-empty string');
    }
    const resolvedTimestamp = timestamp === undefined ? Date.now() : timestamp;
    if (typeof resolvedTimestamp !== 'number' || !Number.isFinite(resolvedTimestamp)) {
        throw new TypeError('Envelope timestamp must be a finite number');
    }

    return {
        v: ENVELOPE_VERSION,
        ns,
        id: resolvedId,
        type,
        payload,
        sender,
        timestamp: resolvedTimestamp,
    };
}

/**
 * 驗證並正規化收到的跨執行環境訊息信封（支援 v1 與相容舊版 v0）。
 * @param {unknown} data
 * @returns {{ valid: true, version: number, legacy: boolean, envelope: object } | { valid: false, reason: string }}
 */
export function validateEnvelope(data) {
    if (!isPlainObject(data)) {
        return { valid: false, reason: 'not-an-object' };
    }
    if (!isNonEmptyString(data.type)) {
        return { valid: false, reason: 'invalid-type' };
    }
    if (!isNonEmptyString(data.sender)) {
        return { valid: false, reason: 'invalid-sender' };
    }
    if (typeof data.timestamp !== 'number' || !Number.isFinite(data.timestamp)) {
        return { valid: false, reason: 'invalid-timestamp' };
    }

    if ('v' in data) {
        if (data.v !== ENVELOPE_VERSION) {
            return { valid: false, reason: 'unsupported-version' };
        }
        if (!isNonEmptyString(data.ns) || !isNonEmptyString(data.id)) {
            return { valid: false, reason: 'invalid-envelope' };
        }
        return {
            valid: true,
            version: ENVELOPE_VERSION,
            legacy: false,
            envelope: {
                v: ENVELOPE_VERSION,
                ns: data.ns,
                id: data.id,
                type: data.type,
                payload: data.payload,
                sender: data.sender,
                timestamp: data.timestamp,
            },
        };
    }

    return {
        valid: true,
        version: 0,
        legacy: true,
        envelope: {
            v: 0,
            ns: DEFAULT_NAMESPACE,
            id: null,
            type: data.type,
            payload: data.payload,
            sender: data.sender,
            timestamp: data.timestamp,
            legacy: true,
        },
    };
}

/**
 * BroadcastService - 跨分頁／執行環境通訊服務（支援 namespace、版本化 envelope、transport 注入與資源釋放）。
 * 相容舊版 `new BroadcastService(channelName)` 與 `post(type, payload)` / `message` 事件。
 * 不支援 BroadcastChannel 且未注入 transport 時會安全降級（`supported === false`、`post()` 回傳 `false`）。
 */
export class BroadcastService extends BaseService {
    /**
     * @param {string | object} [channelNameOrOptions] 通道名稱或選項物件
     * @param {object} [options] 選項（當第一參數為通道名稱時使用）
     * @param {string} [options.channelName] 通道名稱
     * @param {string} [options.namespace] 邏輯命名空間（預設 'default'）
     * @param {string} [options.tabId] 自訂上下文識別碼
     * @param {{ postMessage: Function, close: Function, onmessage?: Function|null, onmessageerror?: Function|null }} [options.transport] 可注入的自訂傳輸層
     * @param {boolean} [options.acceptLegacy] 是否接受未帶版本的 v0 訊息（預設僅在 namespace === 'default' 時為 true）
     */
    constructor(channelNameOrOptions = DEFAULT_CHANNEL_NAME, options = {}) {
        super();

        let channelName;
        let opts;
        if (isPlainObject(channelNameOrOptions)) {
            opts = channelNameOrOptions;
            channelName = opts.channelName ?? DEFAULT_CHANNEL_NAME;
        } else {
            if (options !== undefined && !isPlainObject(options)) {
                throw new TypeError('BroadcastService options must be a plain object');
            }
            opts = options || {};
            channelName = channelNameOrOptions;
        }

        if (!isNonEmptyString(channelName)) {
            throw new TypeError('BroadcastService channelName must be a non-empty string');
        }

        const namespace = opts.namespace ?? DEFAULT_NAMESPACE;
        if (!isNonEmptyString(namespace)) {
            throw new TypeError('BroadcastService namespace must be a non-empty string');
        }

        if (opts.tabId !== undefined && !isNonEmptyString(opts.tabId)) {
            throw new TypeError('BroadcastService tabId must be a non-empty string');
        }

        this._channelName = channelName;
        this._namespace = namespace;
        this._tabId = opts.tabId ?? generateContextId();
        this._acceptLegacy =
            opts.acceptLegacy !== undefined ? Boolean(opts.acceptLegacy) : namespace === DEFAULT_NAMESPACE;
        this._closed = false;

        if (opts.transport !== undefined) {
            if (
                !opts.transport ||
                typeof opts.transport !== 'object' ||
                typeof opts.transport.postMessage !== 'function' ||
                typeof opts.transport.close !== 'function'
            ) {
                throw new TypeError('BroadcastService transport must provide postMessage() and close() methods');
            }
            this._transport = opts.transport;
            this._transportType = 'custom';
        } else if (typeof globalThis.BroadcastChannel === 'function') {
            try {
                this._transport = new globalThis.BroadcastChannel(this._channelName);
                this._transportType = 'native';
            } catch {
                this._transport = null;
                this._transportType = 'none';
            }
        } else {
            this._transport = null;
            this._transportType = 'none';
        }

        // 保留屬性指派方式以相容僅實作 onmessage 的精簡測試 transport
        this._channel = this._transport;
        if (this._transport) {
            this._transport.onmessage = (event) => this._handleTransportMessage(event);
            this._transport.onmessageerror = (event) => {
                if (this._closed) return;
                this.emit('messageerror', {
                    channelName: this._channelName,
                    namespace: this._namespace,
                    error: event,
                });
            };
        }
    }

    /**
     * 處理底層 transport 傳入的訊息
     * @private
     * @param {{ data?: unknown }} event
     */
    _handleTransportMessage(event) {
        if (this._closed) return;

        const result = validateEnvelope(event?.data);
        if (!result.valid) {
            this.emit('invalid-message', {
                reason: result.reason,
                raw: event?.data,
            });
            return;
        }

        const { envelope, legacy } = result;
        if (envelope.sender === this._tabId) return;

        if (legacy) {
            if (!this._acceptLegacy) return;
            this.emit('message', {
                ...envelope,
                ns: this._namespace,
            });
            return;
        }

        if (envelope.ns !== this._namespace) return;
        this.emit('message', envelope);
    }

    /**
     * 發送訊息給同 channel 與同 namespace 的其他執行上下文。
     * 不會吞掉結構化複製失敗（如 DataCloneError）。
     * @param {string} type 訊息類型
     * @param {any} [payload] 訊息內容
     * @param {{ id?: string, timestamp?: number }} [meta] 供上層（如 MessageBus）對齊本地與遠端識別碼的中繼資訊
     * @returns {boolean} 是否成功交由底層 transport 送出（未支援或已關閉時為 false）
     */
    post(type, payload, meta = {}) {
        if (!isNonEmptyString(type)) {
            throw new TypeError('Message type must be a non-empty string');
        }
        if (this._closed || !this._transport) {
            return false;
        }

        const envelope = createEnvelope({
            ns: this._namespace,
            type,
            payload,
            sender: this._tabId,
            id: meta?.id,
            timestamp: meta?.timestamp,
        });
        this._transport.postMessage(envelope);
        return true;
    }

    /**
     * 關閉底層 transport 並清理透過 `on()` 註冊的監聽器（具冪等性）
     */
    close() {
        if (this._closed) return;
        this._closed = true;

        if (this._transport) {
            const transport = this._transport;
            this._transport = null;
            this._channel = null;
            try {
                transport.onmessage = null;
                transport.onmessageerror = null;
                transport.close();
            } catch {
                // 忽略底層 transport 關閉例外，確保狀態旗標與監聽清理完成
            }
        }

        this.emit('close', {
            channelName: this._channelName,
            namespace: this._namespace,
            tabId: this._tabId,
        });

        for (const entries of this._listenersMap.values()) {
            for (const { type, wrapper } of entries) {
                this.removeEventListener(type, wrapper);
            }
        }
        this._listenersMap.clear();
    }

    /** `close()` 的別名，便於與其他協作元件一致釋放資源 */
    dispose() {
        this.close();
    }

    /** @returns {string} */
    get tabId() {
        return this._tabId;
    }

    /** @returns {string} */
    get channelName() {
        return this._channelName;
    }

    /** @returns {string} */
    get namespace() {
        return this._namespace;
    }

    /** @returns {boolean} 底層是否具備可用的傳輸層（native 或 custom transport） */
    get supported() {
        return this._transportType !== 'none';
    }

    /** @returns {boolean} 是否已呼叫 close()/dispose() */
    get closed() {
        return this._closed;
    }

    /** @returns {{ broadcastChannel: boolean, webLocks: boolean, indexedDB: boolean, localStorage: boolean, transport: string, supported: boolean }} */
    get capabilities() {
        return {
            ...getCoordinationCapabilities(),
            transport: this._transportType,
            supported: this.supported,
        };
    }
}
