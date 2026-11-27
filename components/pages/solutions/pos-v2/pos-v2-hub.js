/**
 * POS v2 主機 hub（#16，協定規格第 5、6 節）：每條 DataChannel 一個連線，依授權分派 RPC、依角色推送快照、
 * 心跳與在線狀態、背壓、不合格訊息計數，以及入桌碼與連線碼的嘗試次數限制。
 *
 * hub 只認得「類 DataChannel」的物件（`send`、`close`、`bufferedAmount`、`bufferedAmountLowThreshold`、
 * `message`／`close`／`bufferedamountlow` 事件），不碰 WebRTC 與信令，所以可以在 Node 以記憶體通道測試。
 *
 * 事件：`connections`（連線清單或狀態改變）、`pairings`（待核准的配對申請改變）、`attempts`（入桌碼錯誤次數改變）、
 * `changed`（hub 寫入了資料；主機用它通知同一台電腦上的唯讀管理分頁）。
 */
import { BaseService } from '../../../../lib/base-service.js';
import { ORDER_STATUS } from '../pos/pos-model.js';
import {
    CHANNEL_ATTEMPT_POLICY,
    CREDENTIAL_KIND,
    LIMITS,
    POS_V2_ERROR_CODES,
    PosError,
    TARGET_ATTEMPT_POLICY,
    SESSION_STATUS,
    assertAttemptAllowed,
    authorizeMethod,
    canViewOrder,
    createAttemptState,
    evaluateAttempt,
    isStationOffline,
    principalOf,
    projectCustomerOrder,
    registerFailure,
    registerSuccess,
} from './pos-v2-model.js';
import {
    BAD_MESSAGE_LIMIT,
    BUFFER_HIGH_BYTES,
    BUFFER_LOW_BYTES,
    badMessage,
    encode,
    failure,
    parseMessage,
    ping,
    pong,
    push,
    result,
} from './pos-v2-wire.js';

/** 點餐裝置畫面列出的最近訂單數 */
const RECENT_ORDER_LIMIT = 20;
const LABEL_MAX = 40;
const PAIRING_TARGET = 'pairing-code';

/** 給店員裝置的訂單欄位：不含 principal、requestId 與歷程 */
export function staffOrder(order) {
    return {
        id: order.id,
        number: order.number,
        status: order.status,
        station: order.station ?? null,
        items: order.items,
        total: order.total,
        tableId: order.tableId ?? null,
        source: order.source,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
    };
}

const cleanLabel = (value) => (typeof value === 'string' ? value.trim().slice(0, LABEL_MAX) : '');

export class PosV2Hub extends BaseService {
    /**
     * @param {{
     *   repository: import('./pos-v2-repository.js').PosV2Repository,
     *   now?: () => number, timers?: { setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function },
     *   generateId?: () => string, pingIntervalMs?: number, peerTimeoutMs?: number, flushDelayMs?: number,
     * }} options
     */
    constructor({
        repository,
        now = () => Date.now(),
        timers = globalThis,
        generateId = () => crypto.randomUUID(),
        pingIntervalMs = LIMITS.PING_INTERVAL_MS,
        peerTimeoutMs = LIMITS.PEER_TIMEOUT_MS,
        flushDelayMs = 100,
    }) {
        super();
        this.repository = repository;
        this._now = now;
        this._timers = timers;
        this._generateId = generateId;
        this._pingIntervalMs = pingIntervalMs;
        this._peerTimeoutMs = peerTimeoutMs;
        this._flushDelayMs = flushDelayMs;
        this.startedAt = now();
        this.rev = 0;
        /** @type {Map<string, object>} */
        this._connections = new Map();
        /** 廚房站台 → { connected, lastSeenAt } */
        this._presence = new Map();
        /** 待核准的配對申請 */
        this._pairings = new Map();
        /** 入桌碼與連線碼的錯誤次數（每張桌、配對碼共用一份） */
        this._targetAttempts = new Map();
        /** order.act 依序執行：判斷站台離線與寫入不會交錯（協定規格 6.4） */
        this._actQueue = Promise.resolve();
        this._flushTimer = null;
        /** 站台離線後、到可以接手的時間點再推送一次（廚房畫面才會出現接手按鈕） */
        this._presenceTimers = new Set();
        this._heartbeat = null;
        this._disposed = false;
    }

    start() {
        if (this._heartbeat !== null) return;
        this._heartbeat = this._timers.setInterval(() => this._beat(), this._pingIntervalMs);
    }

    dispose() {
        this._disposed = true;
        if (this._heartbeat !== null) this._timers.clearInterval(this._heartbeat);
        this._heartbeat = null;
        if (this._flushTimer !== null) this._timers.clearTimeout(this._flushTimer);
        this._flushTimer = null;
        for (const timer of this._presenceTimers) this._timers.clearTimeout(timer);
        this._presenceTimers.clear();
        for (const conn of [...this._connections.values()]) this._close(conn, 'hub disposed');
    }

    // ---------- 連線 ----------

    /**
     * 接上一條已開啟的 DataChannel。
     * @param {string} id 連線 id（信令給的 peerId）
     * @param {object} channel 類 RTCDataChannel
     */
    attach(id, channel) {
        const existing = this._connections.get(id);
        if (existing) this._close(existing, 'replaced');
        const conn = {
            id,
            channel,
            grants: { device: null, table: null, watches: new Set() },
            badMessages: 0,
            connectedAt: this._now(),
            lastSeenAt: this._now(),
            attempts: createAttemptState(),
            paused: false,
            closed: false,
        };
        try {
            channel.bufferedAmountLowThreshold = BUFFER_LOW_BYTES;
        } catch {
            // 假通道可能沒有這個屬性
        }
        conn.onMessage = (event) => this._onMessage(conn, event.data);
        conn.onClose = () => this._detach(conn);
        conn.onLow = () => this._resume(conn);
        channel.addEventListener('message', conn.onMessage);
        channel.addEventListener('close', conn.onClose);
        channel.addEventListener('bufferedamountlow', conn.onLow);
        this._connections.set(id, conn);
        this.emit('connections', this.listConnections());
        return conn;
    }

    /** 主動關閉一條連線（管理頁或信令通知 peer 離開時） */
    disconnect(id, reason = 'closed by host') {
        const conn = this._connections.get(id);
        if (conn) this._close(conn, reason);
    }

    _close(conn, reason) {
        if (!conn.closed) {
            try {
                conn.channel.close();
            } catch {
                // 已關閉
            }
        }
        conn.closeReason ??= reason;
        this._detach(conn);
    }

    _detach(conn) {
        if (conn.closed) return;
        conn.closed = true;
        conn.channel.removeEventListener('message', conn.onMessage);
        conn.channel.removeEventListener('close', conn.onClose);
        conn.channel.removeEventListener('bufferedamountlow', conn.onLow);
        if (this._connections.get(conn.id) === conn) this._connections.delete(conn.id);
        const station = this._stationOf(conn);
        if (station && !this._stationConnections(station).length) {
            this._presence.set(station, { connected: false, lastSeenAt: conn.lastSeenAt });
            this.notifyChanged();
            this._notifyWhenTakeoverAllowed(conn.lastSeenAt);
        }
        let pairingsChanged = false;
        for (const [id, pairing] of this._pairings) {
            if (pairing.connectionId === conn.id) {
                this._pairings.delete(id);
                pairingsChanged = true;
            }
        }
        if (pairingsChanged) this.emit('pairings', this.listPairings());
        this.emit('connections', this.listConnections());
    }

    _notifyWhenTakeoverAllowed(lastSeenAt) {
        if (this._disposed) return;
        const delay = Math.max(0, lastSeenAt + LIMITS.PEER_TIMEOUT_MS + 50 - this._now());
        const timer = this._timers.setTimeout(() => {
            this._presenceTimers.delete(timer);
            this.notifyChanged();
        }, delay);
        this._presenceTimers.add(timer);
    }

    _stationOf(conn) {
        const device = conn.grants.device;
        return device?.role === 'kitchen' ? device.station : null;
    }

    _stationConnections(station) {
        return [...this._connections.values()].filter((c) => this._stationOf(c) === station);
    }

    _touch(conn) {
        conn.lastSeenAt = this._now();
        const station = this._stationOf(conn);
        if (station) {
            const before = this._presence.get(station);
            this._presence.set(station, { connected: true, lastSeenAt: conn.lastSeenAt });
            if (!before?.connected) this.notifyChanged();
        }
    }

    _beat() {
        const now = this._now();
        for (const conn of [...this._connections.values()]) {
            if (now - conn.lastSeenAt > this._peerTimeoutMs) this._close(conn, 'heartbeat timeout');
            else this._send(conn, ping(now));
        }
    }

    // ---------- 收發 ----------

    _send(conn, message, { droppable = false } = {}) {
        if (conn.closed) return false;
        if (droppable && (conn.paused || conn.channel.bufferedAmount > BUFFER_HIGH_BYTES)) {
            // 對方收得太慢：暫停推送，等 bufferedamountlow 再送一份最新快照，不補送中間的推送
            conn.paused = true;
            return false;
        }
        try {
            conn.channel.send(encode(message));
            return true;
        } catch {
            this._close(conn, 'send failed');
            return false;
        }
    }

    async _resume(conn) {
        if (!conn.paused || conn.closed) return;
        conn.paused = false;
        await this._pushSnapshot(conn, await this._loadData());
    }

    _onMessage(conn, raw) {
        if (conn.closed) return;
        this._touch(conn);
        const parsed = parseMessage(raw);
        if (!parsed.ok) {
            conn.badMessages += 1;
            if (parsed.id) this._send(conn, badMessage(parsed.id));
            if (conn.badMessages >= BAD_MESSAGE_LIMIT) this._close(conn, 'too many bad messages');
            else this.emit('connections', this.listConnections());
            return;
        }
        const { message } = parsed;
        if (message.type === 'ping') this._send(conn, pong(message.ts));
        else if (message.type === 'req') this._dispatch(conn, message);
        // peer 不該送 res／push；pong 只用來更新在線時間
    }

    async _dispatch(conn, { id, method, params = {} }) {
        try {
            const handler = this._handlers[method];
            authorizeMethod(method, conn.grants, params);
            if (!handler) throw new PosError(POS_V2_ERROR_CODES.BAD_MESSAGE, `不支援的方法：${method}`);
            const value = await handler.call(this, conn, params);
            this._send(conn, result(id, value));
        } catch (err) {
            if (!(err instanceof PosError)) console.warn('[pos-v2 hub]', method, err);
            this._send(conn, failure(id, err));
        }
    }

    // ---------- 推送 ----------

    /** 資料改變了：100 ms 內合併，依角色推送完整快照 */
    notifyChanged() {
        this.emit('changed', {});
        if (this._disposed || this._flushTimer !== null) return;
        this._flushTimer = this._timers.setTimeout(() => {
            this._flushTimer = null;
            this.flush().catch((err) => console.warn('[pos-v2 hub] 推送失敗', err));
        }, this._flushDelayMs);
    }

    async flush() {
        const data = await this._loadData();
        this.rev += 1;
        for (const conn of this._connections.values()) await this._pushSnapshot(conn, data, { droppable: true });
    }

    async _loadData() {
        const [orders, tables] = await Promise.all([this.repository.listOrders(), this.repository.listTables()]);
        return { orders, tables };
    }

    async _pushSnapshot(conn, data, { droppable = false } = {}) {
        const topics = this._topicsFor(conn, data);
        for (const [topic, value] of Object.entries(topics)) {
            if (!this._send(conn, push(topic, this.rev, value), { droppable })) break;
        }
    }

    /** 依這條連線的授權組出它能看的快照（協定規格 6.3） */
    _topicsFor(conn, { orders, tables }) {
        const { device, table, watches } = conn.grants;
        const topics = {};
        if (device?.role === 'kitchen') {
            topics.kitchen = {
                orders: orders.filter((o) => o.status === ORDER_STATUS.PENDING || o.status === ORDER_STATUS.PREPARING).map(staffOrder),
                stations: this.listStations(),
            };
        }
        if (device?.role === 'display') {
            // 叫號畫面要用 id 送「已取餐」，只給號碼與狀態
            const shown = new Set([ORDER_STATUS.PENDING, ORDER_STATUS.PREPARING, ORDER_STATUS.READY]);
            topics.display = { orders: orders.filter((o) => shown.has(o.status)).map(({ id, number, status }) => ({ id, number, status })) };
        }
        if (device?.role === 'order') {
            const principal = principalOf(device);
            topics.order = { orders: orders.filter((o) => o.principal === principal).slice(-RECENT_ORDER_LIMIT).map(staffOrder) };
        }
        if (table || watches.size) {
            const principal = table ? principalOf(table) : null;
            topics.myOrders = { orders: orders.filter((o) => canViewOrder(o, { principal, watches })).map((o) => projectCustomerOrder(o, orders)) };
        }
        if (table) {
            const current = tables.find((t) => t.id === table.tableId)?.session;
            const open = current?.id === table.diningSessionId && current.status === SESSION_STATUS.OPEN;
            topics.session = { tableId: table.tableId, diningSessionId: table.diningSessionId, status: open ? SESSION_STATUS.OPEN : SESSION_STATUS.CLOSED };
        }
        return topics;
    }

    async _snapshotResult(conn) {
        return { rev: this.rev, topics: this._topicsFor(conn, await this._loadData()) };
    }

    // ---------- 嘗試次數 ----------

    _targetState(key) {
        return this._targetAttempts.get(key) ?? createAttemptState();
    }

    /** 入桌碼與連線碼共用：冷卻中直接拒絕；碼錯誤時同時計入連線與目標 */
    async _attempt(conn, target, run) {
        const now = this._now();
        assertAttemptAllowed(conn.attempts, now);
        assertAttemptAllowed(this._targetState(target), now);
        try {
            const value = await run();
            conn.attempts = registerSuccess(conn.attempts, CHANNEL_ATTEMPT_POLICY);
            return value;
        } catch (err) {
            if (err?.code === POS_V2_ERROR_CODES.CODE_INVALID) {
                conn.attempts = registerFailure(conn.attempts, this._now(), CHANNEL_ATTEMPT_POLICY);
                this._targetAttempts.set(target, registerFailure(this._targetState(target), this._now(), TARGET_ATTEMPT_POLICY));
                this.emit('attempts', this.listAttempts());
            }
            throw err;
        }
    }

    // ---------- RPC ----------

    _handlers = {
        async auth(conn, { credentials = [], watches = [] }) {
            if (!Array.isArray(credentials) || !Array.isArray(watches) || credentials.length > 1 || watches.length > 50) {
                throw new PosError(POS_V2_ERROR_CODES.BAD_MESSAGE, '授權最多一份、查詢最多 50 筆');
            }
            const rejected = [];
            for (const presented of credentials) {
                try {
                    const record = await this.repository.verifyCredential(presented);
                    if (record.kind === CREDENTIAL_KIND.DEVICE) conn.grants.device = record;
                    else conn.grants.table = record;
                } catch (err) {
                    rejected.push({ kind: presented?.kind ?? null, id: presented?.id ?? null, code: err?.code ?? 'UNAUTHORIZED' });
                }
            }
            for (const watch of watches) {
                try {
                    const order = await this.repository.verifyViewToken(watch ?? {});
                    conn.grants.watches.add(order.id);
                } catch (err) {
                    rejected.push({ kind: 'view', id: watch?.orderId ?? null, code: err?.code ?? 'UNAUTHORIZED' });
                }
            }
            this._touch(conn);
            this.emit('connections', this.listConnections());
            return { ...this._grantSummary(conn), rejected, ...(await this._snapshotResult(conn)) };
        },

        async sync(conn) {
            return this._snapshotResult(conn);
        },

        async 'table.listOpen'() {
            const tables = await this.repository.listTables();
            return { tables: tables.filter((t) => t.session?.status === SESSION_STATUS.OPEN).map(({ id, name }) => ({ id, name })) };
        },

        async 'table.join'(conn, { tableId, code }) {
            if (conn.grants.device) throw new PosError(POS_V2_ERROR_CODES.FORBIDDEN, '店員裝置不能入桌');
            const target = `table:${String(tableId)}`;
            const joined = await this._attempt(conn, target, () => this.repository.joinTable({ tableId, code }));
            conn.grants.table = { kind: CREDENTIAL_KIND.TABLE, id: joined.credential.id, tableId: joined.session.tableId, diningSessionId: joined.session.id };
            this.emit('connections', this.listConnections());
            return { credential: joined.credential, session: { id: joined.session.id, tableId: joined.session.tableId, status: joined.session.status }, ...(await this._snapshotResult(conn)) };
        },

        async 'pair.request'(conn, { token, code, label }) {
            const byToken = typeof token === 'string' && token !== '';
            const find = () => this.repository.findPairing(byToken ? { token } : { code });
            const ticket = byToken ? await find() : await this._attempt(conn, PAIRING_TARGET, find);
            const pairing = { id: this._generateId(), connectionId: conn.id, ticketId: ticket.id, label: cleanLabel(label), requestedAt: this._now() };
            this._pairings.set(pairing.id, pairing);
            this.emit('pairings', this.listPairings());
            return { status: 'pending', pairRequestId: pairing.id };
        },

        async 'order.watch'(conn, { orderId, token }) {
            const order = await this.repository.verifyViewToken({ orderId, token });
            conn.grants.watches.add(order.id);
            this.emit('connections', this.listConnections());
            const data = await this._loadData();
            return { order: projectCustomerOrder(order, data.orders), rev: this.rev, topics: this._topicsFor(conn, data) };
        },

        async 'menu.get'() {
            return { products: await this.repository.listProducts() };
        },

        async 'order.place'(conn, { items, requestId, tableId = null }) {
            const { device, table } = conn.grants;
            const grant = table ?? device;
            const outcome = await this.repository.placeOrder({ grant, items, requestId, tableId: table ? null : tableId });
            if (outcome.result === 'applied') this.notifyChanged();
            const { orders } = await this._loadData();
            return {
                result: outcome.result,
                order: projectCustomerOrder(outcome.order, orders),
                ...(outcome.viewToken ? { viewToken: outcome.viewToken } : {}),
            };
        },

        async 'order.act'(conn, { orderId, action, fromStation }) {
            const device = conn.grants.device;
            const actor = device.role === 'kitchen' ? device.station : `display:${device.label || device.id}`;
            const run = async () => {
                if (action === 'takeover' && !isStationOffline(this._presence.get(fromStation), this._now(), this.startedAt)) {
                    throw new PosError(POS_V2_ERROR_CODES.CONFLICT, `站台 ${fromStation} 仍在線，不能接手`);
                }
                return this.repository.transition(orderId, { action, actor, fromStation });
            };
            const queued = this._actQueue.then(run, run);
            this._actQueue = queued.catch(() => {});
            const decision = await queued;
            if (decision.result === 'applied') this.notifyChanged();
            return { result: decision.result, order: staffOrder(decision.order) };
        },
    };

    // ---------- 管理端 ----------

    /**
     * 核准配對申請：簽發裝置授權，推送 `pair.approved` 給申請的連線，這條連線立即取得該授權。
     * @param {string} pairRequestId
     * @param {{ role: string, station?: string | null, label?: string }} options
     */
    async approvePairing(pairRequestId, { role, station = null, label }) {
        const pairing = this._pairings.get(pairRequestId);
        if (!pairing) throw new PosError(POS_V2_ERROR_CODES.NOT_FOUND, '找不到配對申請');
        const conn = this._connections.get(pairing.connectionId);
        if (!conn) {
            this._pairings.delete(pairRequestId);
            this.emit('pairings', this.listPairings());
            throw new PosError(POS_V2_ERROR_CODES.NOT_FOUND, '申請的裝置已離線');
        }
        const { credential, device } = await this.repository.approveDevice({ role, station, label: cleanLabel(label ?? pairing.label) });
        this._pairings.delete(pairRequestId);
        conn.grants.device = device;
        this._touch(conn);
        this._send(conn, push('pair.approved', this.rev, { pairRequestId, credential, role: device.role, station: device.station ?? null, label: device.label }));
        this.emit('pairings', this.listPairings());
        this.emit('connections', this.listConnections());
        this.notifyChanged();
        return device;
    }

    rejectPairing(pairRequestId) {
        const pairing = this._pairings.get(pairRequestId);
        if (!pairing) return;
        this._pairings.delete(pairRequestId);
        const conn = this._connections.get(pairing.connectionId);
        if (conn) this._send(conn, push('pair.rejected', this.rev, { pairRequestId }));
        this.emit('pairings', this.listPairings());
    }

    /** 撤銷授權：持有它的連線收到 `grant.revoked`，之後的請求一律 UNAUTHORIZED／FORBIDDEN */
    async revoke(credentialId) {
        const record = await this.repository.revokeCredential(credentialId);
        for (const conn of this._connections.values()) {
            const { device, table } = conn.grants;
            if (device?.id === credentialId) conn.grants.device = null;
            else if (table?.id === credentialId) conn.grants.table = null;
            else continue;
            this._send(conn, push('grant.revoked', this.rev, { credentialId }));
        }
        this.emit('connections', this.listConnections());
        this.notifyChanged();
        return record;
    }

    _grantSummary(conn) {
        const { device, table, watches } = conn.grants;
        return {
            device: device ? { id: device.id, role: device.role, station: device.station ?? null, label: device.label ?? '' } : null,
            table: table ? { id: table.id, tableId: table.tableId, diningSessionId: table.diningSessionId } : null,
            watches: [...watches],
        };
    }

    listConnections() {
        return [...this._connections.values()].map((conn) => ({
            id: conn.id,
            ...this._grantSummary(conn),
            badMessages: conn.badMessages,
            connectedAt: conn.connectedAt,
            lastSeenAt: conn.lastSeenAt,
            paused: conn.paused,
        }));
    }

    listPairings() {
        return [...this._pairings.values()].map(({ id, label, requestedAt, connectionId }) => ({ id, label, requestedAt, connectionId }));
    }

    /** 各廚房站台的在線狀態 */
    listStations() {
        const now = this._now();
        return [...this._presence.entries()].map(([station, presence]) => ({
            station,
            online: presence.connected,
            takeoverAllowed: isStationOffline(presence, now, this.startedAt),
        }));
    }

    /** 各桌（與配對碼）的錯誤次數，給管理頁顯示 */
    listAttempts() {
        const now = this._now();
        return [...this._targetAttempts.entries()].map(([target, state]) => ({
            target,
            failures: state.failures.filter((at) => now - at < TARGET_ATTEMPT_POLICY.windowMs).length,
            retryAfterMs: evaluateAttempt(state, now).retryAfterMs,
        }));
    }
}
