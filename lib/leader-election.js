import { BaseService } from './base-service.js';
import {
    DEFAULT_NAMESPACE,
    generateContextId,
    getCoordinationCapabilities,
} from './broadcast-channel.js';

/** 預設 Web Locks 鎖名稱前綴 */
export const DEFAULT_LOCK_PREFIX = 'vanilla:coord:leader';

/** 預設領導者選舉 scope */
export const DEFAULT_LEADER_SCOPE = 'leader';

const TOPIC_HEARTBEAT = '__coord:leader:heartbeat';
const TOPIC_ELECTED = '__coord:leader:elected';
const TOPIC_RESIGNED = '__coord:leader:resigned';

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * LeaderElection - 以具 namespace 與 scope 隔離的 Web Locks 作為唯一互斥依據的領導者選舉服務。
 *
 * 設計契約：
 * - 僅以 Web Locks `mode: 'exclusive'` 決定領導權；不使用 `{ steal: true }`。
 * - 若注入 `bus` 且設定 `heartbeatIntervalMs > 0`，heartbeat 僅用於觀測，絕不作互斥或奪鎖依據。
 * - 不支援 Web Locks 時明確回報 `supported: false` 與 `role: 'unsupported'`，不假裝互斥。
 */
export class LeaderElection extends BaseService {
    /**
     * @param {object} [options]
     * @param {string} [options.namespace] 邏輯命名空間（預設 'default'）
     * @param {string} [options.scope] 選舉範圍識別（預設 'leader'）
     * @param {string} [options.lockPrefix] Web Locks 名稱前綴（預設 'vanilla:coord:leader'）
     * @param {string} [options.nodeId] 自訂節點識別碼（預設沿用 bus.tabId 或自動產生）
     * @param {import('./message-bus.js').MessageBus | null} [options.bus] 選用 MessageBus，僅供發布／觀測 heartbeat 與角色通知（dispose 時不關閉外部 bus）
     * @param {number} [options.heartbeatIntervalMs] 觀測用 heartbeat 間隔毫秒；0 表示停用（預設 0）
     * @param {boolean} [options.releaseOnFreeze] 背景凍結（document freeze）時是否主動讓鎖（預設 false）
     * @param {{ request: Function }} [options.locks] 可注入的自訂 LockManager（測試用）
     */
    constructor(options = {}) {
        super();
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('LeaderElection options must be a plain object');
        }
        const opts = options || {};

        let bus = null;
        if (opts.bus !== undefined && opts.bus !== null) {
            if (
                typeof opts.bus !== 'object' ||
                typeof opts.bus.publish !== 'function' ||
                typeof opts.bus.subscribe !== 'function' ||
                !isNonEmptyString(opts.bus.tabId)
            ) {
                throw new TypeError('LeaderElection options.bus must be a valid MessageBus-compatible instance');
            }
            if (
                opts.namespace !== undefined &&
                isNonEmptyString(opts.bus.namespace) &&
                opts.namespace !== opts.bus.namespace
            ) {
                throw new TypeError('LeaderElection options.namespace does not match injected bus.namespace');
            }
            bus = opts.bus;
        }

        const namespace = opts.namespace ?? (isNonEmptyString(bus?.namespace) ? bus.namespace : DEFAULT_NAMESPACE);
        if (!isNonEmptyString(namespace)) {
            throw new TypeError('LeaderElection namespace must be a non-empty string');
        }

        const scope = opts.scope ?? DEFAULT_LEADER_SCOPE;
        if (!isNonEmptyString(scope)) {
            throw new TypeError('LeaderElection scope must be a non-empty string');
        }

        const lockPrefix = opts.lockPrefix ?? DEFAULT_LOCK_PREFIX;
        if (!isNonEmptyString(lockPrefix)) {
            throw new TypeError('LeaderElection lockPrefix must be a non-empty string');
        }

        if (opts.nodeId !== undefined && !isNonEmptyString(opts.nodeId)) {
            throw new TypeError('LeaderElection nodeId must be a non-empty string');
        }

        const heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 0;
        if (typeof heartbeatIntervalMs !== 'number' || !Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs < 0) {
            throw new TypeError('LeaderElection heartbeatIntervalMs must be a non-negative finite number');
        }

        if (opts.releaseOnFreeze !== undefined && typeof opts.releaseOnFreeze !== 'boolean') {
            throw new TypeError('LeaderElection releaseOnFreeze must be a boolean');
        }

        if (opts.locks !== undefined) {
            if (!opts.locks || typeof opts.locks !== 'object' || typeof opts.locks.request !== 'function') {
                throw new TypeError('LeaderElection options.locks must provide a request() method');
            }
            this._locks = opts.locks;
            this._locksType = 'custom';
        } else if (
            typeof globalThis.navigator !== 'undefined' &&
            globalThis.navigator !== null &&
            typeof globalThis.navigator.locks?.request === 'function'
        ) {
            this._locks = globalThis.navigator.locks;
            this._locksType = 'native';
        } else {
            this._locks = null;
            this._locksType = 'none';
        }

        this._namespace = namespace;
        this._scope = scope;
        this._lockPrefix = lockPrefix;
        this._lockName = `${lockPrefix}:${encodeURIComponent(namespace)}:${encodeURIComponent(scope)}`;
        this._bus = bus;
        this._nodeId = opts.nodeId ?? bus?.tabId ?? generateContextId();
        this._heartbeatIntervalMs = heartbeatIntervalMs;
        this._releaseOnFreeze = Boolean(opts.releaseOnFreeze);

        this._role = this.supported ? 'idle' : 'unsupported';
        this._epoch = 0;
        this._active = false;
        this._disposed = false;
        this._disposing = false;
        this._disposePromise = null;
        this._attemptId = 0;
        this._startPromise = null;
        this._relinquishPromise = null;
        this._lockTask = null;
        this._releaseLockFn = null;
        this._queueAbortController = null;
        this._detachExternalSignal = null;
        this._heartbeatTimer = null;
        this._pausedByFreeze = false;
        this._observedLeader = null;
        this._busUnsubs = [];
        this._lifecycleBound = false;

        this._onDocumentFreeze = () => this._handleFreeze();
        this._onDocumentResume = () => this._handleResume();

        if (this._bus && !this._bus.closed) {
            this._bindBusObservations();
        }
    }

    /** @private */
    _bindBusObservations() {
        const matchesScope = (payload) =>
            isPlainObject(payload) &&
            payload.scope === this._scope &&
            payload.namespace === this._namespace &&
            isNonEmptyString(payload.nodeId) &&
            typeof payload.epoch === 'number' &&
            Number.isFinite(payload.epoch);

        this._busUnsubs.push(
            this._bus.subscribe(
                TOPIC_HEARTBEAT,
                (payload, meta) => {
                    if (this._disposed || !matchesScope(payload)) return;
                    this._observedLeader = Object.freeze({
                        nodeId: payload.nodeId,
                        epoch: payload.epoch,
                        scope: payload.scope,
                        namespace: payload.namespace,
                        timestamp: payload.timestamp ?? meta.timestamp,
                    });
                    this.emit('leader-heartbeat', this._observedLeader);
                },
                { receive: 'remote' }
            ),
            this._bus.subscribe(
                TOPIC_ELECTED,
                (payload, meta) => {
                    if (this._disposed || !matchesScope(payload)) return;
                    this._observedLeader = Object.freeze({
                        nodeId: payload.nodeId,
                        epoch: payload.epoch,
                        scope: payload.scope,
                        namespace: payload.namespace,
                        timestamp: payload.timestamp ?? meta.timestamp,
                    });
                    this.emit('leader-observed', { type: 'elected', ...this._observedLeader });
                },
                { receive: 'remote' }
            ),
            this._bus.subscribe(
                TOPIC_RESIGNED,
                (payload) => {
                    if (this._disposed || !matchesScope(payload)) return;
                    if (this._observedLeader?.nodeId === payload.nodeId) {
                        this._observedLeader = null;
                    }
                    this.emit('leader-observed', {
                        type: 'resigned',
                        nodeId: payload.nodeId,
                        epoch: payload.epoch,
                        scope: payload.scope,
                        namespace: payload.namespace,
                    });
                },
                { receive: 'remote' }
            )
        );
    }

    /** @private */
    _attachLifecycleListeners() {
        if (this._lifecycleBound) return;
        if (typeof globalThis.document?.addEventListener !== 'function') return;
        globalThis.document.addEventListener('freeze', this._onDocumentFreeze);
        globalThis.document.addEventListener('resume', this._onDocumentResume);
        this._lifecycleBound = true;
    }

    /** @private */
    _detachLifecycleListeners() {
        if (!this._lifecycleBound) return;
        if (typeof globalThis.document?.removeEventListener === 'function') {
            globalThis.document.removeEventListener('freeze', this._onDocumentFreeze);
            globalThis.document.removeEventListener('resume', this._onDocumentResume);
        }
        this._lifecycleBound = false;
    }

    /** @private */
    _handleFreeze() {
        if (this._disposed || this._disposing) return;
        this.emit('freeze', { role: this._role, epoch: this._epoch, scope: this._scope });
        if (this._releaseOnFreeze && this._active && (this._role === 'leader' || this._role === 'follower')) {
            this._pausedByFreeze = true;
            void this._relinquishCurrentAttempt('freeze', { keepActive: true });
        }
    }

    /** @private */
    _handleResume() {
        if (this._disposed || this._disposing) return;
        this.emit('resume', { role: this._role, epoch: this._epoch, scope: this._scope });
        if (this._releaseOnFreeze && this._pausedByFreeze && this._active && !this._releaseLockFn && !this._startPromise) {
            this._pausedByFreeze = false;
            void this._beginAcquire(undefined).catch((err) => {
                if (!this._disposed) {
                    this.emit('error', { error: err, scope: this._scope, namespace: this._namespace });
                }
            });
        }
    }

    /** @private */
    _setRole(nextRole, reason = 'transition', extra = {}) {
        const previousRole = this._role;
        if (previousRole === nextRole) return previousRole;
        this._role = nextRole;
        this.emit('role-change', {
            role: nextRole,
            previousRole,
            epoch: this._epoch,
            nodeId: this._nodeId,
            scope: this._scope,
            namespace: this._namespace,
            reason,
            ...extra,
        });
        return previousRole;
    }

    /** @private */
    _publishBusEvent(topic, extra = {}) {
        if (!this._bus || this._bus.closed || !this._bus.supported) return;
        try {
            this._bus.publish(
                topic,
                {
                    nodeId: this._nodeId,
                    epoch: this._epoch,
                    scope: this._scope,
                    namespace: this._namespace,
                    timestamp: Date.now(),
                    ...extra,
                },
                { local: false, remote: true }
            );
        } catch {
            // 觀測用事件發送失敗不影響 Web Locks 互斥狀態機
        }
    }

    /** @private */
    _startHeartbeat() {
        this._stopHeartbeat();
        this._publishBusEvent(TOPIC_ELECTED);
        if (this._bus && this._heartbeatIntervalMs > 0) {
            this._publishBusEvent(TOPIC_HEARTBEAT);
            this._heartbeatTimer = setInterval(() => {
                if (!this._disposed && this._role === 'leader') {
                    this._publishBusEvent(TOPIC_HEARTBEAT);
                }
            }, this._heartbeatIntervalMs);
        }
    }

    /** @private */
    _clearExternalSignal() {
        this._detachExternalSignal?.();
        this._detachExternalSignal = null;
    }

    /** @private */
    _stopHeartbeat() {
        if (this._heartbeatTimer !== null) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    /**
     * 啟動領導者選舉：
     * 1. 若目前無人持鎖則立即成為 `leader` 並回傳 `{ acquired: true, role: 'leader' }`；
     * 2. 若已被他頁持有則切為 `follower` 並於背景排隊等待接管，立即回傳 `{ acquired: false, role: 'follower' }`；
     * 3. 不支援 Web Locks 時明確回傳 `{ acquired: false, role: 'unsupported', supported: false }`。
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {Promise<{ acquired: boolean, role: string, epoch: number, supported: boolean, cancelled?: boolean }>}
     */
    async start(options = {}) {
        if (this._disposed || this._disposing) {
            throw new Error('Cannot start a disposed LeaderElection');
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('LeaderElection start options must be a plain object');
        }
        if (!this.supported) {
            this.emit('unsupported', { lockName: this._lockName, scope: this._scope, namespace: this._namespace });
            return { acquired: false, role: 'unsupported', epoch: this._epoch, supported: false };
        }

        const signal = options?.signal;
        if (signal !== undefined && (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')) {
            throw new TypeError('LeaderElection start options.signal must be an AbortSignal');
        }
        if (signal?.aborted) {
            this.emit('cancelled', { reason: signal.reason ?? 'aborted', stage: 'pre-start', scope: this._scope });
            return { acquired: false, role: this._role, epoch: this._epoch, supported: true, cancelled: true };
        }

        if (this._pausedByFreeze) {
            this._pausedByFreeze = false;
            this._active = false;
        }
        if (this._active && this._startPromise) {
            return this._startPromise;
        }
        if (this._active) {
            return {
                acquired: this._role === 'leader',
                role: this._role,
                epoch: this._epoch,
                supported: true,
            };
        }

        return this._beginAcquire(signal);
    }

    /** @private */
    _beginAcquire(signal) {
        this._active = true;
        this._pausedByFreeze = false;
        this._attachLifecycleListeners();

        const attemptId = ++this._attemptId;
        const ac = new AbortController();
        this._queueAbortController = ac;

        this._clearExternalSignal();
        if (signal) {
            const onExternalAbort = () => {
                this._detachExternalSignal = null;
                if (this._attemptId === attemptId && this._active) {
                    void this.stop(signal.reason ?? 'aborted', { cancelled: true });
                } else {
                    ac.abort(signal.reason);
                }
            };
            signal.addEventListener('abort', onExternalAbort, { once: true });
            this._detachExternalSignal = () => signal.removeEventListener('abort', onExternalAbort);
        }

        this._startPromise = (async () => {
            if (this._relinquishPromise) {
                await this._relinquishPromise;
            }
            if (this._disposed || this._disposing || attemptId !== this._attemptId || !this._active || ac.signal.aborted) {
                this._clearExternalSignal();
                return {
                    acquired: false,
                    role: this._role,
                    epoch: this._epoch,
                    supported: true,
                    cancelled: true,
                };
            }
            return this._acquireLoop(attemptId, ac);
        })().finally(() => {
            if (this._attemptId === attemptId) {
                this._startPromise = null;
            }
        });
        return this._startPromise;
    }

    /** @private */
    async _acquireLoop(attemptId, ac) {
        let resolveProbe;
        let rejectProbe;
        const probePromise = new Promise((resolve, reject) => {
            resolveProbe = resolve;
            rejectProbe = reject;
        });

        let probeSettled = false;
        let lockTask = null;

        try {
            // 第一階段：以 ifAvailable 探測（依 W3C Web Locks 規格不可同時傳入 signal）
            lockTask = Promise.resolve(
                this._locks.request(this._lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
                    if (!lock) {
                        if (!probeSettled) {
                            probeSettled = true;
                            resolveProbe(false);
                        }
                        return false;
                    }

                    if (ac.signal.aborted || this._disposed || attemptId !== this._attemptId || !this._active) {
                        if (!probeSettled) {
                            probeSettled = true;
                            resolveProbe(null);
                        }
                        return false;
                    }

                    let releaseResolve;
                    const holdPromise = new Promise((r) => {
                        releaseResolve = r;
                    });
                    this._releaseLockFn = releaseResolve;
                    this._clearExternalSignal();
                    this._epoch += 1;
                    this._setRole('leader', 'acquired', { takeover: false });
                    this._startHeartbeat();
                    this.emit('elected', {
                        epoch: this._epoch,
                        nodeId: this._nodeId,
                        scope: this._scope,
                        namespace: this._namespace,
                        takeover: false,
                    });

                    if (!probeSettled) {
                        probeSettled = true;
                        resolveProbe(true);
                    }

                    await holdPromise;
                    return true;
                })
            );
            this._lockTask = lockTask;
            lockTask.catch((err) => {
                if (!probeSettled) {
                    probeSettled = true;
                    rejectProbe(err);
                }
            });

            const probeResult = await probePromise;
            if (probeResult === true) {
                return { acquired: true, role: 'leader', epoch: this._epoch, supported: true };
            }
            if (probeResult === null || ac.signal.aborted || this._disposed || attemptId !== this._attemptId || !this._active) {
                this._clearExternalSignal();
                return {
                    acquired: false,
                    role: this._role,
                    epoch: this._epoch,
                    supported: true,
                    cancelled: true,
                };
            }

            // 第一階段未取得鎖：等待 ifAvailable 任務完整收尾後進入背景排隊
            await lockTask.catch(() => {});
            if (ac.signal.aborted || this._disposed || attemptId !== this._attemptId || !this._active) {
                this._clearExternalSignal();
                return {
                    acquired: false,
                    role: this._role,
                    epoch: this._epoch,
                    supported: true,
                    cancelled: true,
                };
            }

            this._setRole('follower', 'contended', { takeover: false });

            // 第二階段：以專屬鎖排隊等候前任 leader 釋放、重載或關閉後接管（不阻塞 start() 返回）
            const queuedTask = Promise.resolve(
                this._locks.request(this._lockName, { mode: 'exclusive', signal: ac.signal }, async (lock) => {
                    if (!lock || ac.signal.aborted || this._disposed || attemptId !== this._attemptId || !this._active) {
                        return false;
                    }

                    let releaseResolve;
                    const holdPromise = new Promise((r) => {
                        releaseResolve = r;
                    });
                    this._releaseLockFn = releaseResolve;
                    this._clearExternalSignal();
                    this._epoch += 1;
                    this._setRole('leader', 'takeover', { takeover: true });
                    this._startHeartbeat();
                    this.emit('elected', {
                        epoch: this._epoch,
                        nodeId: this._nodeId,
                        scope: this._scope,
                        namespace: this._namespace,
                        takeover: true,
                    });

                    await holdPromise;
                    return true;
                })
            );
            this._lockTask = queuedTask;
            queuedTask.catch((err) => {
                if (err?.name === 'AbortError' || ac.signal.aborted) return;
                if (attemptId === this._attemptId && !this._disposed) {
                    this._clearExternalSignal();
                    this._active = false;
                    this._stopHeartbeat();
                    this._setRole('idle', 'error', { takeover: false });
                    this.emit('error', { error: err, scope: this._scope, namespace: this._namespace });
                }
            });

            return { acquired: false, role: 'follower', epoch: this._epoch, supported: true };
        } catch (err) {
            this._clearExternalSignal();
            if (err?.name === 'AbortError' || ac.signal.aborted) {
                return {
                    acquired: false,
                    role: this._role,
                    epoch: this._epoch,
                    supported: true,
                    cancelled: true,
                };
            }
            this._active = false;
            this._stopHeartbeat();
            this._setRole('idle', 'error', { takeover: false });
            throw err;
        }
    }

    /** @private */
    async _relinquishCurrentAttempt(reason, { keepActive = false, emitCancelled = false } = {}) {
        if (this._relinquishPromise) {
            if (!keepActive) {
                this._active = false;
                this._pausedByFreeze = false;
                this._attemptId += 1;
            }
            return this._relinquishPromise;
        }

        const wasLeader = this._role === 'leader';
        const wasFollower = this._role === 'follower';
        const prevEpoch = this._epoch;

        this._stopHeartbeat();
        this._clearExternalSignal();
        this._attemptId += 1;
        this._active = Boolean(keepActive);
        if (!keepActive) {
            this._pausedByFreeze = false;
        }

        const ac = this._queueAbortController;
        this._queueAbortController = null;
        if (ac && !ac.signal.aborted) {
            ac.abort(reason);
        }

        const releaseFn = this._releaseLockFn;
        this._releaseLockFn = null;
        const lockTask = this._lockTask;
        this._lockTask = null;

        if (this.supported && (wasLeader || wasFollower)) {
            this._setRole('idle', reason, { takeover: false });
        }

        if (wasLeader) {
            this._publishBusEvent(TOPIC_RESIGNED, { reason });
            this.emit('resigned', {
                epoch: prevEpoch,
                nodeId: this._nodeId,
                scope: this._scope,
                namespace: this._namespace,
                reason,
            });
        } else if (wasFollower || emitCancelled || reason === 'aborted' || reason === 'stop' || reason === 'cancel') {
            this.emit('cancelled', {
                reason,
                stage: wasFollower ? 'follower-queue' : 'idle',
                scope: this._scope,
                namespace: this._namespace,
            });
        }

        if (releaseFn) releaseFn();

        let relinquishTask;
        relinquishTask = (async () => {
            try {
                if (lockTask) {
                    await lockTask.catch(() => {});
                }
            } finally {
                if (this._relinquishPromise === relinquishTask) {
                    this._relinquishPromise = null;
                }
            }
        })();
        this._relinquishPromise = relinquishTask;
        return relinquishTask;
    }

    /**
     * 主動釋放領導鎖或結束目前競選，確保 Web Lock 完全釋放後才 resolve。
     * @param {string} [reason]
     */
    async release(reason = 'release') {
        if (this._disposed || this._disposing) return this._disposePromise;
        this._detachLifecycleListeners();
        await this._relinquishCurrentAttempt(reason, { keepActive: false });
    }

    /** `release()` 的別名 */
    async resign(reason = 'resign') {
        return this.release(reason);
    }

    /**
     * 停止選舉並取消排隊或釋放持鎖
     * @param {string} [reason]
     * @param {{ cancelled?: boolean }} [options]
     */
    async stop(reason = 'stop', options = {}) {
        if (this._disposed || this._disposing) return this._disposePromise;
        this._detachLifecycleListeners();
        await this._relinquishCurrentAttempt(reason, {
            keepActive: false,
            emitCancelled: Boolean(options?.cancelled),
        });
    }

    /** `stop()` 的別名 */
    async cancel(reason = 'cancel') {
        return this.stop(reason, { cancelled: true });
    }

    /**
     * 釋放鎖、解除所有內部與觀測監聽並清理事件監聽器（具冪等性；不關閉外部注入的 MessageBus）。
     */
    async dispose() {
        if (this._disposed) return;
        if (this._disposePromise) return this._disposePromise;

        this._disposing = true;
        this._detachLifecycleListeners();

        const task = (async () => {
            await this._relinquishCurrentAttempt('dispose', { keepActive: false });
            this._disposed = true;
            this._disposing = false;

            for (const unsub of this._busUnsubs) {
                unsub();
            }
            this._busUnsubs.length = 0;

            this.emit('close', {
                nodeId: this._nodeId,
                scope: this._scope,
                namespace: this._namespace,
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

    /** @returns {string} */
    get namespace() {
        return this._namespace;
    }

    /** @returns {string} */
    get scope() {
        return this._scope;
    }

    /** @returns {string} */
    get lockName() {
        return this._lockName;
    }

    /** @returns {string} */
    get nodeId() {
        return this._nodeId;
    }

    /** @returns {'idle' | 'leader' | 'follower' | 'unsupported'} */
    get role() {
        return this._role;
    }

    /** @returns {boolean} */
    get isLeader() {
        return this._role === 'leader';
    }

    /** @returns {number} */
    get epoch() {
        return this._epoch;
    }

    /** @returns {boolean} */
    get supported() {
        return this._locksType !== 'none';
    }

    /** @returns {boolean} */
    get closed() {
        return this._disposed;
    }

    /** @returns {{ nodeId: string, epoch: number, scope: string, namespace: string, timestamp: number } | null} */
    get observedLeader() {
        return this._observedLeader;
    }

    /** @returns {{ broadcastChannel: boolean, webLocks: boolean, indexedDB: boolean, localStorage: boolean, locksTransport: string, supported: boolean }} */
    get capabilities() {
        return {
            ...getCoordinationCapabilities(),
            locksTransport: this._locksType,
            supported: this.supported,
        };
    }
}

/**
 * 建立 LeaderElection 實例的工廠函式（import 或建立實例時不會自動請求 Web Lock）
 * @param {object} [options]
 * @returns {LeaderElection}
 */
export function createLeaderElection(options = {}) {
    return new LeaderElection(options);
}
