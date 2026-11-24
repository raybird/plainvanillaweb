import { BaseService } from './base-service.js';
import {
    DEFAULT_NAMESPACE,
    generateContextId,
    getCoordinationCapabilities,
} from './broadcast-channel.js';
import { LeaderElection } from './leader-election.js';
import { DEFAULT_BUS_CHANNEL, MessageBus } from './message-bus.js';
import { RPC_ERROR_CODES, RpcChannel } from './rpc-channel.js';

/** SharedConnection 標準錯誤代碼 */
export const SHARED_CONNECTION_ERROR_CODES = Object.freeze({
    UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
    UNSUPPORTED_ENVIRONMENT: 'UNSUPPORTED_ENVIRONMENT',
    NOT_STARTED: 'NOT_STARTED',
    NOT_CONNECTED: 'NOT_CONNECTED',
    CONNECTION_CLOSED: 'CONNECTION_CLOSED',
    SEND_FAILED: 'SEND_FAILED',
    RECONNECT_EXHAUSTED: 'RECONNECT_EXHAUSTED',
    TIMEOUT: 'TIMEOUT',
    ABORTED: 'ABORTED',
});

/** 預設斷線重連指數退避參數 */
export const DEFAULT_RECONNECT_OPTIONS = Object.freeze({
    enabled: true,
    initialDelayMs: 500,
    maxDelayMs: 30000,
    factor: 2,
    jitter: 0.2,
    maxAttempts: Infinity,
});

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const WS_OPEN = 1;

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function hasNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function assertSafeObject(value, path = 'value', seen = new WeakSet()) {
    if (value === undefined || value === null || typeof value !== 'object') {
        if (typeof value === 'function' || typeof value === 'symbol') {
            throw new TypeError(`SharedConnection ${path} cannot contain functions or symbols`);
        }
        return;
    }
    if (seen.has(value)) {
        throw new TypeError(`SharedConnection ${path} contains circular reference`);
    }
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                assertSafeObject(value[i], `${path}[${i}]`, seen);
            }
            return;
        }
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            throw new TypeError(`SharedConnection ${path} nested objects must be plain objects or arrays`);
        }
        for (const key of Object.keys(value)) {
            if (FORBIDDEN_KEYS.has(key)) {
                throw new TypeError(`SharedConnection ${path} contains forbidden key: ${key}`);
            }
            assertSafeObject(value[key], `${path}.${key}`, seen);
        }
    } finally {
        seen.delete(value);
    }
}

function canonicalStringify(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (seen.has(value)) {
        throw new TypeError('SharedConnection value contains circular reference');
    }
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            return `[${value.map((item) => canonicalStringify(item, seen)).join(',')}]`;
        }
        const keys = Object.keys(value).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k], seen)}`).join(',')}}`;
    } finally {
        seen.delete(value);
    }
}

function normalizeProtocols(protocols) {
    if (protocols === undefined) return undefined;
    if (isNonEmptyString(protocols)) {
        return Object.freeze([protocols]);
    }
    if (Array.isArray(protocols) && protocols.length > 0 && protocols.every(isNonEmptyString)) {
        return Object.freeze([...protocols]);
    }
    throw new TypeError('SharedConnection protocols must be a non-empty string or non-empty string array');
}

function normalizeReconnectOptions(reconnect) {
    if (reconnect === false) {
        return Object.freeze({ ...DEFAULT_RECONNECT_OPTIONS, enabled: false });
    }
    if (reconnect === undefined || reconnect === true) {
        return DEFAULT_RECONNECT_OPTIONS;
    }
    if (!isPlainObject(reconnect)) {
        throw new TypeError('SharedConnection reconnect must be a boolean or plain object');
    }

    const enabled = reconnect.enabled !== undefined ? Boolean(reconnect.enabled) : true;
    const initialDelayMs = reconnect.initialDelayMs ?? DEFAULT_RECONNECT_OPTIONS.initialDelayMs;
    const maxDelayMs = reconnect.maxDelayMs ?? DEFAULT_RECONNECT_OPTIONS.maxDelayMs;
    const factor = reconnect.factor ?? DEFAULT_RECONNECT_OPTIONS.factor;
    const jitter = reconnect.jitter ?? DEFAULT_RECONNECT_OPTIONS.jitter;
    const maxAttempts = reconnect.maxAttempts ?? DEFAULT_RECONNECT_OPTIONS.maxAttempts;

    if (typeof initialDelayMs !== 'number' || !Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
        throw new TypeError('SharedConnection reconnect.initialDelayMs must be a non-negative finite number');
    }
    if (typeof maxDelayMs !== 'number' || !Number.isFinite(maxDelayMs) || maxDelayMs < initialDelayMs) {
        throw new TypeError('SharedConnection reconnect.maxDelayMs must be >= initialDelayMs');
    }
    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 1) {
        throw new TypeError('SharedConnection reconnect.factor must be >= 1');
    }
    if (typeof jitter !== 'number' || !Number.isFinite(jitter) || jitter < 0 || jitter > 1) {
        throw new TypeError('SharedConnection reconnect.jitter must be between 0 and 1');
    }
    if (maxAttempts !== Infinity && (typeof maxAttempts !== 'number' || !Number.isInteger(maxAttempts) || maxAttempts < 0)) {
        throw new TypeError('SharedConnection reconnect.maxAttempts must be Infinity or a non-negative integer');
    }

    return Object.freeze({ enabled, initialDelayMs, maxDelayMs, factor, jitter, maxAttempts });
}

/**
 * SharedConnection 專用標準錯誤類別
 */
export class SharedConnectionError extends Error {
    /**
     * @param {string} code 錯誤代碼（見 SHARED_CONNECTION_ERROR_CODES）
     * @param {string} message 錯誤訊息
     * @param {{ data?: any, cause?: unknown }} [options]
     */
    constructor(code, message, options = {}) {
        super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = 'SharedConnectionError';
        this.code = isNonEmptyString(code) ? code : SHARED_CONNECTION_ERROR_CODES.SEND_FAILED;
        if (options?.data !== undefined) {
            this.data = options.data;
        }
    }
}

/**
 * 依連線類型、正規化端點網址、身分鍵（identityKey）與設定鍵（configKey）建立隔離的 canonical scopeKey，
 * 避免不同帳號、不同端點或不同參數誤用同一條共享連線。
 *
 * 警告：請勿將認證 token 或帳密放進 URL、identityKey 或 configKey。
 *
 * @param {object} options
 * @param {'websocket' | 'sse'} options.transport 傳輸型別
 * @param {string} options.url 目標端點網址
 * @param {string} [options.identityKey] 帳號／會話識別鍵（預設 'anonymous'）
 * @param {string | Record<string, any>} [options.configKey] 額外連線設定識別鍵（預設 'default'）
 * @param {string | string[]} [options.protocols] WebSocket 子協定
 * @param {boolean} [options.withCredentials] SSE 是否攜帶跨站認證 Cookie
 * @returns {{ scopeKey: string, transport: 'websocket' | 'sse', url: string, identityKey: string, configKey: string, protocols: readonly string[] | undefined, withCredentials: boolean | undefined }}
 */
export function buildConnectionScope({
    transport,
    url,
    identityKey = 'anonymous',
    configKey = 'default',
    protocols,
    withCredentials,
} = {}) {
    if (transport !== 'websocket' && transport !== 'sse') {
        throw new TypeError("SharedConnection transport must be 'websocket' or 'sse'");
    }
    if (!isNonEmptyString(url)) {
        throw new TypeError('SharedConnection url must be a non-empty string');
    }

    const base = typeof globalThis.location?.href === 'string' ? globalThis.location.href : undefined;
    let parsed;
    try {
        parsed = base ? new URL(url, base) : new URL(url);
    } catch (err) {
        throw new TypeError(`SharedConnection url is invalid: ${err?.message || err}`);
    }

    if (parsed.username || parsed.password) {
        throw new TypeError('SharedConnection url must not include embedded credentials');
    }

    if (transport === 'websocket') {
        if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
            throw new TypeError("WebSocket SharedConnection url must use 'ws:' or 'wss:' protocol");
        }
        if (withCredentials !== undefined) {
            throw new TypeError('WebSocket SharedConnection does not support withCredentials');
        }
    } else {
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new TypeError("SSE SharedConnection url must use 'http:' or 'https:' protocol");
        }
        if (protocols !== undefined) {
            throw new TypeError('SSE SharedConnection does not support protocols');
        }
        if (withCredentials !== undefined && typeof withCredentials !== 'boolean') {
            throw new TypeError('SSE SharedConnection withCredentials must be a boolean');
        }
    }

    if (!isNonEmptyString(identityKey)) {
        throw new TypeError('SharedConnection identityKey must be a non-empty string');
    }

    let normalizedConfigKey;
    if (typeof configKey === 'string') {
        if (!isNonEmptyString(configKey)) {
            throw new TypeError('SharedConnection configKey string must be non-empty');
        }
        normalizedConfigKey = configKey;
    } else if (isPlainObject(configKey)) {
        assertSafeObject(configKey, 'configKey');
        normalizedConfigKey = canonicalStringify(configKey);
    } else {
        throw new TypeError('SharedConnection configKey must be a non-empty string or plain object');
    }

    const normalizedProtocols = transport === 'websocket' ? normalizeProtocols(protocols) : undefined;
    const normalizedWithCredentials = transport === 'sse' ? Boolean(withCredentials) : undefined;

    parsed.hash = '';
    const normalizedUrl = parsed.href;
    const extraSegment =
        transport === 'websocket'
            ? JSON.stringify(normalizedProtocols ?? [])
            : String(normalizedWithCredentials);

    const scopeKey = [
        'sc',
        transport,
        normalizedUrl,
        identityKey,
        normalizedConfigKey,
        extraSegment,
    ]
        .map((part) => encodeURIComponent(part))
        .join('|');

    return Object.freeze({
        scopeKey,
        transport,
        url: normalizedUrl,
        identityKey,
        configKey: normalizedConfigKey,
        protocols: normalizedProtocols,
        withCredentials: normalizedWithCredentials,
    });
}

/**
 * SharedConnection - 基於 Web Locks Leader Election 與 MessageBus/RpcChannel 的跨分頁共享即時連線。
 *
 * 行為保證：
 * - 完全 opt-in，匯入與建構均零副作用；必須顯式 `await start()` 才參與競選與連線。
 * - 同 `namespace` + `scopeKey` 在穩定狀態只由現任 leader 持有 1 條上游 `WebSocket` 或 `EventSource` 連線。
 * - `websocket` 支援雙向接收與經 leader 轉發之 `send()`（失敗／逾時不自動重試）；
 *   `sse` 為嚴格單向接收，`canSend === false`，呼叫 `send()` 立即以 `UNSUPPORTED_OPERATION` 拒絕。
 * - failover 切換期間可能短暫遺漏伺服器推播或於伺服器端出現短暫舊連線重疊；需透過 `onResync`／`lastEventId`／服務端 fencing 補強。
 */
export class SharedConnection extends BaseService {
    /**
     * @param {object} options
     * @param {'websocket' | 'sse'} options.transport 傳輸型別
     * @param {string} options.url 目標端點網址（不可含帳密）
     * @param {string} [options.identityKey] 帳號／身分隔離鍵
     * @param {string | Record<string, any>} [options.configKey] 設定隔離鍵
     * @param {string | string[]} [options.protocols] WebSocket 子協定
     * @param {boolean} [options.withCredentials] SSE 是否攜帶跨站憑證
     * @param {string[]} [options.eventTypes] SSE 額外監聽之具名事件清單
     * @param {string} [options.namespace] 邏輯命名空間（預設 'default'）
     * @param {string} [options.channelName] 未注入 bus 時使用的 BroadcastChannel 名稱
     * @param {MessageBus} [options.bus] 外部注入的 MessageBus（dispose 時不會代為關閉）
     * @param {object} [options.busTransport] 未注入 bus 時透傳的自訂 Broadcast transport
     * @param {{ request: Function }} [options.locks] 可注入的自訂 LockManager（測試用）
     * @param {Function} [options.WebSocket] 自訂 WebSocket 建構子（測試用）
     * @param {Function} [options.EventSource] 自訂 EventSource 建構子（測試用）
     * @param {string} [options.nodeId] 自訂節點識別碼
     * @param {(ctx: object) => string | Promise<string>} [options.resolveUrl] 僅於 leader 本地建線前呼叫的網址解析器（結果絕不廣播）
     * @param {(ctx: object) => void | Promise<void>} [options.onResync] leader 連線／重連／接管就緒後執行的重新同步回呼
     * @param {(ctx: object) => void | Promise<void>} [options.onSubscriptionsChange] leader 已連線且跨分頁訂閱聯集異動時的回呼
     * @param {boolean | object} [options.reconnect] 重連與指數退避選項
     * @param {number} [options.sendTimeoutMs] follower RPC 轉發逾時毫秒數（預設 5000）
     * @param {boolean} [options.releaseOnFreeze] 背景凍結（freeze）時是否主動斷線讓鎖（預設 false）
     */
    constructor(options = {}) {
        super();
        if (!isPlainObject(options)) {
            throw new TypeError('SharedConnection options must be a plain object');
        }

        let injectedBus = null;
        if (options.bus !== undefined && options.bus !== null) {
            const candidate = options.bus;
            if (
                typeof candidate !== 'object' ||
                typeof candidate.publish !== 'function' ||
                typeof candidate.subscribe !== 'function' ||
                !isNonEmptyString(candidate.tabId) ||
                !isNonEmptyString(candidate.namespace)
            ) {
                throw new TypeError('SharedConnection options.bus must be a valid MessageBus instance');
            }
            if (options.namespace !== undefined && options.namespace !== candidate.namespace) {
                throw new TypeError('SharedConnection options.namespace does not match injected bus.namespace');
            }
            injectedBus = candidate;
        }

        const namespace = options.namespace ?? injectedBus?.namespace ?? DEFAULT_NAMESPACE;
        if (!isNonEmptyString(namespace)) {
            throw new TypeError('SharedConnection namespace must be a non-empty string');
        }
        if (options.channelName !== undefined && !isNonEmptyString(options.channelName)) {
            throw new TypeError('SharedConnection channelName must be a non-empty string');
        }
        if (options.nodeId !== undefined && !isNonEmptyString(options.nodeId)) {
            throw new TypeError('SharedConnection nodeId must be a non-empty string');
        }

        const scope = buildConnectionScope({
            transport: options.transport,
            url: options.url,
            identityKey: options.identityKey,
            configKey: options.configKey,
            protocols: options.protocols,
            withCredentials: options.withCredentials,
        });

        let eventTypes = [];
        if (options.eventTypes !== undefined) {
            if (!Array.isArray(options.eventTypes) || !options.eventTypes.every(isNonEmptyString)) {
                throw new TypeError('SharedConnection eventTypes must be an array of non-empty strings');
            }
            eventTypes = [...new Set(options.eventTypes)].filter((name) => name !== 'message');
        }

        if (options.resolveUrl !== undefined && typeof options.resolveUrl !== 'function') {
            throw new TypeError('SharedConnection resolveUrl must be a function');
        }
        if (options.onResync !== undefined && typeof options.onResync !== 'function') {
            throw new TypeError('SharedConnection onResync must be a function');
        }
        if (options.onSubscriptionsChange !== undefined && typeof options.onSubscriptionsChange !== 'function') {
            throw new TypeError('SharedConnection onSubscriptionsChange must be a function');
        }

        const sendTimeoutMs = options.sendTimeoutMs ?? 5000;
        if (typeof sendTimeoutMs !== 'number' || !Number.isFinite(sendTimeoutMs) || sendTimeoutMs <= 0) {
            throw new TypeError('SharedConnection sendTimeoutMs must be a positive finite number');
        }

        if (options.releaseOnFreeze !== undefined && typeof options.releaseOnFreeze !== 'boolean') {
            throw new TypeError('SharedConnection releaseOnFreeze must be a boolean');
        }

        if (options.locks !== undefined && (!options.locks || typeof options.locks.request !== 'function')) {
            throw new TypeError('SharedConnection options.locks must provide a request() method');
        }

        const locksCtor = options.locks ?? (typeof globalThis.navigator?.locks?.request === 'function' ? globalThis.navigator.locks : null);
        const wsCtor = options.WebSocket ?? (typeof globalThis.WebSocket === 'function' ? globalThis.WebSocket : null);
        const sseCtor = options.EventSource ?? (typeof globalThis.EventSource === 'function' ? globalThis.EventSource : null);

        if (options.WebSocket !== undefined && typeof options.WebSocket !== 'function') {
            throw new TypeError('SharedConnection options.WebSocket must be a constructor function');
        }
        if (options.EventSource !== undefined && typeof options.EventSource !== 'function') {
            throw new TypeError('SharedConnection options.EventSource must be a constructor function');
        }

        this._scope = scope;
        this._transport = scope.transport;
        this._namespace = namespace;
        this._channelName = injectedBus?.channelName ?? options.channelName ?? DEFAULT_BUS_CHANNEL;
        this._injectedBus = injectedBus;
        this._busTransportOption = options.busTransport;
        this._locksOption = options.locks;
        this._hasLocks = Boolean(locksCtor);
        this._WebSocketCtor = wsCtor;
        this._EventSourceCtor = sseCtor;
        this._eventTypes = Object.freeze(eventTypes);
        this._resolveUrl = options.resolveUrl ?? null;
        this._onResync = options.onResync ?? null;
        this._onSubscriptionsChange = options.onSubscriptionsChange ?? null;
        this._reconnectOptions = normalizeReconnectOptions(options.reconnect);
        this._sendTimeoutMs = sendTimeoutMs;
        this._releaseOnFreeze = Boolean(options.releaseOnFreeze);
        this._nodeId = options.nodeId ?? injectedBus?.tabId ?? generateContextId();

        // Scoped 內部協定主題與 RPC 方法名稱
        this._topicMsg = `__sc:msg:${scope.scopeKey}`;
        this._topicState = `__sc:state:${scope.scopeKey}`;
        this._topicResync = `__sc:resync:${scope.scopeKey}`;
        this._topicSubs = `__sc:subs:${scope.scopeKey}`;
        this._topicSubsQuery = `__sc:subs-query:${scope.scopeKey}`;
        this._topicHello = `__sc:hello:${scope.scopeKey}`;
        this._rpcMethodSend = `__sc:send:${scope.scopeKey}`;

        this._supported = Boolean(
            this._hasLocks &&
            (this._transport === 'websocket' ? this._WebSocketCtor : this._EventSourceCtor)
        );
        this._state = this._supported ? 'idle' : 'unsupported';

        this._started = false;
        this._disposed = false;
        this._disposing = false;
        this._startToken = 0;
        this._startPromise = null;
        this._stopPromise = null;
        this._disposePromise = null;
        this._inFreezeRelease = false;
        this._pageLifecycleBound = false;
        this._onPageHide = (ev) => {
            if (this._started && !this._disposed && !ev?.persisted) {
                this._publishLocalSubscriptions({ leaving: true });
            }
        };
        this._onPageShow = (ev) => {
            if (this._started && !this._disposed && ev?.persisted && !this._election?.isLeader) {
                this._syncAsFollower();
            }
        };

        this._bus = injectedBus;
        this._ownsBus = false;
        this._election = null;
        this._rpc = null;
        this._busUnsubs = [];
        this._electionUnsubs = [];
        this._unregSendRpc = null;

        this._socket = null;
        this._socketCleanup = null;
        this._connectGen = 0;
        this._reconnectTimer = null;
        this._reconnectAttempt = 0;
        this._leaderId = null;
        this._leaderEpoch = 0;
        this._lastEventId = '';

        this._localChannels = new Set();
        this._peerChannels = new Map();
        this._aggregatedChannels = [];
    }

    /** @private */
    _setState(nextState, reason = 'transition', extra = {}) {
        const previousState = this._state;
        this._state = nextState;

        const detail = Object.freeze({
            state: nextState,
            previousState,
            reason,
            role: this.role,
            epoch: this.epoch,
            leaderId: this._leaderId,
            attempt: extra.attempt ?? this._reconnectAttempt,
            lastEventId: this._lastEventId,
            scopeKey: this._scope.scopeKey,
            transport: this._transport,
            timestamp: Date.now(),
        });

        if (previousState !== nextState || extra.forceEmit) {
            this.emit('state-change', detail);
        }

        if (this._election?.isLeader && extra.broadcast !== false) {
            this._publishBus(this._topicState, {
                state: nextState,
                reason,
                leaderId: this._nodeId,
                epoch: this._election.epoch,
                attempt: detail.attempt,
                lastEventId: this._lastEventId,
            });
        }
    }

    /** @private */
    _publishBus(topic, payload) {
        if (!this._bus || this._bus.closed || !this._bus.supported) return false;
        try {
            const res = this._bus.publish(topic, payload, { local: false, remote: true });
            return Boolean(res.remoteSent);
        } catch {
            return false;
        }
    }

    /** @private */
    _recomputeSubscriptions(notifyHook = true) {
        const merged = new Set(this._localChannels);
        if (this._election?.isLeader) {
            for (const peerSet of this._peerChannels.values()) {
                for (const ch of peerSet) merged.add(ch);
            }
        }
        const nextList = [...merged].sort();
        const prevSet = new Set(this._aggregatedChannels);
        const nextSet = new Set(nextList);

        const added = nextList.filter((c) => !prevSet.has(c));
        const removed = this._aggregatedChannels.filter((c) => !nextSet.has(c));
        this._aggregatedChannels = nextList;

        if (added.length === 0 && removed.length === 0) return;
        this.emit('subscriptions-change', {
            subscriptions: [...nextList],
            added,
            removed,
            scopeKey: this._scope.scopeKey,
        });

        if (
            notifyHook &&
            this._onSubscriptionsChange &&
            this._election?.isLeader &&
            this._state === 'open'
        ) {
            Promise.resolve()
                .then(() =>
                    this._onSubscriptionsChange({
                        added,
                        removed,
                        subscriptions: [...nextList],
                        epoch: this._election.epoch,
                        transport: this._transport,
                        send: this._transport === 'websocket' ? (data) => this._leaderDirectSend(data) : undefined,
                    })
                )
                .catch((err) => {
                    if (!this._disposed) {
                        this.emit('error', { error: err, stage: 'subscriptions-change', scopeKey: this._scope.scopeKey });
                    }
                });
        }
    }

    /** @private */
    _publishLocalSubscriptions({ leaving = false } = {}) {
        if (!this._started || !this._bus || this._bus.closed) return;
        this._publishBus(this._topicSubs, {
            nodeId: this._nodeId,
            channels: leaving ? [] : [...this._localChannels],
            leaving,
        });
    }

    /** @private */
    _syncAsFollower() {
        this._publishLocalSubscriptions();
        this._publishBus(this._topicHello, { nodeId: this._nodeId });
    }

    /** @private */
    _attachPageLifecycle() {
        if (this._pageLifecycleBound || typeof globalThis.addEventListener !== 'function') return;
        globalThis.addEventListener('pagehide', this._onPageHide);
        globalThis.addEventListener('pageshow', this._onPageShow);
        this._pageLifecycleBound = true;
    }

    /** @private */
    _detachPageLifecycle() {
        if (!this._pageLifecycleBound) return;
        if (typeof globalThis.removeEventListener === 'function') {
            globalThis.removeEventListener('pagehide', this._onPageHide);
            globalThis.removeEventListener('pageshow', this._onPageShow);
        }
        this._pageLifecycleBound = false;
    }

    /** @private */
    _bindCoordination() {
        const bus =
            this._injectedBus ??
            new MessageBus({
                namespace: this._namespace,
                channelName: this._channelName,
                transport: this._busTransportOption,
                tabId: this._nodeId,
            });
        this._bus = bus;
        this._ownsBus = !this._injectedBus;
        this._attachPageLifecycle();

        this._election = new LeaderElection({
            namespace: this._namespace,
            scope: this._scope.scopeKey,
            nodeId: this._nodeId,
            bus,
            locks: this._locksOption,
            releaseOnFreeze: this._releaseOnFreeze,
        });

        this._rpc = new RpcChannel({
            bus,
            timeoutMs: this._sendTimeoutMs,
        });

        this._busUnsubs.push(
            bus.subscribe(
                this._topicMsg,
                (payload) => {
                    if (!this._started || this._disposed || this._election?.isLeader) return;
                    if (!isPlainObject(payload)) return;
                    if (hasNonEmptyString(payload.lastEventId)) {
                        this._lastEventId = payload.lastEventId;
                    }
                    if (typeof payload.epoch === 'number' && Number.isFinite(payload.epoch)) {
                        this._leaderEpoch = payload.epoch;
                    }
                    if (isNonEmptyString(payload.leaderId)) {
                        this._leaderId = payload.leaderId;
                    }
                    this.emit('message', {
                        ...payload,
                        relayed: true,
                    });
                },
                { receive: 'remote' }
            ),
            bus.subscribe(
                this._topicState,
                (payload) => {
                    if (!this._started || this._disposed || this._election?.isLeader) return;
                    if (!isPlainObject(payload) || !isNonEmptyString(payload.state)) return;
                    this._leaderId = isNonEmptyString(payload.leaderId) ? payload.leaderId : this._leaderId;
                    if (typeof payload.epoch === 'number' && Number.isFinite(payload.epoch)) {
                        this._leaderEpoch = payload.epoch;
                    }
                    if (hasNonEmptyString(payload.lastEventId)) {
                        this._lastEventId = payload.lastEventId;
                    }
                    if (typeof payload.attempt === 'number' && Number.isFinite(payload.attempt)) {
                        this._reconnectAttempt = payload.attempt;
                    }
                    this._setState(payload.state, payload.reason || 'remote-state', {
                        broadcast: false,
                        attempt: payload.attempt,
                    });
                },
                { receive: 'remote' }
            ),
            bus.subscribe(
                this._topicResync,
                (payload) => {
                    if (!this._started || this._disposed || this._election?.isLeader) return;
                    if (!isPlainObject(payload)) return;
                    if (hasNonEmptyString(payload.lastEventId)) {
                        this._lastEventId = payload.lastEventId;
                    }
                    this.emit('resync', {
                        ...payload,
                        relayed: true,
                    });
                },
                { receive: 'remote' }
            ),
            bus.subscribe(
                this._topicSubs,
                (payload) => {
                    if (!this._started || this._disposed || !this._election?.isLeader) return;
                    if (!isPlainObject(payload) || !isNonEmptyString(payload.nodeId)) return;
                    if (payload.leaving) {
                        this._peerChannels.delete(payload.nodeId);
                    } else if (Array.isArray(payload.channels)) {
                        const clean = payload.channels.filter(isNonEmptyString);
                        this._peerChannels.set(payload.nodeId, new Set(clean));
                    }
                    this._recomputeSubscriptions(true);
                },
                { receive: 'remote' }
            ),
            bus.subscribe(
                this._topicSubsQuery,
                () => {
                    if (!this._started || this._disposed || this._election?.isLeader) return;
                    if (this._localChannels.size > 0) {
                        this._publishLocalSubscriptions();
                    }
                },
                { receive: 'remote' }
            ),
            bus.subscribe(
                this._topicHello,
                () => {
                    if (!this._started || this._disposed || !this._election?.isLeader) return;
                    this._publishBus(this._topicState, {
                        state: this._state,
                        reason: 'sync-hello',
                        leaderId: this._nodeId,
                        epoch: this._election.epoch,
                        attempt: this._reconnectAttempt,
                        lastEventId: this._lastEventId,
                    });
                },
                { receive: 'remote' }
            )
        );

        this._electionUnsubs.push(
            this._election.on('role-change', ({ role, previousRole, takeover, reason }) => {
                this.emit('role-change', {
                    role,
                    previousRole,
                    epoch: this._election?.epoch ?? 0,
                    takeover: Boolean(takeover),
                    reason,
                    scopeKey: this._scope.scopeKey,
                });
                if (!this._started || this._disposed) return;

                if (role === 'leader') {
                    this._inFreezeRelease = false;
                    this._becomeLeader(takeover ? 'takeover' : 'connect');
                } else if (previousRole === 'leader') {
                    this._stepDownFromLeader(reason || 'step-down');
                    if (role === 'follower') {
                        this._inFreezeRelease = false;
                        this._setState('connecting', 'leader-changing', { broadcast: false });
                        if (!this._startPromise) {
                            this._syncAsFollower();
                        }
                    }
                } else if (role === 'follower') {
                    this._inFreezeRelease = false;
                    if (this._state === 'idle' || previousRole === 'idle') {
                        this._setState('connecting', reason || 'contended', { broadcast: false });
                    }
                    if (!this._startPromise) {
                        this._syncAsFollower();
                    }
                }
            }),
            this._election.on('error', (detail) => {
                if (!this._disposed) {
                    this.emit('error', { ...detail, stage: 'election', scopeKey: this._scope.scopeKey });
                }
            }),
            this._election.on('freeze', () => {
                this._inFreezeRelease = true;
            }),
            this._election.on('resigned', () => {
                this._inFreezeRelease = false;
            }),
            this._election.on('resume', () => {
                this._inFreezeRelease = false;
            }),
            this._election.on('cancelled', ({ reason }) => {
                if (this._inFreezeRelease) {
                    this._inFreezeRelease = false;
                    return;
                }
                if (
                    !this._started ||
                    this._disposed ||
                    this._disposing ||
                    this._startPromise
                ) {
                    return;
                }
                void this.stop(reason || 'cancelled');
            })
        );
    }

    /** @private */
    _closeActiveSocket() {
        this._connectGen += 1;
        if (this._reconnectTimer !== null) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._socketCleanup) {
            try {
                this._socketCleanup();
            } catch {
                // 忽略清理例外
            }
            this._socketCleanup = null;
        }
        const socket = this._socket;
        this._socket = null;
        if (socket && typeof socket.close === 'function') {
            try {
                socket.close();
            } catch {
                // 忽略關閉例外
            }
        }
    }

    /** @private */
    _stepDownFromLeader(reason) {
        this._closeActiveSocket();
        if (this._unregSendRpc) {
            this._unregSendRpc();
            this._unregSendRpc = null;
        }
        this._peerChannels.clear();
        this._recomputeSubscriptions(false);
        if (this._leaderId === this._nodeId) {
            this._leaderId = null;
        }
        if (reason === 'freeze' && this._started && !this._disposed) {
            this._setState('idle', 'freeze', { broadcast: false });
        }
    }

    /** @private */
    _becomeLeader(reason) {
        this._stepDownFromLeader('re-elect');
        this._leaderId = this._nodeId;
        this._leaderEpoch = this._election?.epoch ?? 0;
        this._reconnectAttempt = 0;

        if (this._transport === 'websocket' && this._rpc && !this._rpc.closed) {
            this._unregSendRpc = this._rpc.register(
                this._rpcMethodSend,
                (params) => {
                    if (!isPlainObject(params) || params.data === undefined) {
                        throw new SharedConnectionError(
                            SHARED_CONNECTION_ERROR_CODES.SEND_FAILED,
                            'Missing data payload for SharedConnection send'
                        );
                    }
                    return {
                        ...this._leaderDirectSend(params.data),
                        relayed: true,
                    };
                },
                { allowOverwrite: true }
            );
        }

        // 向既有 followers 徵集訂閱集合，確保接管後保留完整訂閱聯集
        this._publishBus(this._topicSubsQuery, {
            leaderId: this._nodeId,
            epoch: this._leaderEpoch,
        });
        this._recomputeSubscriptions(false);
        this._setState('connecting', reason, { attempt: 0 });
        void this._openLeaderConnection(reason, 0);
    }

    /** @private */
    _computeReconnectDelay(attempt) {
        const { initialDelayMs, maxDelayMs, factor, jitter } = this._reconnectOptions;
        const base = Math.min(maxDelayMs, initialDelayMs * Math.pow(factor, Math.max(0, attempt - 1)));
        if (jitter === 0) return Math.round(base);
        const spread = base * jitter;
        const delta = (Math.random() * 2 - 1) * spread;
        return Math.max(0, Math.round(Math.min(maxDelayMs, base + delta)));
    }

    /** @private */
    _scheduleReconnect(gen, cause) {
        if (gen !== this._connectGen || !this._started || this._disposed || !this._election?.isLeader) return;

        if (!this._reconnectOptions.enabled || this._reconnectAttempt >= this._reconnectOptions.maxAttempts) {
            this._setState('closed', 'reconnect-exhausted', { attempt: this._reconnectAttempt });
            this.emit('error', {
                error: new SharedConnectionError(
                    SHARED_CONNECTION_ERROR_CODES.RECONNECT_EXHAUSTED,
                    'SharedConnection reconnect attempts exhausted',
                    { cause }
                ),
                stage: 'reconnect',
                scopeKey: this._scope.scopeKey,
            });
            return;
        }

        this._reconnectAttempt += 1;
        const attempt = this._reconnectAttempt;
        const delayMs = this._computeReconnectDelay(attempt);
        this._setState('reconnecting', 'reconnect-scheduled', { attempt });

        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (gen !== this._connectGen || !this._started || this._disposed || !this._election?.isLeader) return;
            void this._openLeaderConnection('reconnect', attempt);
        }, delayMs);
    }

    /** @private */
    async _openLeaderConnection(reason, attempt) {
        const gen = ++this._connectGen;
        if (!this._started || this._disposed || !this._election?.isLeader) return;

        let targetUrl = this._scope.url;
        if (this._resolveUrl) {
            try {
                const resolved = await this._resolveUrl({
                    url: this._scope.url,
                    transport: this._transport,
                    epoch: this._election.epoch,
                    attempt,
                    lastEventId: this._lastEventId,
                    subscriptions: [...this._aggregatedChannels],
                    scopeKey: this._scope.scopeKey,
                });
                if (typeof resolved !== 'string' || !resolved.trim()) {
                    throw new TypeError('resolveUrl must resolve to a non-empty URL string');
                }
                targetUrl = resolved;
            } catch (err) {
                if (gen !== this._connectGen || !this._started || this._disposed || !this._election?.isLeader) return;
                this.emit('error', { error: err, stage: 'resolve-url', scopeKey: this._scope.scopeKey });
                this._scheduleReconnect(gen, err);
                return;
            }
        }

        if (gen !== this._connectGen || !this._started || this._disposed || !this._election?.isLeader) {
            return;
        }

        try {
            if (this._transport === 'websocket') {
                this._attachWebSocket(targetUrl, reason, attempt, gen);
            } else {
                this._attachEventSource(targetUrl, reason, attempt, gen);
            }
        } catch (err) {
            if (gen !== this._connectGen || !this._started || this._disposed || !this._election?.isLeader) return;
            this.emit('error', { error: err, stage: 'connect', scopeKey: this._scope.scopeKey });
            this._scheduleReconnect(gen, err);
        }
    }

    /** @private */
    _handleConnectionOpened(reason, attempt, gen) {
        if (gen !== this._connectGen || !this._started || this._disposed || !this._election?.isLeader) return;
        this._reconnectAttempt = 0;
        const epoch = this._election.epoch;
        this._setState('open', reason, { attempt: 0 });

        if (this._onResync) {
            Promise.resolve()
                .then(() =>
                    this._onResync({
                        reason,
                        epoch,
                        attempt,
                        lastEventId: this._lastEventId,
                        subscriptions: [...this._aggregatedChannels],
                        transport: this._transport,
                        send: this._transport === 'websocket' ? (data) => this._leaderDirectSend(data) : undefined,
                    })
                )
                .then(() => {
                    if (gen !== this._connectGen || !this._started || this._disposed || !this._election?.isLeader) return;
                    const detail = {
                        reason,
                        epoch,
                        attempt,
                        lastEventId: this._lastEventId,
                        subscriptions: [...this._aggregatedChannels],
                        leaderId: this._nodeId,
                    };
                    this.emit('resync', { ...detail, relayed: false });
                    this._publishBus(this._topicResync, detail);
                })
                .catch((err) => {
                    if (gen === this._connectGen && !this._disposed) {
                        this.emit('error', { error: err, stage: 'resync', scopeKey: this._scope.scopeKey });
                    }
                });
        } else if (reason === 'reconnect' || reason === 'takeover') {
            const detail = {
                reason,
                epoch,
                attempt,
                lastEventId: this._lastEventId,
                subscriptions: [...this._aggregatedChannels],
                leaderId: this._nodeId,
            };
            this.emit('resync', { ...detail, relayed: false });
            this._publishBus(this._topicResync, detail);
        }
    }

    /** @private */
    _attachWebSocket(targetUrl, reason, attempt, gen) {
        const ws = this._scope.protocols
            ? new this._WebSocketCtor(targetUrl, [...this._scope.protocols])
            : new this._WebSocketCtor(targetUrl);
        this._socket = ws;

        const isCurrent = () =>
            gen === this._connectGen &&
            this._socket === ws &&
            this._started &&
            !this._disposed &&
            Boolean(this._election?.isLeader);

        const onOpen = () => {
            if (!isCurrent()) {
                try { ws.close(); } catch { /* noop */ }
                return;
            }
            this._handleConnectionOpened(reason, attempt, gen);
        };

        const onMessage = (event) => {
            if (!isCurrent()) return;
            const msg = {
                data: event.data,
                transport: 'websocket',
                scopeKey: this._scope.scopeKey,
                leaderId: this._nodeId,
                epoch: this._election.epoch,
            };
            this.emit('message', { ...msg, relayed: false });
            this._publishBus(this._topicMsg, msg);
        };

        const onError = (event) => {
            if (!isCurrent()) return;
            this.emit('error', {
                error: event?.error ?? new Error('WebSocket error'),
                stage: 'transport',
                scopeKey: this._scope.scopeKey,
            });
        };

        const onClose = (event) => {
            if (!isCurrent()) return;
            this._socketCleanup?.();
            this._socketCleanup = null;
            this._socket = null;
            const nextGen = ++this._connectGen;
            this._scheduleReconnect(nextGen, event);
        };

        const detach = () => {
            if (typeof ws.removeEventListener === 'function') {
                ws.removeEventListener('open', onOpen);
                ws.removeEventListener('message', onMessage);
                ws.removeEventListener('error', onError);
                ws.removeEventListener('close', onClose);
            } else {
                ws.onopen = null;
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;
            }
        };

        if (typeof ws.addEventListener === 'function') {
            ws.addEventListener('open', onOpen);
            ws.addEventListener('message', onMessage);
            ws.addEventListener('error', onError);
            ws.addEventListener('close', onClose);
        } else {
            ws.onopen = onOpen;
            ws.onmessage = onMessage;
            ws.onerror = onError;
            ws.onclose = onClose;
        }
        this._socketCleanup = detach;
    }

    /** @private */
    _attachEventSource(targetUrl, reason, attempt, gen) {
        const es = new this._EventSourceCtor(targetUrl, {
            withCredentials: this._scope.withCredentials,
        });
        this._socket = es;

        const isCurrent = () =>
            gen === this._connectGen &&
            this._socket === es &&
            this._started &&
            !this._disposed &&
            Boolean(this._election?.isLeader);

        const onOpen = () => {
            if (!isCurrent()) {
                try { es.close(); } catch { /* noop */ }
                return;
            }
            this._handleConnectionOpened(reason, attempt, gen);
        };

        const handleSseMessage = (event) => {
            if (!isCurrent()) return;
            if (typeof event.lastEventId === 'string' && event.lastEventId.length > 0) {
                this._lastEventId = event.lastEventId;
            }
            const msg = {
                data: event.data,
                event: event.type || 'message',
                lastEventId: this._lastEventId,
                transport: 'sse',
                scopeKey: this._scope.scopeKey,
                leaderId: this._nodeId,
                epoch: this._election.epoch,
            };
            this.emit('message', { ...msg, relayed: false });
            this._publishBus(this._topicMsg, msg);
        };

        const onError = (event) => {
            if (!isCurrent()) return;
            this.emit('error', {
                error: event?.error ?? new Error('EventSource connection error'),
                stage: 'transport',
                scopeKey: this._scope.scopeKey,
            });
            // 由 SharedConnection 的退避排程統一重連，確保 resolveUrl、epoch 與 backoff 生效
            this._socketCleanup?.();
            this._socketCleanup = null;
            this._socket = null;
            try { es.close(); } catch { /* noop */ }
            const nextGen = ++this._connectGen;
            this._scheduleReconnect(nextGen, event);
        };

        const customListeners = [];
        const detach = () => {
            if (typeof es.removeEventListener === 'function') {
                es.removeEventListener('open', onOpen);
                es.removeEventListener('message', handleSseMessage);
                es.removeEventListener('error', onError);
                for (const [type, fn] of customListeners) {
                    es.removeEventListener(type, fn);
                }
            } else {
                es.onopen = null;
                es.onmessage = null;
                es.onerror = null;
            }
        };

        if (typeof es.addEventListener === 'function') {
            es.addEventListener('open', onOpen);
            es.addEventListener('message', handleSseMessage);
            es.addEventListener('error', onError);
            for (const eventType of this._eventTypes) {
                es.addEventListener(eventType, handleSseMessage);
                customListeners.push([eventType, handleSseMessage]);
            }
        } else {
            es.onopen = onOpen;
            es.onmessage = handleSseMessage;
            es.onerror = onError;
        }
        this._socketCleanup = detach;
    }

    /** @private */
    _leaderDirectSend(data) {
        if (!this._socket || this._socket.readyState !== WS_OPEN) {
            throw new SharedConnectionError(
                SHARED_CONNECTION_ERROR_CODES.NOT_CONNECTED,
                'WebSocket connection is not currently open'
            );
        }
        try {
            this._socket.send(data);
            return { ok: true, relayed: false, epoch: this._election?.epoch ?? 0 };
        } catch (err) {
            throw new SharedConnectionError(
                SHARED_CONNECTION_ERROR_CODES.SEND_FAILED,
                `WebSocket send failed: ${err?.message || err}`,
                { cause: err }
            );
        }
    }

    /**
     * 啟動共享連線：加入 scoped Web Locks 選舉，由現任 leader 持有唯一連線，follower 接收轉發。
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {Promise<{ started: boolean, state: string, role: string, epoch: number, scopeKey: string, supported: boolean, cancelled?: boolean, reason?: string }>}
     */
    async start(options = {}) {
        if (this._disposed || this._disposing) {
            throw new Error('Cannot start a disposed SharedConnection');
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('SharedConnection start options must be a plain object');
        }
        if (!this._supported) {
            const missing = !this._hasLocks
                ? 'webLocks'
                : this._transport === 'websocket'
                    ? 'WebSocket'
                    : 'EventSource';
            const reason = `Unsupported environment: missing ${missing}`;
            this.emit('unsupported', { missing, reason, scopeKey: this._scope.scopeKey });
            return {
                started: false,
                state: 'unsupported',
                role: 'unsupported',
                epoch: 0,
                scopeKey: this._scope.scopeKey,
                supported: false,
                reason,
            };
        }

        const signal = options?.signal;
        if (signal !== undefined && (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')) {
            throw new TypeError('SharedConnection start options.signal must be an AbortSignal');
        }
        if (signal?.aborted) {
            return {
                started: false,
                state: this._state,
                role: this.role,
                epoch: this.epoch,
                scopeKey: this._scope.scopeKey,
                supported: true,
                cancelled: true,
            };
        }

        if (this._startPromise && this._started && !this._stopPromise) {
            return this._startPromise;
        }
        if (this._started && !this._startPromise && !this._stopPromise) {
            return {
                started: true,
                state: this._state,
                role: this.role,
                epoch: this.epoch,
                scopeKey: this._scope.scopeKey,
                supported: true,
            };
        }

        const prevStart = this._startPromise;
        const token = ++this._startToken;
        this._started = true;

        let startTask;
        startTask = (async () => {
            try {
                if (prevStart) {
                    await prevStart.catch(() => {});
                }
                if (this._stopPromise) {
                    await this._stopPromise;
                }
                if (this._disposed || this._disposing || !this._started || token !== this._startToken) {
                    if (token === this._startToken && !this._disposed && !this._disposing) {
                        this._started = false;
                    }
                    return {
                        started: false,
                        state: this._state,
                        role: this.role,
                        epoch: this.epoch,
                        scopeKey: this._scope.scopeKey,
                        supported: true,
                        cancelled: true,
                    };
                }
                if (signal?.aborted) {
                    this._started = false;
                    return {
                        started: false,
                        state: this._state,
                        role: this.role,
                        epoch: this.epoch,
                        scopeKey: this._scope.scopeKey,
                        supported: true,
                        cancelled: true,
                    };
                }

                this._bindCoordination();
                this._setState('connecting', 'starting', { broadcast: false });

                const res = await this._election.start({ signal });
                if (res.cancelled || this._disposed || this._disposing || !this._started || token !== this._startToken) {
                    await this._cleanupAfterCancelledStart(token);
                    return {
                        started: false,
                        state: this._state,
                        role: this.role,
                        epoch: this.epoch,
                        scopeKey: this._scope.scopeKey,
                        supported: true,
                        cancelled: true,
                    };
                }

                if (!this._election.isLeader) {
                    this._syncAsFollower();
                }

                return {
                    started: true,
                    state: this._state,
                    role: this.role,
                    epoch: this.epoch,
                    scopeKey: this._scope.scopeKey,
                    supported: true,
                };
            } catch (err) {
                await this._cleanupAfterCancelledStart(token);
                throw err;
            }
        })().finally(() => {
            if (this._startPromise === startTask) {
                this._startPromise = null;
            }
        });

        this._startPromise = startTask;
        return startTask;
    }

    /** @private */
    async _cleanupAfterCancelledStart(token = this._startToken) {
        if (token === this._startToken) {
            this._started = false;
        }
        this._stepDownFromLeader('cancelled');
        if (this._stopPromise) {
            await this._stopPromise;
        }
        await this._unbindCoordination();
        if (token === this._startToken && !this._disposed && !this._disposing) {
            this._setState(this._supported ? 'idle' : 'unsupported', 'cancelled', { broadcast: false });
        }
    }

    /** @private */
    async _unbindCoordination() {
        this._detachPageLifecycle();
        this._inFreezeRelease = false;
        const election = this._election;
        const rpc = this._rpc;

        for (const unsub of this._busUnsubs) unsub();
        this._busUnsubs.length = 0;

        rpc?.close();
        this._rpc = null;
        if (election && !election.closed) {
            await election.dispose();
        }
        for (const unsub of this._electionUnsubs) unsub();
        this._electionUnsubs.length = 0;
        this._election = null;

        if (this._ownsBus && this._bus) {
            this._bus.close();
            this._bus = null;
            this._ownsBus = false;
        }
    }

    /**
     * 傳送資料（僅 `websocket` 支援；`sse` 永遠立即以 `UNSUPPORTED_OPERATION` 拒絕）。
     * Follower 會透過 `RpcChannel` 轉發至目前 leader；失敗或逾時絕不自動重試。
     * @param {any} data
     * @param {{ timeoutMs?: number, signal?: AbortSignal }} [options]
     * @returns {Promise<{ ok: boolean, relayed: boolean, epoch: number }>}
     */
    async send(data, options = {}) {
        if (this._transport === 'sse') {
            throw new SharedConnectionError(
                SHARED_CONNECTION_ERROR_CODES.UNSUPPORTED_OPERATION,
                'SSE SharedConnection is unidirectional (receive-only) and does not support send()'
            );
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('SharedConnection send options must be a plain object');
        }
        const opts = options || {};
        const timeoutMs = opts.timeoutMs ?? this._sendTimeoutMs;
        if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new TypeError('SharedConnection options.timeoutMs must be a positive finite number');
        }
        const signal = opts.signal;
        if (signal !== undefined && (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')) {
            throw new TypeError('SharedConnection options.signal must be an AbortSignal');
        }
        if (this._disposed || this._disposing) {
            throw new SharedConnectionError(
                SHARED_CONNECTION_ERROR_CODES.CONNECTION_CLOSED,
                'SharedConnection is disposed'
            );
        }
        if (!this._supported) {
            throw new SharedConnectionError(
                SHARED_CONNECTION_ERROR_CODES.UNSUPPORTED_ENVIRONMENT,
                'SharedConnection is not supported in this environment'
            );
        }
        if (!this._started || !this._election || !this._rpc) {
            throw new SharedConnectionError(
                SHARED_CONNECTION_ERROR_CODES.NOT_STARTED,
                'SharedConnection has not been started'
            );
        }
        if (data === undefined) {
            throw new TypeError('SharedConnection send() requires a defined data payload');
        }
        if (signal?.aborted) {
            throw new SharedConnectionError(
                SHARED_CONNECTION_ERROR_CODES.ABORTED,
                'SharedConnection send() aborted before dispatch'
            );
        }

        if (this._election.isLeader) {
            return this._leaderDirectSend(data);
        }

        try {
            return await this._rpc.call(
                this._rpcMethodSend,
                { data },
                {
                    target: null,
                    allowLocal: false,
                    timeoutMs,
                    signal,
                }
            );
        } catch (err) {
            throw this._mapSendRpcError(err);
        }
    }

    /** @private */
    _mapSendRpcError(err) {
        if (err instanceof SharedConnectionError) return err;
        const code = err?.code;
        if (code === SHARED_CONNECTION_ERROR_CODES.NOT_CONNECTED) {
            return new SharedConnectionError(SHARED_CONNECTION_ERROR_CODES.NOT_CONNECTED, err.message, { cause: err });
        }
        if (code === RPC_ERROR_CODES.TIMEOUT) {
            return new SharedConnectionError(SHARED_CONNECTION_ERROR_CODES.TIMEOUT, err.message, { cause: err });
        }
        if (code === RPC_ERROR_CODES.ABORTED) {
            return new SharedConnectionError(SHARED_CONNECTION_ERROR_CODES.ABORTED, err.message, { cause: err });
        }
        if (code === RPC_ERROR_CODES.CHANNEL_CLOSED) {
            return new SharedConnectionError(SHARED_CONNECTION_ERROR_CODES.CONNECTION_CLOSED, err.message, { cause: err });
        }
        if (code === RPC_ERROR_CODES.TRANSPORT_UNAVAILABLE) {
            return new SharedConnectionError(SHARED_CONNECTION_ERROR_CODES.UNSUPPORTED_ENVIRONMENT, err.message, { cause: err });
        }
        return new SharedConnectionError(
            SHARED_CONNECTION_ERROR_CODES.SEND_FAILED,
            err?.message || 'SharedConnection send failed',
            { cause: err }
        );
    }

    /**
     * 宣告本節點關注的邏輯訂閱頻道（多頁籤訂閱會自動於 leader 端彙整為聯集）。
     * @param {string} channel
     * @returns {() => void} 冪等取消訂閱函式
     */
    subscribe(channel) {
        if (!isNonEmptyString(channel)) {
            throw new TypeError('SharedConnection channel must be a non-empty string');
        }
        if (this._disposed) {
            throw new Error('Cannot subscribe on a disposed SharedConnection');
        }
        const added = !this._localChannels.has(channel);
        this._localChannels.add(channel);
        if (added) {
            this._recomputeSubscriptions(true);
            this._publishLocalSubscriptions();
        }
        return () => this.unsubscribe(channel);
    }

    /**
     * 移除本節點的邏輯訂閱頻道（具冪等性）。
     * @param {string} channel
     */
    unsubscribe(channel) {
        if (!isNonEmptyString(channel)) {
            throw new TypeError('SharedConnection channel must be a non-empty string');
        }
        if (!this._localChannels.delete(channel)) return;
        this._recomputeSubscriptions(true);
        this._publishLocalSubscriptions();
    }

    /**
     * 取得目前彙總（leader 為跨分頁聯集、follower 為本機或最近同步結果）的訂閱清單。
     * @returns {string[]}
     */
    getSubscriptions() {
        return [...this._aggregatedChannels];
    }

    /**
     * 停止共享連線：清理上游連線、通知離開訂閱、釋放 Web Lock。可於之後再次 `start()`。
     * @param {string} [reason]
     */
    async stop(reason = 'stop') {
        this._startToken += 1;
        this._started = false;
        if (this._stopPromise) {
            return this._stopPromise;
        }
        if (this._disposed) return;
        if (!this._election && !this._rpc && !this._ownsBus && this._state === (this._supported ? 'idle' : 'unsupported')) {
            return;
        }

        this._publishLocalSubscriptions({ leaving: true });
        this._stepDownFromLeader(reason);

        let stopTask;
        stopTask = (async () => {
            try {
                await this._unbindCoordination();
                if (!this._disposed && !this._disposing) {
                    this._setState(this._supported ? 'idle' : 'unsupported', reason, { broadcast: false });
                }
            } finally {
                if (this._stopPromise === stopTask) {
                    this._stopPromise = null;
                }
            }
        })();
        this._stopPromise = stopTask;
        return stopTask;
    }

    /**
     * 永久釋放共享連線與所有內部資源（不會關閉外部注入的 `bus`）。
     */
    async dispose() {
        if (this._disposed) return;
        if (this._disposePromise) return this._disposePromise;

        this._disposing = true;
        const task = (async () => {
            await this.stop();
            this._disposed = true;
            this._disposing = false;
            this._localChannels.clear();
            this._peerChannels.clear();
            this._aggregatedChannels = [];
            this._setState('closed', 'dispose', { broadcast: false });
            this.emit('close', {
                nodeId: this._nodeId,
                scopeKey: this._scope.scopeKey,
                transport: this._transport,
            });
            for (const entries of this._listenersMap.values()) {
                for (const { type, wrapper } of entries) {
                    this.removeEventListener(type, wrapper);
                }
            }
            this._listenersMap.clear();
        })();

        this._disposePromise = task;
        return task;
    }

    /** `dispose()` 的別名 */
    async close() {
        return this.dispose();
    }

    /** @returns {'websocket' | 'sse'} */
    get transport() {
        return this._transport;
    }

    /** @returns {boolean} 是否支援寫入傳送（WebSocket 為 true、SSE 為 false） */
    get canSend() {
        return this._transport === 'websocket';
    }

    /** @returns {string} */
    get url() {
        return this._scope.url;
    }

    /** @returns {string} */
    get scopeKey() {
        return this._scope.scopeKey;
    }

    /** @returns {string} */
    get identityKey() {
        return this._scope.identityKey;
    }

    /** @returns {string} */
    get configKey() {
        return this._scope.configKey;
    }

    /** @returns {string} */
    get namespace() {
        return this._namespace;
    }

    /** @returns {string} */
    get nodeId() {
        return this._nodeId;
    }

    /** @returns {'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unsupported'} */
    get state() {
        return this._state;
    }

    /** @returns {'idle' | 'leader' | 'follower' | 'unsupported'} */
    get role() {
        if (!this._supported) return 'unsupported';
        return this._election?.role ?? 'idle';
    }

    /** @returns {boolean} */
    get isLeader() {
        return Boolean(this._election?.isLeader);
    }

    /** @returns {number} */
    get epoch() {
        return this._election?.isLeader ? this._election.epoch : this._leaderEpoch;
    }

    /** @returns {string | null} */
    get leaderId() {
        return this._election?.isLeader ? this._nodeId : this._leaderId;
    }

    /** @returns {string} */
    get lastEventId() {
        return this._lastEventId;
    }

    /** @returns {boolean} */
    get supported() {
        return this._supported;
    }

    /** @returns {boolean} */
    get started() {
        return this._started;
    }

    /** @returns {boolean} */
    get closed() {
        return this._disposed;
    }

    /** @returns {{ broadcastChannel: boolean, webLocks: boolean, indexedDB: boolean, localStorage: boolean, webSocket: boolean, eventSource: boolean, hasLocks: boolean, hasTransport: boolean, supported: boolean }} */
    get capabilities() {
        const base = getCoordinationCapabilities();
        return {
            ...base,
            hasLocks: this._hasLocks,
            hasTransport: Boolean(this._transport === 'websocket' ? this._WebSocketCtor : this._EventSourceCtor),
            supported: this._supported,
        };
    }
}

/**
 * 建立 SharedConnection 實例的工廠函式（import 或建立實例不會自動選鎖或連線）。
 * @param {object} options
 * @returns {SharedConnection}
 */
export function createSharedConnection(options) {
    return new SharedConnection(options);
}
