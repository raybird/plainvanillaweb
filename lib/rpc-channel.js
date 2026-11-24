import { BaseService } from './base-service.js';
import {
    DEFAULT_NAMESPACE,
    generateContextId,
    getCoordinationCapabilities,
} from './broadcast-channel.js';
import { DEFAULT_BUS_CHANNEL, MessageBus } from './message-bus.js';

/** 預設 RPC 逾時時間（毫秒） */
export const DEFAULT_RPC_TIMEOUT_MS = 5000;

/** RPC 標準錯誤代碼 */
export const RPC_ERROR_CODES = Object.freeze({
    METHOD_NOT_FOUND: 'METHOD_NOT_FOUND',
    TIMEOUT: 'TIMEOUT',
    ABORTED: 'ABORTED',
    TRANSPORT_UNAVAILABLE: 'TRANSPORT_UNAVAILABLE',
    CHANNEL_CLOSED: 'CHANNEL_CLOSED',
    HANDLER_ERROR: 'HANDLER_ERROR',
    SERIALIZATION_ERROR: 'SERIALIZATION_ERROR',
    INVALID_REQUEST: 'INVALID_REQUEST',
});

const FORBIDDEN_METHODS = new Set(['__proto__', 'constructor', 'prototype']);
const TOPIC_RPC_REQ = '__rpc:req';
const TOPIC_RPC_RES = '__rpc:res';
const TOPIC_RPC_CANCEL = '__rpc:cancel';
const MAX_COMPLETED_IDS = 200;

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isSafeMethodName(name) {
    return isNonEmptyString(name) && !FORBIDDEN_METHODS.has(name);
}

function cloneRpcValue(value) {
    if (value === undefined || value === null || typeof value !== 'object') {
        if (typeof value === 'function' || typeof value === 'symbol') {
            throw new RpcError(
                RPC_ERROR_CODES.SERIALIZATION_ERROR,
                'RPC payload must be structured-cloneable'
            );
        }
        return value;
    }
    try {
        if (typeof globalThis.structuredClone === 'function') {
            return globalThis.structuredClone(value);
        }
        return JSON.parse(JSON.stringify(value));
    } catch (err) {
        throw new RpcError(
            RPC_ERROR_CODES.SERIALIZATION_ERROR,
            `RPC payload is not structured-cloneable: ${err?.message || err}`
        );
    }
}

/**
 * 跨分頁 RPC 標準錯誤類別
 */
export class RpcError extends Error {
    /**
     * @param {string} code 錯誤代碼（見 RPC_ERROR_CODES）
     * @param {string} message 錯誤訊息
     * @param {{ remoteName?: string, data?: any, cause?: unknown }} [options]
     */
    constructor(code, message, options = {}) {
        super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = 'RpcError';
        this.code = isNonEmptyString(code) ? code : RPC_ERROR_CODES.HANDLER_ERROR;
        if (isNonEmptyString(options?.remoteName)) {
            this.remoteName = options.remoteName;
        }
        if (options?.data !== undefined) {
            this.data = options.data;
        }
    }
}

/**
 * 將任意拋出值序列化為可跨分頁安全結構化複製的純物件。
 * @param {unknown} error
 * @returns {{ code: string, message: string, name: string, data?: any }}
 */
export function serializeRpcError(error) {
    const out = {
        code: RPC_ERROR_CODES.HANDLER_ERROR,
        message: 'Unknown RPC error',
        name: 'Error',
    };

    if (error instanceof RpcError) {
        out.code = error.code;
        out.message = error.message;
        out.name = error.remoteName || error.name;
    } else if (error instanceof Error) {
        out.code = isNonEmptyString(error.code) ? error.code : RPC_ERROR_CODES.HANDLER_ERROR;
        out.message = error.message || error.name || 'Error';
        out.name = error.name || 'Error';
    } else if (isPlainObject(error)) {
        out.code = isNonEmptyString(error.code) ? error.code : RPC_ERROR_CODES.HANDLER_ERROR;
        out.message = typeof error.message === 'string' ? error.message : String(error);
        out.name = isNonEmptyString(error.name) ? error.name : 'Error';
    } else if (error !== undefined) {
        out.message = typeof error === 'string' ? error : String(error);
    }

    if (error && typeof error === 'object' && 'data' in error && error.data !== undefined) {
        try {
            out.data = cloneRpcValue(error.data);
        } catch {
            out.data = String(error.data);
        }
    }
    return out;
}

/**
 * 將收到的序列化錯誤還原為 RpcError 實例。
 * @param {unknown} serialized
 * @returns {RpcError}
 */
export function deserializeRpcError(serialized) {
    if (!isPlainObject(serialized)) {
        return new RpcError(
            RPC_ERROR_CODES.HANDLER_ERROR,
            typeof serialized === 'string' ? serialized : 'Unknown RPC error'
        );
    }
    const code = isNonEmptyString(serialized.code) ? serialized.code : RPC_ERROR_CODES.HANDLER_ERROR;
    const message = typeof serialized.message === 'string' ? serialized.message : 'Unknown RPC error';
    return new RpcError(code, message, {
        remoteName: isNonEmptyString(serialized.name) ? serialized.name : undefined,
        data: serialized.data,
    });
}

/**
 * RpcChannel - 基於 MessageBus 的跨執行環境可預測 Request / Response 通訊通道。
 *
 * 行為保證：
 * - 嚴格白名單：僅允許呼叫明確 `register()` 的方法。
 * - 不自動重試任何失敗或逾時請求，避免重複執行具副作用的操作。
 * - 取消（timeout / AbortSignal）僅釋放呼叫端等待並發送 best-effort 取消通知，不等同回滾遠端已執行動作。
 * - 重複或過期回應會被安全忽略並發出 `'duplicate-response'` 可觀測事件。
 */
export class RpcChannel extends BaseService {
    /**
     * @param {object} [options]
     * @param {MessageBus} [options.bus] 外部注入的 MessageBus（關閉通道時不會代為關閉外部 bus）
     * @param {string} [options.namespace] 邏輯命名空間（預設 'default'）
     * @param {string} [options.channelName] 未注入 bus 時使用的通道名稱（預設 'vanilla_coordination'）
     * @param {object} [options.transport] 未注入 bus 時透傳的自訂 transport
     * @param {string} [options.tabId] 自訂節點識別碼
     * @param {number} [options.timeoutMs] 預設請求逾時毫秒數（預設 5000）
     */
    constructor(options = {}) {
        super();
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('RpcChannel options must be a plain object');
        }
        const opts = options || {};

        const timeoutMs = opts.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
        if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new TypeError('RpcChannel timeoutMs must be a positive finite number');
        }

        if (opts.bus !== undefined) {
            const injected = opts.bus;
            if (
                !injected ||
                typeof injected !== 'object' ||
                typeof injected.publish !== 'function' ||
                typeof injected.subscribe !== 'function' ||
                !isNonEmptyString(injected.tabId) ||
                !isNonEmptyString(injected.namespace)
            ) {
                throw new TypeError('RpcChannel options.bus must be a valid MessageBus instance');
            }
            if (opts.namespace !== undefined && opts.namespace !== injected.namespace) {
                throw new TypeError('RpcChannel options.namespace does not match injected bus.namespace');
            }
            this._bus = injected;
            this._ownsBus = false;
        } else {
            this._bus = new MessageBus({
                namespace: opts.namespace ?? DEFAULT_NAMESPACE,
                channelName: opts.channelName ?? DEFAULT_BUS_CHANNEL,
                transport: opts.transport,
                tabId: opts.tabId,
            });
            this._ownsBus = true;
        }

        this._timeoutMs = timeoutMs;
        this._namespace = this._bus.namespace;
        this._nodeId = this._bus.tabId;
        this._handlers = new Map();
        this._pending = new Map();
        this._completedIds = new Set();
        this._activeExecutions = new Map();
        this._closed = false;

        this._busUnsubs = [
            this._bus.subscribe(TOPIC_RPC_REQ, (req, meta) => void this._handleIncomingRequest(req, meta), {
                receive: 'remote',
            }),
            this._bus.subscribe(TOPIC_RPC_RES, (res) => this._handleIncomingResponse(res), {
                receive: 'remote',
            }),
            this._bus.subscribe(TOPIC_RPC_CANCEL, (cancel) => this._handleIncomingCancel(cancel), {
                receive: 'remote',
            }),
        ];
    }

    /**
     * 註冊可被遠端或本地呼叫的 RPC 方法（嚴格白名單）
     * @param {string} method 方法名稱（不可為 __proto__/constructor/prototype）
     * @param {(params: any, context: object) => any} handler 處理函式
     * @param {{ allowOverwrite?: boolean }} [options]
     * @returns {() => void} 冪等取消註冊函式
     */
    register(method, handler, options = {}) {
        if (this._closed) {
            throw new Error('Cannot register method on a closed RpcChannel');
        }
        if (!isSafeMethodName(method)) {
            throw new TypeError('RPC method name must be a safe non-empty string');
        }
        if (typeof handler !== 'function') {
            throw new TypeError('RPC handler must be a function');
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('RPC register options must be a plain object');
        }
        if (this._handlers.has(method) && !options?.allowOverwrite) {
            throw new Error(`RPC method already registered: ${method}`);
        }

        this._handlers.set(method, handler);
        return () => {
            if (this._handlers.get(method) === handler) {
                this._handlers.delete(method);
            }
        };
    }

    /**
     * 移除已註冊的 RPC 方法（具冪等性）
     * @param {string} method
     */
    unregister(method) {
        if (!isSafeMethodName(method)) {
            throw new TypeError('RPC method name must be a safe non-empty string');
        }
        this._handlers.delete(method);
    }

    /** @private */
    _rememberCompletedId(correlationId) {
        this._completedIds.add(correlationId);
        if (this._completedIds.size > MAX_COMPLETED_IDS) {
            const oldest = this._completedIds.values().next().value;
            this._completedIds.delete(oldest);
        }
    }

    /** @private */
    _settlePending(correlationId, { ok, value, error }) {
        const entry = this._pending.get(correlationId);
        if (!entry) return false;
        this._pending.delete(correlationId);
        this._rememberCompletedId(correlationId);
        clearTimeout(entry.timer);
        entry.cleanupSignal?.();
        if (ok) {
            entry.resolve(value);
        } else {
            entry.reject(error);
        }
        return true;
    }

    /**
     * 呼叫遠端或本地已註冊的 RPC 方法（不自動重試）
     * @param {string} method 已註冊方法名稱
     * @param {any} [params] 請求參數（須支援結構化複製）
     * @param {object} [options]
     * @param {string | null} [options.target] 明確指定目標 nodeId；省略或 null 表示呼叫同 namespace 唯一 provider
     * @param {number} [options.timeoutMs] 單次請求逾時毫秒數
     * @param {AbortSignal} [options.signal] 取消控制訊號
     * @param {boolean} [options.allowLocal] 未指定 target 且本端已註冊該方法時是否直接本地執行（預設 true）
     * @returns {Promise<any>}
     */
    async call(method, params, options = {}) {
        if (!isSafeMethodName(method)) {
            throw new TypeError('RPC method name must be a safe non-empty string');
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('RPC call options must be a plain object');
        }
        const opts = options || {};

        if (opts.target !== undefined && opts.target !== null && !isNonEmptyString(opts.target)) {
            throw new TypeError('RPC options.target must be a non-empty string or null');
        }
        const target = opts.target ?? null;

        const timeoutMs = opts.timeoutMs ?? this._timeoutMs;
        if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new TypeError('RPC options.timeoutMs must be a positive finite number');
        }

        const signal = opts.signal;
        if (signal !== undefined && (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')) {
            throw new TypeError('RPC options.signal must be an AbortSignal');
        }

        const allowLocal = opts.allowLocal !== false;

        if (this._closed) {
            throw new RpcError(RPC_ERROR_CODES.CHANNEL_CLOSED, 'RpcChannel is closed');
        }
        if (signal?.aborted) {
            throw new RpcError(RPC_ERROR_CODES.ABORTED, 'RPC call aborted before dispatch');
        }

        const isExplicitSelf = target === this._nodeId;
        const isLocalUniqueProvider = target === null && allowLocal && this._handlers.has(method);

        if (isExplicitSelf && !this._handlers.has(method)) {
            throw new RpcError(RPC_ERROR_CODES.METHOD_NOT_FOUND, `Unknown RPC method: ${method}`);
        }

        const clonedParams = cloneRpcValue(params);

        if (isExplicitSelf || isLocalUniqueProvider) {
            return this._callLocal(method, clonedParams, target, timeoutMs, signal);
        }

        if (!this.supported) {
            throw new RpcError(
                RPC_ERROR_CODES.TRANSPORT_UNAVAILABLE,
                'RPC transport is unavailable (BroadcastChannel unsupported)'
            );
        }

        const correlationId = generateContextId();

        return new Promise((resolve, reject) => {
            const onAbort = () => {
                const settled = this._settlePending(correlationId, {
                    ok: false,
                    error: new RpcError(RPC_ERROR_CODES.ABORTED, `RPC call aborted: ${method}`),
                });
                if (settled) {
                    this._sendCancelNotice(correlationId, target, 'aborted');
                }
            };

            let cleanupSignal = null;
            if (signal) {
                signal.addEventListener('abort', onAbort, { once: true });
                cleanupSignal = () => signal.removeEventListener('abort', onAbort);
            }

            const timer = setTimeout(() => {
                const settled = this._settlePending(correlationId, {
                    ok: false,
                    error: new RpcError(RPC_ERROR_CODES.TIMEOUT, `RPC call timed out after ${timeoutMs}ms: ${method}`),
                });
                if (settled) {
                    this._sendCancelNotice(correlationId, target, 'timeout');
                }
            }, timeoutMs);

            this._pending.set(correlationId, {
                resolve,
                reject,
                timer,
                cleanupSignal,
                method,
            });

            try {
                const pub = this._bus.publish(
                    TOPIC_RPC_REQ,
                    {
                        correlationId,
                        method,
                        params: clonedParams,
                        target,
                        timeoutMs,
                        replyTo: this._nodeId,
                    },
                    { local: false, remote: true }
                );
                if (!pub.remoteSent) {
                    this._settlePending(correlationId, {
                        ok: false,
                        error: new RpcError(
                            RPC_ERROR_CODES.TRANSPORT_UNAVAILABLE,
                            'RPC request could not be sent over transport'
                        ),
                    });
                }
            } catch (err) {
                this._settlePending(correlationId, {
                    ok: false,
                    error: new RpcError(
                        RPC_ERROR_CODES.SERIALIZATION_ERROR,
                        `Failed to send RPC request: ${err?.message || err}`
                    ),
                });
            }
        });
    }

    /** @private */
    _callLocal(method, clonedParams, target, timeoutMs, signal) {
        const handler = this._handlers.get(method);
        const correlationId = generateContextId();
        const execAc = new AbortController();
        this._activeExecutions.set(correlationId, execAc);

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                this._activeExecutions.delete(correlationId);
            };
            const onAbort = () => {
                execAc.abort('aborted');
                this._settlePending(correlationId, {
                    ok: false,
                    error: new RpcError(RPC_ERROR_CODES.ABORTED, `RPC call aborted: ${method}`),
                });
            };
            let cleanupSignal = null;
            if (signal) {
                signal.addEventListener('abort', onAbort, { once: true });
                cleanupSignal = () => signal.removeEventListener('abort', onAbort);
            }
            const timer = setTimeout(() => {
                execAc.abort('timeout');
                this._settlePending(correlationId, {
                    ok: false,
                    error: new RpcError(RPC_ERROR_CODES.TIMEOUT, `RPC call timed out after ${timeoutMs}ms: ${method}`),
                });
            }, timeoutMs);

            this._pending.set(correlationId, {
                resolve,
                reject,
                timer,
                cleanupSignal: () => {
                    cleanupSignal?.();
                    cleanup();
                },
                method,
            });

            const context = Object.freeze({
                correlationId,
                method,
                caller: this._nodeId,
                target,
                signal: execAc.signal,
                timestamp: Date.now(),
            });

            Promise.resolve()
                .then(() => handler(clonedParams, context))
                .then((result) => {
                    const clonedResult = cloneRpcValue(result);
                    this._settlePending(correlationId, { ok: true, value: clonedResult });
                })
                .catch((err) => {
                    this._settlePending(correlationId, {
                        ok: false,
                        error: deserializeRpcError(serializeRpcError(err)),
                    });
                });
        });
    }

    /** @private */
    _sendCancelNotice(correlationId, target, reason) {
        if (this._closed || !this.supported) return;
        try {
            this._bus.publish(
                TOPIC_RPC_CANCEL,
                {
                    correlationId,
                    target,
                    caller: this._nodeId,
                    reason,
                },
                { local: false, remote: true }
            );
        } catch {
            // Best-effort 取消通知失敗時不再拋錯
        }
    }

    /** @private */
    async _handleIncomingRequest(req, meta) {
        if (this._closed) return;
        if (
            !isPlainObject(req) ||
            !isNonEmptyString(req.correlationId) ||
            !isNonEmptyString(req.replyTo) ||
            !isSafeMethodName(req.method)
        ) {
            this.emit('invalid-rpc', { kind: 'request', raw: req });
            return;
        }

        const target = req.target ?? null;
        if (target !== null && target !== this._nodeId) {
            return;
        }

        const handler = this._handlers.get(req.method);
        if (!handler) {
            // 明確指定本人為目標時，立即回報未知方法；唯一 provider 廣播則由無註冊節點靜默略過
            if (target === this._nodeId) {
                this._sendResponse(req.correlationId, req.replyTo, {
                    ok: false,
                    error: serializeRpcError(
                        new RpcError(RPC_ERROR_CODES.METHOD_NOT_FOUND, `Unknown RPC method: ${req.method}`)
                    ),
                });
            }
            return;
        }

        const execAc = new AbortController();
        this._activeExecutions.set(req.correlationId, execAc);
        const context = Object.freeze({
            correlationId: req.correlationId,
            method: req.method,
            caller: req.replyTo,
            target,
            signal: execAc.signal,
            timestamp: meta?.timestamp ?? Date.now(),
        });

        try {
            const result = await handler(req.params, context);
            if (this._closed) return;
            this._sendResponse(req.correlationId, req.replyTo, { ok: true, result });
        } catch (err) {
            if (this._closed) return;
            this._sendResponse(req.correlationId, req.replyTo, {
                ok: false,
                error: serializeRpcError(err),
            });
        } finally {
            this._activeExecutions.delete(req.correlationId);
        }
    }

    /** @private */
    _sendResponse(correlationId, replyTo, body) {
        if (this._closed || !this.supported) return;
        const payload = {
            correlationId,
            replyTo,
            responder: this._nodeId,
            ...body,
        };
        try {
            this._bus.publish(TOPIC_RPC_RES, payload, { local: false, remote: true });
        } catch (err) {
            try {
                this._bus.publish(
                    TOPIC_RPC_RES,
                    {
                        correlationId,
                        replyTo,
                        responder: this._nodeId,
                        ok: false,
                        error: serializeRpcError(
                            new RpcError(
                                RPC_ERROR_CODES.SERIALIZATION_ERROR,
                                `RPC result is not structured-cloneable: ${err?.message || err}`
                            )
                        ),
                    },
                    { local: false, remote: true }
                );
            } catch {
                // 無法回送時安全放棄
            }
        }
    }

    /** @private */
    _handleIncomingResponse(res) {
        if (this._closed) return;
        if (!isPlainObject(res) || !isNonEmptyString(res.correlationId) || !isNonEmptyString(res.replyTo)) {
            this.emit('invalid-rpc', { kind: 'response', raw: res });
            return;
        }
        if (res.replyTo !== this._nodeId) return;

        if (!this._pending.has(res.correlationId)) {
            this.emit('duplicate-response', {
                correlationId: res.correlationId,
                responder: isNonEmptyString(res.responder) ? res.responder : null,
                ok: Boolean(res.ok),
                wasCompleted: this._completedIds.has(res.correlationId),
            });
            return;
        }

        if (res.ok === true) {
            this._settlePending(res.correlationId, { ok: true, value: res.result });
        } else {
            this._settlePending(res.correlationId, {
                ok: false,
                error: deserializeRpcError(res.error),
            });
        }
    }

    /** @private */
    _handleIncomingCancel(cancel) {
        if (this._closed || !isPlainObject(cancel) || !isNonEmptyString(cancel.correlationId)) return;
        if (cancel.target !== undefined && cancel.target !== null && cancel.target !== this._nodeId) return;
        const execAc = this._activeExecutions.get(cancel.correlationId);
        if (execAc && !execAc.signal.aborted) {
            execAc.abort(cancel.reason || 'cancelled');
        }
    }

    /**
     * 關閉 RPC 通道：中止執行中與等待中的全部請求（`pendingCount` 歸零）並解除監聽。
     * 若使用外部注入 `bus`，不會關閉外部 `bus`。
     */
    close() {
        if (this._closed) return;
        this._closed = true;

        // 先中止所有執行中 handler（含本地與遠端）的 ctx.signal，再結算 pending 避免本地 cleanup 提前移除條目
        for (const ac of this._activeExecutions.values()) {
            if (!ac.signal.aborted) ac.abort('closed');
        }
        this._activeExecutions.clear();

        for (const correlationId of [...this._pending.keys()]) {
            this._settlePending(correlationId, {
                ok: false,
                error: new RpcError(RPC_ERROR_CODES.CHANNEL_CLOSED, 'RpcChannel closed'),
            });
        }

        for (const unsub of this._busUnsubs) {
            unsub();
        }
        this._busUnsubs.length = 0;
        this._handlers.clear();

        if (this._ownsBus) {
            this._bus.close();
        }

        this.emit('close', {
            nodeId: this._nodeId,
            namespace: this._namespace,
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
    get nodeId() {
        return this._nodeId;
    }

    /** @returns {string} */
    get namespace() {
        return this._namespace;
    }

    /** @returns {boolean} */
    get supported() {
        return this._bus.supported;
    }

    /** @returns {{ broadcastChannel: boolean, webLocks: boolean, indexedDB: boolean, localStorage: boolean, transport: string, supported: boolean }} */
    get capabilities() {
        return this._bus.capabilities ?? {
            ...getCoordinationCapabilities(),
            transport: this._bus.supported ? 'custom' : 'none',
            supported: this._bus.supported,
        };
    }

    /** @returns {boolean} */
    get closed() {
        return this._closed;
    }

    /** @returns {number} */
    get pendingCount() {
        return this._pending.size;
    }

    /** @returns {string[]} */
    get registeredMethods() {
        return [...this._handlers.keys()];
    }
}

/**
 * 建立 RpcChannel 實例的工廠函式（import 或建立實例不會自動啟動任何背景任務）
 * @param {object} [options]
 * @returns {RpcChannel}
 */
export function createRpcChannel(options = {}) {
    return new RpcChannel(options);
}
