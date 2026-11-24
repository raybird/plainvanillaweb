import { BaseService } from './base-service.js';
import {
    BroadcastService,
    DEFAULT_NAMESPACE,
    ENVELOPE_VERSION,
    generateContextId,
    getCoordinationCapabilities,
} from './broadcast-channel.js';

/** MessageBus 預設使用的 BroadcastChannel 名稱 */
export const DEFAULT_BUS_CHANNEL = 'vanilla_coordination';

const VALID_RECEIVE_MODES = new Set(['all', 'remote', 'local']);

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function clonePayload(value) {
    if (value === undefined || value === null || typeof value !== 'object') {
        if (typeof value === 'function' || typeof value === 'symbol') {
            throw new TypeError('MessageBus payload must be structured-cloneable');
        }
        return value;
    }
    if (typeof globalThis.structuredClone === 'function') {
        return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}

/**
 * MessageBus - 跨執行上下文的發布／訂閱匯流排。
 *
 * 投遞語意：
 * - 預設 `publish(topic, payload)` 採 `remote: true, local: false`（僅投遞至其他上下文，貼合 BroadcastChannel 行為）。
 * - 傳入 `{ local: true }` 可同時或單獨（搭配 `{ remote: false }`）投遞給同一實例上的訂閱者。
 * - 本地投遞會先複製 payload，確保與遠端結構化複製行為一致且彼此隔離。
 */
export class MessageBus extends BaseService {
    /**
     * @param {object} [options]
     * @param {string} [options.namespace] 邏輯命名空間（預設 'default'）
     * @param {string} [options.channelName] 通道名稱（預設 'vanilla_coordination'）
     * @param {BroadcastService} [options.broadcast] 可注入外部 BroadcastService 實例（關閉時不會代為關閉外部實例）
     * @param {object} [options.transport] 未傳入 broadcast 時，透傳給內部 BroadcastService 的自訂 transport
     * @param {string} [options.tabId] 自訂上下文識別碼
     * @param {boolean} [options.acceptLegacy] 是否接受無版本欄位訊息（預設 false）
     */
    constructor(options = {}) {
        super();
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('MessageBus options must be a plain object');
        }
        const opts = options || {};

        if (opts.namespace !== undefined && !isNonEmptyString(opts.namespace)) {
            throw new TypeError('MessageBus namespace must be a non-empty string');
        }

        if (opts.broadcast !== undefined) {
            const injected = opts.broadcast;
            if (
                !injected ||
                typeof injected !== 'object' ||
                typeof injected.post !== 'function' ||
                typeof injected.addEventListener !== 'function' ||
                typeof injected.removeEventListener !== 'function' ||
                !isNonEmptyString(injected.tabId) ||
                !isNonEmptyString(injected.namespace)
            ) {
                throw new TypeError('MessageBus options.broadcast must be a valid BroadcastService instance');
            }
            if (opts.namespace !== undefined && opts.namespace !== injected.namespace) {
                throw new TypeError('MessageBus options.namespace does not match injected broadcast.namespace');
            }
            this._broadcast = injected;
            this._ownsBroadcast = false;
        } else {
            const channelName = opts.channelName ?? DEFAULT_BUS_CHANNEL;
            const namespace = opts.namespace ?? DEFAULT_NAMESPACE;
            this._broadcast = new BroadcastService(channelName, {
                namespace,
                transport: opts.transport,
                tabId: opts.tabId,
                acceptLegacy: opts.acceptLegacy ?? false,
            });
            this._ownsBroadcast = true;
        }

        this._namespace = this._broadcast.namespace;
        this._channelName = this._broadcast.channelName;
        this._tabId = this._broadcast.tabId;
        this._subscriptions = new Map();
        this._closed = false;

        this._onBroadcastMessage = (e) => this._handleRemoteMessage(e.detail);
        this._onInvalidMessage = (e) => this.emit('invalid-message', e.detail);
        this._onMessageError = (e) => this.emit('messageerror', e.detail);

        this._broadcast.addEventListener('message', this._onBroadcastMessage);
        this._broadcast.addEventListener('invalid-message', this._onInvalidMessage);
        this._broadcast.addEventListener('messageerror', this._onMessageError);
    }

    /**
     * 訂閱指定主題（支援同命名空間萬用字元 `'*'`）
     * @param {string} topic 主題名稱或 `'*'`
     * @param {(payload: any, meta: object) => void} handler 回呼函式
     * @param {{ receive?: 'all' | 'remote' | 'local' }} [options] 過濾訊息來源（預設 'all'）
     * @returns {() => void} 冪等取消訂閱函式
     */
    subscribe(topic, handler, options = {}) {
        if (this._closed) {
            throw new Error('Cannot subscribe to a closed MessageBus');
        }
        if (!isNonEmptyString(topic)) {
            throw new TypeError('Topic must be a non-empty string');
        }
        if (typeof handler !== 'function') {
            throw new TypeError('Subscriber handler must be a function');
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('Subscribe options must be a plain object');
        }

        const receive = options.receive ?? 'all';
        if (!VALID_RECEIVE_MODES.has(receive)) {
            throw new TypeError("Subscribe options.receive must be 'all', 'remote', or 'local'");
        }

        let set = this._subscriptions.get(topic);
        if (!set) {
            set = new Set();
            this._subscriptions.set(topic, set);
        }

        const entry = { handler, receive };
        set.add(entry);

        return () => {
            const current = this._subscriptions.get(topic);
            if (!current || !current.delete(entry)) return;
            if (current.size === 0) {
                this._subscriptions.delete(topic);
            }
        };
    }

    /**
     * 取消指定主題上符合的回呼訂閱（具冪等性）
     * @param {string} topic
     * @param {Function} handler
     */
    unsubscribe(topic, handler) {
        if (this._closed) return;
        if (!isNonEmptyString(topic)) {
            throw new TypeError('Topic must be a non-empty string');
        }
        if (typeof handler !== 'function') {
            throw new TypeError('Subscriber handler must be a function');
        }

        const set = this._subscriptions.get(topic);
        if (!set) return;

        for (const entry of [...set]) {
            if (entry.handler === handler) {
                set.delete(entry);
            }
        }
        if (set.size === 0) {
            this._subscriptions.delete(topic);
        }
    }

    /**
     * 發布訊息至指定主題
     * @param {string} topic 具體主題名稱（不可為 `'*'`）
     * @param {any} [payload] 訊息酬載
     * @param {{ local?: boolean, remote?: boolean }} [options] 預設 `{ local: false, remote: true }`
     * @returns {{ id: string | null, localCount: number, remoteSent: boolean }}
     */
    publish(topic, payload, options = {}) {
        if (!isNonEmptyString(topic) || topic === '*') {
            throw new TypeError("Publish topic must be a non-empty string and cannot be '*'");
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('Publish options must be a plain object');
        }
        if (this._closed) {
            return { id: null, localCount: 0, remoteSent: false };
        }

        const local = Boolean(options.local);
        const remote = options.remote === undefined ? true : Boolean(options.remote);
        const id = generateContextId();
        const timestamp = Date.now();

        // 若啟用本地投遞，先驗證可結構化複製，確保與遠端一致並在異常時不產生半套投遞
        const preparedLocalPayload = local ? clonePayload(payload) : undefined;

        let remoteSent = false;
        if (remote) {
            remoteSent = this._broadcast.post(topic, payload, { id, timestamp });
        }

        let localCount = 0;
        if (local) {
            const meta = Object.freeze({
                id,
                topic,
                ns: this._namespace,
                v: ENVELOPE_VERSION,
                sender: this._tabId,
                timestamp,
                origin: 'local',
                local: true,
                remote: false,
            });
            localCount = this._dispatch(topic, preparedLocalPayload, meta, 'local');
        }

        return { id, localCount, remoteSent };
    }

    /** @private */
    _handleRemoteMessage(msg) {
        if (this._closed || !msg) return;
        const topic = msg.type;
        if (!isNonEmptyString(topic)) return;

        const meta = Object.freeze({
            id: msg.id ?? null,
            topic,
            ns: msg.ns ?? this._namespace,
            v: msg.v ?? ENVELOPE_VERSION,
            sender: msg.sender,
            timestamp: msg.timestamp,
            origin: 'remote',
            local: false,
            remote: true,
            legacy: Boolean(msg.legacy),
        });
        this._dispatch(topic, msg.payload, meta, 'remote');
    }

    /** @private */
    _dispatch(topic, payload, meta, origin) {
        const exactEntries = this._subscriptions.get(topic);
        const wildcardEntries = topic === '*' ? null : this._subscriptions.get('*');
        const candidates = [
            ...(exactEntries ? [...exactEntries] : []),
            ...(wildcardEntries ? [...wildcardEntries] : []),
        ];

        let delivered = 0;
        for (let i = 0; i < candidates.length; i++) {
            if (this._closed) break;
            const entry = candidates[i];
            if (origin === 'local' && entry.receive === 'remote') continue;
            if (origin === 'remote' && entry.receive === 'local') continue;

            // 每位匹配的訂閱者（含首位及遠端多訂閱者）各自取得獨立複本，避免互相污染可變物件
            const arg = clonePayload(payload);
            delivered += 1;
            try {
                entry.handler(arg, meta);
            } catch (error) {
                this.emit('handler-error', { topic, error, meta });
            }
        }
        return delivered;
    }

    /**
     * 取得目前訂閱數量
     * @param {string} [topic] 若省略則回傳所有主題的訂閱總數
     * @returns {number}
     */
    subscriberCount(topic) {
        if (topic !== undefined) {
            return this._subscriptions.get(topic)?.size ?? 0;
        }
        let total = 0;
        for (const set of this._subscriptions.values()) {
            total += set.size;
        }
        return total;
    }

    /**
     * 關閉匯流排、解除監聽並清空訂閱（具冪等性）。
     * 若使用內部建立的 BroadcastService 會一併關閉；外部注入的實例則保留由外部管理。
     */
    close() {
        if (this._closed) return;
        this._closed = true;

        this._broadcast.removeEventListener('message', this._onBroadcastMessage);
        this._broadcast.removeEventListener('invalid-message', this._onInvalidMessage);
        this._broadcast.removeEventListener('messageerror', this._onMessageError);

        if (this._ownsBroadcast) {
            this._broadcast.close();
        }

        this._subscriptions.clear();
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

    /** `close()` 的別名 */
    dispose() {
        this.close();
    }

    /** @returns {string} */
    get namespace() {
        return this._namespace;
    }

    /** @returns {string} */
    get channelName() {
        return this._channelName;
    }

    /** @returns {string} */
    get tabId() {
        return this._tabId;
    }

    /** @returns {boolean} */
    get supported() {
        return this._broadcast.supported;
    }

    /** @returns {{ broadcastChannel: boolean, webLocks: boolean, indexedDB: boolean, localStorage: boolean, transport: string, supported: boolean }} */
    get capabilities() {
        return this._broadcast.capabilities ?? {
            ...getCoordinationCapabilities(),
            transport: this._broadcast.supported ? 'custom' : 'none',
            supported: this._broadcast.supported,
        };
    }

    /** @returns {boolean} */
    get closed() {
        return this._closed;
    }
}

/**
 * 建立 MessageBus 實例的工廠函式（不自動開啟除訊息通道外的任何長連線或背景任務）
 * @param {object} [options]
 * @returns {MessageBus}
 */
export function createMessageBus(options = {}) {
    return new MessageBus(options);
}
