import { BaseService } from './base-service.js';
import {
    DEFAULT_NAMESPACE,
    generateContextId,
    getCoordinationCapabilities,
} from './broadcast-channel.js';
import { DEFAULT_BUS_CHANNEL, MessageBus } from './message-bus.js';

/** 預設節點 heartbeat 廣播間隔（毫秒） */
export const DEFAULT_PEER_HEARTBEAT_MS = 2000;

/** 預設節點失去心跳後標記為過期的逾時時間（毫秒） */
export const DEFAULT_PEER_TIMEOUT_MS = 6000;

const TOPIC_PEER_HELLO = '__peer:hello';
const TOPIC_PEER_HEARTBEAT = '__peer:heartbeat';
const TOPIC_PEER_LEAVE = '__peer:leave';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_EXPIRED_PEERS = 200;

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function assertSafeValue(value, path = 'value', seen = new WeakSet()) {
    if (value === undefined || value === null || typeof value !== 'object') {
        if (typeof value === 'function' || typeof value === 'symbol') {
            throw new TypeError(`PeerDiscovery ${path} must be structured-cloneable`);
        }
        return;
    }
    if (seen.has(value)) {
        throw new TypeError(`PeerDiscovery ${path} contains circular reference`);
    }
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                assertSafeValue(value[i], `${path}[${i}]`, seen);
            }
            return;
        }
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            throw new TypeError(`PeerDiscovery ${path} nested objects must be plain objects or arrays`);
        }
        for (const key of Object.keys(value)) {
            if (FORBIDDEN_KEYS.has(key)) {
                throw new TypeError(`PeerDiscovery ${path} contains forbidden key: ${key}`);
            }
            assertSafeValue(value[key], `${path}.${key}`, seen);
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
        throw new TypeError('PeerDiscovery value contains circular reference');
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

function cloneAndFreezeValue(value) {
    if (value === undefined || value === null || typeof value !== 'object') {
        return value;
    }
    const cloned = typeof globalThis.structuredClone === 'function'
        ? globalThis.structuredClone(value)
        : JSON.parse(JSON.stringify(value));
    const deepFreeze = (target) => {
        if (target === null || typeof target !== 'object') return target;
        if (Array.isArray(target)) {
            for (const item of target) deepFreeze(item);
        } else {
            for (const key of Object.keys(target)) deepFreeze(target[key]);
        }
        return Object.freeze(target);
    };
    return deepFreeze(cloned);
}

function sanitizeCapabilities(capabilities) {
    if (capabilities === undefined) {
        return Object.freeze({});
    }
    if (Array.isArray(capabilities)) {
        const list = [];
        const seen = new Set();
        for (let i = 0; i < capabilities.length; i++) {
            const item = capabilities[i];
            if (!isNonEmptyString(item) || FORBIDDEN_KEYS.has(item)) {
                throw new TypeError('PeerDiscovery capability array items must be safe non-empty strings');
            }
            if (!seen.has(item)) {
                seen.add(item);
                list.push(item);
            }
        }
        return Object.freeze(list);
    }
    if (!isPlainObject(capabilities)) {
        throw new TypeError('PeerDiscovery capabilities must be a plain object or string array');
    }
    assertSafeValue(capabilities, 'capabilities');
    return cloneAndFreezeValue(capabilities);
}

function sanitizeMeta(meta) {
    if (meta === undefined) {
        return Object.freeze({});
    }
    if (!isPlainObject(meta)) {
        throw new TypeError('PeerDiscovery meta must be a plain object');
    }
    assertSafeValue(meta, 'meta');
    return cloneAndFreezeValue(meta);
}

function matchesCapability(capabilities, capability) {
    if (!isNonEmptyString(capability)) return true;
    if (Array.isArray(capabilities)) {
        return capabilities.includes(capability);
    }
    if (capabilities && typeof capabilities === 'object' && Object.hasOwn(capabilities, capability)) {
        return Boolean(capabilities[capability]);
    }
    return false;
}

function freezePeerSnapshot(record) {
    return Object.freeze({
        nodeId: record.nodeId,
        namespace: record.namespace,
        capabilities: record.capabilities,
        meta: record.meta,
        status: record.status,
        seq: record.seq,
        startedAt: record.startedAt,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
        expiredAt: record.expiredAt ?? null,
        updatedAt: record.updatedAt,
    });
}

/**
 * PeerDiscovery - 跨執行環境節點探索、能力宣告與心跳觀測服務。
 *
 * 設計不變量：
 * - 完全 opt-in，匯入或建構實例不啟動計時器亦不開啟通道。
 * - 節點過期（`peer-expire`）僅代表失去可觀測心跳（例如背景分頁遭凍結），**絕不代表 Web Lock 已釋放**。
 */
export class PeerDiscovery extends BaseService {
    /**
     * @param {object} [options]
     * @param {MessageBus} [options.bus] 外部注入的 MessageBus（dispose 時不會代為關閉）
     * @param {string} [options.namespace] 邏輯命名空間（預設 'default'）
     * @param {string} [options.channelName] 未注入 bus 時使用的通道名稱（預設 'vanilla_coordination'）
     * @param {object} [options.transport] 未注入 bus 時透傳給 MessageBus 的自訂 transport
     * @param {string} [options.nodeId] 自訂節點識別碼（預設沿用 bus.tabId 或自動產生）
     * @param {Record<string, any> | string[]} [options.capabilities] 本節點能力宣告
     * @param {Record<string, any>} [options.meta] 額外中繼資訊（須為純物件，不可含憑證）
     * @param {number} [options.heartbeatIntervalMs] heartbeat 間隔毫秒數（預設 2000）
     * @param {number} [options.peerTimeoutMs] 過期判定毫秒數（預設為 heartbeatIntervalMs * 3）
     * @param {number} [options.sweepIntervalMs] 過期掃描間隔毫秒數
     * @param {boolean} [options.autoLeaveOnPageHide] 觸發 pagehide 時是否自動發布離開事件（預設 true）
     * @param {() => number} [options.now] 自訂時間函式（測試用）
     */
    constructor(options = {}) {
        super();
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('PeerDiscovery options must be a plain object');
        }
        const opts = options || {};

        let injectedBus = null;
        if (opts.bus !== undefined && opts.bus !== null) {
            const candidate = opts.bus;
            if (
                typeof candidate !== 'object' ||
                typeof candidate.publish !== 'function' ||
                typeof candidate.subscribe !== 'function' ||
                !isNonEmptyString(candidate.tabId) ||
                !isNonEmptyString(candidate.namespace)
            ) {
                throw new TypeError('PeerDiscovery options.bus must be a valid MessageBus instance');
            }
            if (opts.namespace !== undefined && opts.namespace !== candidate.namespace) {
                throw new TypeError('PeerDiscovery options.namespace does not match injected bus.namespace');
            }
            injectedBus = candidate;
        }

        const namespace = opts.namespace ?? injectedBus?.namespace ?? DEFAULT_NAMESPACE;
        if (!isNonEmptyString(namespace)) {
            throw new TypeError('PeerDiscovery namespace must be a non-empty string');
        }

        if (opts.channelName !== undefined && !isNonEmptyString(opts.channelName)) {
            throw new TypeError('PeerDiscovery channelName must be a non-empty string');
        }

        if (opts.nodeId !== undefined && !isNonEmptyString(opts.nodeId)) {
            throw new TypeError('PeerDiscovery nodeId must be a non-empty string');
        }

        const heartbeatIntervalMs = opts.heartbeatIntervalMs ?? DEFAULT_PEER_HEARTBEAT_MS;
        if (typeof heartbeatIntervalMs !== 'number' || !Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs <= 0) {
            throw new TypeError('PeerDiscovery heartbeatIntervalMs must be a positive finite number');
        }

        const peerTimeoutMs = opts.peerTimeoutMs ?? heartbeatIntervalMs * 3;
        if (typeof peerTimeoutMs !== 'number' || !Number.isFinite(peerTimeoutMs) || peerTimeoutMs <= 0) {
            throw new TypeError('PeerDiscovery peerTimeoutMs must be a positive finite number');
        }

        const sweepIntervalMs =
            opts.sweepIntervalMs ?? Math.max(20, Math.min(1000, Math.floor(peerTimeoutMs / 2)));
        if (typeof sweepIntervalMs !== 'number' || !Number.isFinite(sweepIntervalMs) || sweepIntervalMs <= 0) {
            throw new TypeError('PeerDiscovery sweepIntervalMs must be a positive finite number');
        }

        if (opts.autoLeaveOnPageHide !== undefined && typeof opts.autoLeaveOnPageHide !== 'boolean') {
            throw new TypeError('PeerDiscovery autoLeaveOnPageHide must be a boolean');
        }

        if (opts.transport !== undefined) {
            if (
                !opts.transport ||
                typeof opts.transport !== 'object' ||
                typeof opts.transport.postMessage !== 'function' ||
                typeof opts.transport.close !== 'function'
            ) {
                throw new TypeError('PeerDiscovery options.transport must provide postMessage() and close() methods');
            }
        }

        if (opts.now !== undefined && typeof opts.now !== 'function') {
            throw new TypeError('PeerDiscovery now option must be a function');
        }

        this._injectedBus = injectedBus;
        this._bus = injectedBus;
        this._ownsBus = false;
        this._namespace = namespace;
        this._channelName = injectedBus?.channelName ?? opts.channelName ?? DEFAULT_BUS_CHANNEL;
        this._transportOption = opts.transport;
        this._nodeId = opts.nodeId ?? injectedBus?.tabId ?? generateContextId();
        this._capabilities = sanitizeCapabilities(opts.capabilities);
        this._meta = sanitizeMeta(opts.meta);
        this._heartbeatIntervalMs = heartbeatIntervalMs;
        this._peerTimeoutMs = peerTimeoutMs;
        this._sweepIntervalMs = sweepIntervalMs;
        this._autoLeaveOnPageHide = opts.autoLeaveOnPageHide !== false;
        this._now = opts.now ?? (() => Date.now());

        this._started = false;
        this._disposed = false;
        this._seq = 0;
        this._startedAt = null;
        this._peers = new Map();
        this._busUnsubs = [];
        this._heartbeatTimer = null;
        this._sweepTimer = null;
        this._pageHideBound = false;
        this._onPageHide = () => {
            if (this._started && !this._disposed) {
                this._sendPresence(TOPIC_PEER_LEAVE, { reason: 'pagehide' });
            }
        };
    }

    /** @private */
    _ensureBus() {
        if (this._bus && !this._bus.closed) {
            return this._bus;
        }
        if (this._injectedBus) {
            this._bus = this._injectedBus;
            this._ownsBus = false;
            return this._bus;
        }
        this._bus = new MessageBus({
            namespace: this._namespace,
            channelName: this._channelName,
            transport: this._transportOption,
            tabId: this._nodeId,
        });
        this._ownsBus = true;
        return this._bus;
    }

    /** @private */
    _subscribeBus() {
        const bus = this._ensureBus();
        if (bus.closed) return;
        this._unsubscribeBus();
        this._busUnsubs.push(
            bus.subscribe(TOPIC_PEER_HELLO, (payload, meta) => this._handlePresence(payload, meta, 'hello'), {
                receive: 'remote',
            }),
            bus.subscribe(TOPIC_PEER_HEARTBEAT, (payload, meta) => this._handlePresence(payload, meta, 'heartbeat'), {
                receive: 'remote',
            }),
            bus.subscribe(TOPIC_PEER_LEAVE, (payload, meta) => this._handleLeave(payload, meta), {
                receive: 'remote',
            })
        );
    }

    /** @private */
    _unsubscribeBus() {
        while (this._busUnsubs.length) {
            const unsub = this._busUnsubs.pop();
            unsub();
        }
    }

    /** @private */
    _attachPageHide() {
        if (!this._autoLeaveOnPageHide || this._pageHideBound) return;
        if (typeof globalThis.addEventListener !== 'function') return;
        globalThis.addEventListener('pagehide', this._onPageHide);
        this._pageHideBound = true;
    }

    /** @private */
    _detachPageHide() {
        if (!this._pageHideBound) return;
        if (typeof globalThis.removeEventListener === 'function') {
            globalThis.removeEventListener('pagehide', this._onPageHide);
        }
        this._pageHideBound = false;
    }

    /** @private */
    _sendPresence(topic, extra = {}) {
        if (!this._bus || this._bus.closed || !this._bus.supported) return false;
        this._seq += 1;
        const ts = this._now();
        try {
            const res = this._bus.publish(
                topic,
                {
                    nodeId: this._nodeId,
                    namespace: this._namespace,
                    capabilities: this._capabilities,
                    meta: this._meta,
                    seq: this._seq,
                    startedAt: this._startedAt ?? ts,
                    timestamp: ts,
                    ...extra,
                },
                { local: false, remote: true }
            );
            return Boolean(res.remoteSent);
        } catch {
            return false;
        }
    }

    /** @private */
    _validateIncomingPresence(payload) {
        if (!isPlainObject(payload)) return null;
        if (payload.namespace !== this._namespace) return null;
        if (!isNonEmptyString(payload.nodeId) || payload.nodeId === this._nodeId) return null;
        if (typeof payload.seq !== 'number' || !Number.isSafeInteger(payload.seq) || payload.seq < 0) return null;
        const startedAt =
            typeof payload.startedAt === 'number' && Number.isFinite(payload.startedAt)
                ? payload.startedAt
                : this._now();
        try {
            const capabilities = sanitizeCapabilities(payload.capabilities);
            const meta = sanitizeMeta(payload.meta);
            return {
                nodeId: payload.nodeId,
                namespace: payload.namespace,
                capabilities,
                meta,
                seq: payload.seq,
                startedAt,
                reason: isNonEmptyString(payload.reason) ? payload.reason : 'leave',
            };
        } catch {
            return null;
        }
    }

    /** @private */
    _handlePresence(rawPayload, meta, kind) {
        if (!this._started || this._disposed) return;
        const msg = this._validateIncomingPresence(rawPayload);
        if (!msg) return;

        const seenAt = this._now();
        const existing = this._peers.get(msg.nodeId);

        if (existing) {
            if (msg.startedAt < existing.startedAt) {
                return;
            }
            if (msg.startedAt === existing.startedAt && msg.seq <= existing.seq) {
                return;
            }
            const wasExpired = existing.status === 'expired';
            const isRestartedHello = kind === 'hello' && msg.startedAt > existing.startedAt;
            const prevSnapshot = freezePeerSnapshot(existing);
            const capChanged = canonicalStringify(existing.capabilities) !== canonicalStringify(msg.capabilities);
            const metaChanged = canonicalStringify(existing.meta) !== canonicalStringify(msg.meta);

            existing.capabilities = msg.capabilities;
            existing.meta = msg.meta;
            existing.seq = msg.seq;
            existing.startedAt = msg.startedAt;
            existing.lastSeenAt = seenAt;
            existing.updatedAt = seenAt;
            existing.status = 'alive';
            existing.expiredAt = null;

            const snapshot = freezePeerSnapshot(existing);
            if (wasExpired || isRestartedHello) {
                this.emit('peer-join', { peer: snapshot, rejoined: true, kind });
            }
            if (capChanged || metaChanged) {
                this.emit('peer-update', { peer: snapshot, previous: prevSnapshot });
            }
            this.emit('peer-heartbeat', { peer: snapshot, timestamp: meta?.timestamp ?? seenAt });
            if (kind === 'hello' && this._started && !this._disposed) {
                this._sendPresence(TOPIC_PEER_HEARTBEAT);
            }
            return;
        }

        const record = {
            nodeId: msg.nodeId,
            namespace: this._namespace,
            capabilities: msg.capabilities,
            meta: msg.meta,
            status: 'alive',
            seq: msg.seq,
            startedAt: msg.startedAt,
            firstSeenAt: seenAt,
            lastSeenAt: seenAt,
            expiredAt: null,
            updatedAt: seenAt,
        };
        this._peers.set(msg.nodeId, record);

        const snapshot = freezePeerSnapshot(record);
        this.emit('peer-join', { peer: snapshot, rejoined: false, kind });
        this.emit('peer-heartbeat', { peer: snapshot, timestamp: meta?.timestamp ?? seenAt });
        // 新加入節點發來 __peer:hello 時回覆單次 heartbeat（絕不回 hello），讓晚加入分頁立即完成雙向發現
        if (kind === 'hello' && this._started && !this._disposed) {
            this._sendPresence(TOPIC_PEER_HEARTBEAT);
        }
    }

    /** @private */
    _handleLeave(rawPayload) {
        if (!this._started || this._disposed) return;
        const msg = this._validateIncomingPresence(rawPayload);
        if (!msg) return;

        const existing = this._peers.get(msg.nodeId);
        if (!existing) return;
        if (msg.startedAt < existing.startedAt) return;
        if (existing.startedAt === msg.startedAt && msg.seq <= existing.seq) return;

        this._peers.delete(msg.nodeId);
        const leftSnapshot = freezePeerSnapshot({
            ...existing,
            status: 'left',
            seq: msg.seq,
            updatedAt: this._now(),
        });
        this.emit('peer-leave', { peer: leftSnapshot, reason: msg.reason });
    }

    /** @private */
    _evictExpiredIfNeeded() {
        const expiredEntries = [];
        for (const [id, rec] of this._peers) {
            if (rec.status === 'expired') {
                expiredEntries.push([id, rec.expiredAt ?? rec.lastSeenAt]);
            }
        }
        if (expiredEntries.length <= MAX_EXPIRED_PEERS) return;
        expiredEntries.sort((a, b) => a[1] - b[1]);
        const excess = expiredEntries.length - MAX_EXPIRED_PEERS;
        for (let i = 0; i < excess; i++) {
            this._peers.delete(expiredEntries[i][0]);
        }
    }

    /**
     * 啟動節點探索：建立內部通道（若未注入）、發布 `__peer:hello` 並開始 heartbeat 與過期掃描。
     * @returns {{ started: boolean, nodeId: string, namespace: string, supported: boolean }}
     */
    start() {
        if (this._disposed) {
            throw new Error('Cannot start a disposed PeerDiscovery');
        }
        if (this._started) {
            return {
                started: true,
                nodeId: this._nodeId,
                namespace: this._namespace,
                supported: this.supported,
            };
        }

        this._started = true;
        this._startedAt = this._now();
        this._ensureBus();
        this._subscribeBus();
        this._attachPageHide();
        this._sendPresence(TOPIC_PEER_HELLO);

        this._heartbeatTimer = setInterval(() => {
            if (this._started && !this._disposed) {
                this._sendPresence(TOPIC_PEER_HEARTBEAT);
            }
        }, this._heartbeatIntervalMs);

        this._sweepTimer = setInterval(() => {
            if (this._started && !this._disposed) {
                this.sweep();
            }
        }, this._sweepIntervalMs);

        return {
            started: true,
            nodeId: this._nodeId,
            namespace: this._namespace,
            supported: this.supported,
        };
    }

    /**
     * 主動發布一次 heartbeat（可用於狀態變更後或測試）。
     * @returns {boolean}
     */
    announce() {
        if (!this._started || this._disposed) return false;
        return this._sendPresence(TOPIC_PEER_HEARTBEAT);
    }

    /**
     * 更新本機能力宣告（及選用 meta），若已啟動會立即發送 heartbeat 通知他頁。
     * @param {Record<string, any> | string[]} capabilities
     * @param {Record<string, any>} [meta]
     */
    updateCapabilities(capabilities, meta) {
        if (this._disposed) {
            throw new Error('Cannot update capabilities on a disposed PeerDiscovery');
        }
        this._capabilities = sanitizeCapabilities(capabilities);
        if (meta !== undefined) {
            this._meta = sanitizeMeta(meta);
        }
        if (this._started) {
            this._sendPresence(TOPIC_PEER_HEARTBEAT);
        }
    }

    /**
     * 掃描所有活躍節點，將超過 `peerTimeoutMs` 未見心跳者標記為 `'expired'` 並發出 `'peer-expire'`。
     * 註：過期僅供觀測，不代表其所持 Web Lock 已釋放。
     * @returns {object[]} 本次掃描剛轉為過期的節點快照清單
     */
    sweep() {
        if (!this._started || this._disposed) return [];
        const current = this._now();
        const newlyExpired = [];

        for (const record of this._peers.values()) {
            if (record.status !== 'alive') continue;
            const elapsedMs = current - record.lastSeenAt;
            if (elapsedMs >= this._peerTimeoutMs) {
                record.status = 'expired';
                record.expiredAt = current;
                record.updatedAt = current;
                const snapshot = freezePeerSnapshot(record);
                newlyExpired.push(snapshot);
                this.emit('peer-expire', {
                    peer: snapshot,
                    reason: 'timeout',
                    elapsedMs,
                });
            }
        }

        if (newlyExpired.length > 0) {
            this._evictExpiredIfNeeded();
        }
        return newlyExpired;
    }

    /**
     * 取得指定節點目前快照（傳入自身 nodeId 時回傳本機快照）。
     * @param {string} nodeId
     * @returns {object | null}
     */
    getPeer(nodeId) {
        if (!isNonEmptyString(nodeId)) return null;
        if (nodeId === this._nodeId) {
            if (!this._started) return null;
            const ts = this._now();
            return freezePeerSnapshot({
                nodeId: this._nodeId,
                namespace: this._namespace,
                capabilities: this._capabilities,
                meta: this._meta,
                status: 'alive',
                seq: this._seq,
                startedAt: this._startedAt ?? ts,
                firstSeenAt: this._startedAt ?? ts,
                lastSeenAt: ts,
                expiredAt: null,
                updatedAt: ts,
            });
        }
        const rec = this._peers.get(nodeId);
        return rec ? freezePeerSnapshot(rec) : null;
    }

    /**
     * 列出目前已知節點。
     * @param {{ includeSelf?: boolean, includeExpired?: boolean, capability?: string }} [options]
     * @returns {object[]}
     */
    getPeers(options = {}) {
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('PeerDiscovery getPeers options must be a plain object');
        }
        const { includeSelf = false, includeExpired = false, capability } = options || {};
        if (capability !== undefined && !isNonEmptyString(capability)) {
            throw new TypeError('PeerDiscovery capability filter must be a non-empty string');
        }

        const out = [];
        if (includeSelf && this._started && !this._disposed) {
            const selfSnap = this.getPeer(this._nodeId);
            if (selfSnap && (!capability || matchesCapability(selfSnap.capabilities, capability))) {
                out.push(selfSnap);
            }
        }
        for (const record of this._peers.values()) {
            if (!includeExpired && record.status !== 'alive') continue;
            if (capability && !matchesCapability(record.capabilities, capability)) continue;
            out.push(freezePeerSnapshot(record));
        }
        return out;
    }

    /**
     * 停止節點探索：發布離開事件、停止計時器與監聽。
     */
    stop() {
        if (!this._started || this._disposed) return;
        this._sendPresence(TOPIC_PEER_LEAVE, { reason: 'stop' });
        this._started = false;

        if (this._heartbeatTimer !== null) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
        if (this._sweepTimer !== null) {
            clearInterval(this._sweepTimer);
            this._sweepTimer = null;
        }
        this._detachPageHide();
        this._unsubscribeBus();
    }

    /**
     * 停止並清理所有內部狀態與監聽器（若為外部注入 bus，不會代為關閉）。
     */
    dispose() {
        if (this._disposed) return;
        this.stop();
        this._disposed = true;
        this._peers.clear();

        if (this._ownsBus && this._bus) {
            this._bus.close();
        }
        this._bus = null;
        this._ownsBus = false;

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

    /** `dispose()` 的別名 */
    close() {
        this.dispose();
    }

    /** @returns {string} */
    get nodeId() {
        return this._nodeId;
    }

    /** @returns {string} */
    get namespace() {
        return this._namespace;
    }

    /** @returns {Record<string, any> | readonly string[]} */
    get localCapabilities() {
        return this._capabilities;
    }

    /** @returns {boolean} */
    get started() {
        return this._started;
    }

    /** @returns {boolean} */
    get closed() {
        return this._disposed;
    }

    /** @returns {boolean} */
    get supported() {
        if (this._bus) return this._bus.supported;
        if (this._transportOption !== undefined) return true;
        return getCoordinationCapabilities().broadcastChannel;
    }

    /** @returns {{ broadcastChannel: boolean, webLocks: boolean, indexedDB: boolean, localStorage: boolean, webSocket: boolean, eventSource: boolean, transport: string, supported: boolean }} */
    get capabilities() {
        return this._bus?.capabilities ?? {
            ...getCoordinationCapabilities(),
            transport: this._transportOption ? 'custom' : this.supported ? 'native' : 'none',
            supported: this.supported,
        };
    }
}

/**
 * 建立 PeerDiscovery 實例的工廠函式（import 或建立實例不會啟動任何定時器或通道）。
 * @param {object} [options]
 * @returns {PeerDiscovery}
 */
export function createPeerDiscovery(options = {}) {
    return new PeerDiscovery(options);
}
