/**
 * POS v2 遠端裝置的工作階段（#16）：介面和第一代 `PosSession` 一致（建構參數、`snapshot`、`placeOrder`、
 * `act`、`refresh`、`stationId`、`namespace`、`nsOption`），讓點餐、廚房、叫號畫面直接重用第一代元件。
 *
 * 資料來源從本機 IndexedDB 換成主機：連上後以本機保存的授權 `auth`，之後靠主機推送的完整快照更新畫面；
 * 寫入一律送 RPC，主機寫入成功才回覆。快照另外帶 `connection`，第二代畫面用它顯示連線與授權狀態。
 *
 * - `RemotePosSession`：店員裝置（裝置授權；點餐、廚房、叫號）。
 * - `RemoteTableSession`：顧客手機的桌邊點餐（入桌授權；用入桌碼取得）。
 */
import { LINK_STATE } from './peer-link.js';
import { POS_V2_ERROR_CODES, PosError } from './pos-v2-model.js';
import { PEER_ERROR_CODES } from './pos-v2-rpc-client.js';
import {
    DEFAULT_NAMESPACE,
    LINK_STATE_LABEL,
    PosV2Remote,
    addPending,
    clearStaffCredential,
    clearTableCredential,
    loadPending,
    loadStaffCredential,
    loadTableCredential,
    readRemoteParams,
    remoteSupported,
    removePending,
    saveStaffCredential,
    saveTableCredential,
} from './pos-v2-remote.js';

/** 畫面要顯示的階段；`ready`（以及桌邊的 `closed`）時才顯示第一代的角色畫面 */
export const REMOTE_PHASE = Object.freeze({
    /** 網址沒有房間、信令（或桌號） */
    MISSING: 'missing',
    /** 店員裝置：這台裝置在這個房間沒有授權 */
    UNPAIRED: 'unpaired',
    /** 店員裝置：授權被主機拒絕或撤銷 */
    REVOKED: 'revoked',
    /** 店員裝置：授權的角色和這個畫面不同 */
    WRONG_ROLE: 'wrong-role',
    /** 店員裝置：網址的信令和配對時不同，使用者確認前不送出授權 */
    SIG_MISMATCH: 'sig-mismatch',
    /** 桌邊：還沒有這張桌目前場次的入桌授權，要輸入入桌碼 */
    NEED_CODE: 'need-code',
    /** 桌邊：入桌授權所屬的用餐場次已關閉（仍可查看自己的訂單） */
    CLOSED: 'closed',
    CONNECTING: 'connecting',
    READY: 'ready',
});

/** 連線中斷時不覆蓋的階段：重連後由 auth 重新判斷 */
const STICKY_PHASES = new Set([REMOTE_PHASE.REVOKED, REMOTE_PHASE.WRONG_ROLE, REMOTE_PHASE.MISSING, REMOTE_PHASE.SIG_MISMATCH]);

class RemoteSessionBase {
    static get supported() {
        return remoteSupported();
    }

    /**
     * @param {{ role: string, hash?: string, onChange: (snapshot: object) => void, remoteOptions?: object }} options
     */
    constructor({ role, hash = location.hash, onChange, remoteOptions = {} }) {
        this.role = role;
        const { roomId, sig, namespace, params } = readRemoteParams(hash);
        this.roomId = roomId;
        this.sig = sig;
        this.namespace = namespace;
        this.params = params;
        /** 送單回覆附的訂單查詢 token（店員點餐裝置的訂單 QR Code 用）：orderId → token */
        this.viewTokens = new Map();
        /**
         * 待確認的送單重送後有了結果：`{ requestId, outcome }` 或 `{ requestId, error }`。
         * 畫面用它清掉購物車並顯示取餐號（第一代的點餐元件只在自己送出成功時才會清）。
         * @type {((result: object) => void) | null}
         */
        this.onResolved = null;
        this._onChange = onChange;
        this._remoteOptions = remoteOptions;
        this._remote = null;
        this._disposed = false;
        this._authRun = 0;
        /** 主題 → 已套用的 rev */
        this._topicRev = new Map();
        this.snapshot = {
            products: [],
            orders: [],
            activeStations: new Set(),
            peers: [],
            online: false,
            error: null,
            /** 待確認的送單（已送出、還沒收到回覆） */
            pending: [],
            connection: { phase: REMOTE_PHASE.CONNECTING, link: LINK_STATE.IDLE, label: LINK_STATE_LABEL[LINK_STATE.IDLE] },
        };
    }

    get nsOption() {
        return this.namespace === DEFAULT_NAMESPACE ? undefined : this.namespace;
    }

    get phase() {
        return this.snapshot.connection.phase;
    }

    /** 待確認送單的分類：店員裝置與顧客分開存 */
    get pendingKind() {
        return 'device';
    }

    /** 目前送單用的授權 id；待確認的送單只能用同一份授權重送 */
    get credentialId() {
        return this.stored?.credential?.id ?? null;
    }

    _syncPending() {
        const pending = this.roomId ? loadPending(this.namespace, this.roomId, this.pendingKind) : [];
        this.snapshot = { ...this.snapshot, pending };
    }

    /**
     * 重連並驗證後，以原 requestId 重送待確認的送單（協定規格 7）。主機已經寫入過的會回傳原訂單（noop），
     * 沒寫入的照常建立；明確被拒絕的刪掉並通知畫面。又斷線時停下，等下一次重連。
     */
    async _flushPending(run) {
        // 不是目前這份授權送出的（換了桌、重新配對）：不改用新授權重送，逐筆告知（審查 M4）
        this._dropPending('送出這筆時用的授權已經更換，請向店員確認這筆是否已經送出', { keep: this.credentialId });
        for (const entry of this.snapshot.pending) {
            // 又斷線重連：交給新的一輪重送
            if (this._stale(run)) return;
            let result;
            try {
                result = { requestId: entry.requestId, outcome: await this._remote.request('order.place', { items: entry.items, requestId: entry.requestId }) };
            } catch (err) {
                if (err?.code === PEER_ERROR_CODES.HOST_UNAVAILABLE) return;
                result = { requestId: entry.requestId, error: err };
            }
            removePending(this.namespace, this.roomId, this.pendingKind, entry.requestId);
            if (result.outcome) this._acceptPlaced(result.outcome);
            this._syncPending();
            this._emit();
            this.onResolved?.(result);
        }
        if (!this._stale(run)) await this.refresh();
    }

    /**
     * 授權失效：舊授權下的待確認送單不能改用新的授權重送（主機若已寫入會變成兩筆），逐筆告知畫面後刪掉。
     * @param {string} message
     */
    _dropPending(message, { keep = null } = {}) {
        if (!this.roomId) return;
        for (const entry of loadPending(this.namespace, this.roomId, this.pendingKind)) {
            if (keep && entry.credentialId === keep) continue;
            removePending(this.namespace, this.roomId, this.pendingKind, entry.requestId);
            this.onResolved?.({ requestId: entry.requestId, error: new PosError(POS_V2_ERROR_CODES.UNAUTHORIZED, message) });
        }
        this._syncPending();
    }

    /** 送單成功：記下查詢 token，訂單先放進畫面（推送稍後才到，避免「取餐號碼」閃一下才出現） */
    _acceptPlaced(outcome) {
        if (outcome.viewToken) this.viewTokens.set(outcome.order.id, outcome.viewToken);
        if (!this.snapshot.orders.some((o) => o.id === outcome.order.id)) {
            this.snapshot = { ...this.snapshot, orders: [...this.snapshot.orders, outcome.order] };
        }
    }

    _connect() {
        const remote = new PosV2Remote({ sig: this.sig, roomId: this.roomId, ...this._remoteOptions });
        this._remote = remote;
        remote.on('state', (detail) => {
            if (detail.state === LINK_STATE.OPEN) return;
            this._setConnection({ ...detail, phase: STICKY_PHASES.has(this.phase) ? this.phase : REMOTE_PHASE.CONNECTING });
        });
        remote.on('open', () => this._authenticate());
        remote.on('push', ({ topic, rev, data }) => this._applyPush(topic, data, rev));
        remote.on('gap', () => this.refresh());
        remote.start();
    }

    /** 這次驗證之後又有新的驗證或已經 dispose：結果作廢 */
    _stale(run) {
        return this._disposed || run !== this._authRun;
    }

    /** 每次 DataChannel 開啟都重新驗證：主機重新整理或換分頁後，連線上的授權要重新建立 */
    async _authenticate() {
        const run = ++this._authRun;
        // 新的連線：主機可能換了執行個體，rev 從頭算
        this._topicRev.clear();
        try {
            const result = await this._remote.request('auth', this._authParams());
            if (this._stale(run)) return;
            await this._afterAuth(result, run);
        } catch (err) {
            if (this._stale(run)) return;
            // 連線又斷了：等下一次 open 再驗證
            if (err?.code === PEER_ERROR_CODES.HOST_UNAVAILABLE) return;
            this.snapshot = { ...this.snapshot, error: err };
            this._emit();
        }
    }

    async _loadMenu(run) {
        const { products } = await this._remote.request('menu.get');
        if (this._stale(run)) return false;
        this.snapshot = { ...this.snapshot, products };
        return true;
    }

    _applyPush(topic, data, rev) {
        if (topic === 'grant.revoked') this._onRevoked(data);
        else this._acceptTopics({ [topic]: data }, rev);
    }

    /**
     * 只套用比已套用的更新（rev 不小於）的主題：auth／sync 的快照在等選單等請求時，
     * 較新的推送可能先到，晚到的快照不能把它蓋回去（審查 S2）。
     */
    _acceptTopics(topics = {}, rev) {
        const fresh = {};
        for (const [topic, data] of Object.entries(topics)) {
            const seen = this._topicRev.get(topic);
            if (Number.isInteger(rev) && Number.isInteger(seen) && rev < seen) continue;
            if (Number.isInteger(rev)) this._topicRev.set(topic, rev);
            fresh[topic] = data;
        }
        this._applyTopics(fresh);
    }

    _setConnection(detail) {
        const link = detail.state ?? this.snapshot.connection.link;
        this.snapshot = {
            ...this.snapshot,
            online: detail.phase === REMOTE_PHASE.READY,
            connection: { ...detail, link, label: LINK_STATE_LABEL[link] ?? link },
        };
        this._emit();
    }

    _emit() {
        if (!this._disposed) this._onChange(this.snapshot);
    }

    /** 重新向主機取完整快照 */
    async refresh() {
        if (!this._remote?.isOpen) return;
        try {
            const { topics, rev } = await this._remote.request('sync');
            this._acceptTopics(topics, rev);
        } catch {
            // 連線中斷時由重連後的 auth 補上
        }
    }

    /**
     * @param {Array<{ productId: string, qty: number }>} items
     * @param {string} requestId
     */
    async placeOrder(items, requestId) {
        if (!this._remote) throw new Error('還沒有連上主機');
        // 先存起來：送出後才斷線時，不知道主機有沒有寫入，重連後以同一個 requestId 重送就能取回同一筆
        addPending(this.namespace, this.roomId, { requestId, items, createdAt: Date.now(), kind: this.pendingKind, credentialId: this.credentialId });
        this._syncPending();
        let outcome;
        try {
            outcome = await this._remote.request('order.place', { items, requestId });
        } catch (err) {
            if (err?.code === PEER_ERROR_CODES.HOST_UNAVAILABLE) {
                this._emit();
                throw new PosError(PEER_ERROR_CODES.PENDING, '已送出，正在等待主機確認；恢復連線後會自動以同一筆重送，不會重複建立訂單。');
            }
            removePending(this.namespace, this.roomId, this.pendingKind, requestId);
            this._syncPending();
            this._emit();
            throw err;
        }
        removePending(this.namespace, this.roomId, this.pendingKind, requestId);
        this._syncPending();
        this._acceptPlaced(outcome);
        this._emit();
        return outcome;
    }

    /** 直連失敗後使用者按下重試 */
    retry() {
        this._remote?.retry();
    }

    async dispose() {
        this._disposed = true;
        this._remote?.dispose();
        this._remote = null;
    }
}

export class RemotePosSession extends RemoteSessionBase {
    /**
     * @param {{ role: 'order' | 'kitchen' | 'display', hash?: string, onChange: (snapshot: object) => void, remoteOptions?: object }} options
     */
    constructor(options) {
        super(options);
        this.device = null;
        this.stored = null;
    }

    /** 廚房站台名稱，由主機核准時指定 */
    get stationId() {
        return this.device?.station ?? null;
    }

    async start() {
        if (!this.roomId || !this.sig) {
            this._setConnection({ phase: REMOTE_PHASE.MISSING });
            return;
        }
        this._syncPending();
        this.stored = loadStaffCredential(this.namespace, this.roomId);
        if (!this.stored) {
            this._setConnection({ phase: REMOTE_PHASE.UNPAIRED });
            return;
        }
        // 網址的信令和配對時不同：使用者確認前不送出授權（審查 S5）
        if (this.stored.sig !== this.sig) {
            this._setConnection({ phase: REMOTE_PHASE.SIG_MISMATCH, storedSig: this.stored.sig, urlSig: this.sig });
            return;
        }
        this._connect();
    }

    /**
     * 使用者確認網址的信令可信（例如店家重新啟動了 Quick Tunnel）：改記這個信令並連線。
     * 只在 SIG_MISMATCH 時有效。
     */
    trustUrlSignaling() {
        if (this.phase !== REMOTE_PHASE.SIG_MISMATCH || !this.stored) return;
        this.stored = { ...this.stored, sig: this.sig };
        saveStaffCredential(this.namespace, this.roomId, this.stored);
        this._setConnection({ phase: REMOTE_PHASE.CONNECTING });
        this._connect();
    }

    /** 不信任網址的信令：改用配對時的信令連線。只在 SIG_MISMATCH 時有效 */
    useStoredSignaling() {
        if (this.phase !== REMOTE_PHASE.SIG_MISMATCH || !this.stored?.sig) return;
        this.sig = this.stored.sig;
        this._setConnection({ phase: REMOTE_PHASE.CONNECTING });
        this._connect();
    }

    _authParams() {
        return { credentials: [this.stored.credential] };
    }

    async _afterAuth(result, run) {
        if (!result.device) {
            this._onRevoked({ credentialId: this.stored.credential.id });
            return;
        }
        this.device = result.device;
        if (result.device.role !== this.role) {
            this._setConnection({ phase: REMOTE_PHASE.WRONG_ROLE, actualRole: result.device.role });
            return;
        }
        if (this.role === 'order' && !(await this._loadMenu(run))) return;
        this._acceptTopics(result.topics, result.rev);
        this._setConnection({ phase: REMOTE_PHASE.READY, state: LINK_STATE.OPEN });
        if (this.role === 'order') await this._flushPending(run);
    }

    _onRevoked({ credentialId } = {}) {
        if (credentialId !== this.stored?.credential.id) return;
        clearStaffCredential(this.namespace, this.roomId);
        this._dropPending('這台裝置的授權已撤銷，請向管理端確認這筆是否已經送到廚房');
        this.device = null;
        this._setConnection({ phase: REMOTE_PHASE.REVOKED });
        this._remote?.dispose();
        this._remote = null;
    }

    /** 主機推送的快照換成第一代畫面用的形狀 */
    _applyTopics(topics = {}) {
        let next = this.snapshot;
        if (topics.kitchen) {
            // 第一代以「仍開著的站台」判斷能否接手；第二代由主機判斷，不能接手的站台都視為仍開著
            const activeStations = new Set(topics.kitchen.stations.filter((s) => !s.takeoverAllowed).map((s) => s.station));
            next = { ...next, orders: topics.kitchen.orders, activeStations };
        }
        if (topics.display) next = { ...next, orders: topics.display.orders };
        if (topics.order) next = { ...next, orders: topics.order.orders };
        if (next === this.snapshot) return;
        this.snapshot = { ...next, error: null };
        this._emit();
    }

    /**
     * @param {string} orderId
     * @param {string} action
     * @param {{ fromStation?: string }} [extra]
     */
    async act(orderId, action, extra = {}) {
        try {
            return await this._remote.request('order.act', { orderId, action, ...(extra.fromStation ? { fromStation: extra.fromStation } : {}) });
        } catch (err) {
            // 被拒絕（例如已由其他站台認領）時畫面可能是舊的：重讀後再回報
            await this.refresh();
            throw err;
        }
    }
}

/**
 * 顧客手機的桌邊點餐（協定規格 5.2）：網址帶桌號 `t`。本機有這張桌的入桌授權就直接驗證；
 * 沒有、或授權屬於已關閉的場次時，要輸入入桌碼。入桌授權綁定用餐場次，關桌後不能再送單，但仍看得到自己的訂單。
 */
export class RemoteTableSession extends RemoteSessionBase {
    constructor(options) {
        super(options);
        this.tableId = this.params.get('t') || null;
        /** 目前連線上通過驗證的入桌授權 { id, tableId, diningSessionId } */
        this.grant = null;
        this.stored = null;
        /** 這張桌目前是否開放（沒有授權時由 table.listOpen 得知） */
        this.tableOpen = null;
        this.tableName = this.tableId;
    }

    get stationId() {
        return null;
    }

    get pendingKind() {
        return 'table';
    }

    async start() {
        if (!this.roomId || !this.sig || !this.tableId) {
            this._setConnection({ phase: REMOTE_PHASE.MISSING });
            return;
        }
        this._syncPending();
        const stored = loadTableCredential(this.namespace, this.roomId);
        // 別張桌、或入桌時的信令和網址不同（審查 S5）：不自動送出，改輸入入桌碼
        this.stored = stored?.tableId === this.tableId && stored.sig === this.sig ? stored : null;
        this._connect();
    }

    _authParams() {
        return { credentials: this.stored ? [this.stored.credential] : [] };
    }

    async _afterAuth(result, run) {
        if (this.stored && !result.table) {
            // 授權無效（例如主機重新產生了房間）：刪掉，改輸入入桌碼
            clearTableCredential(this.namespace, this.roomId);
            this.stored = null;
            this._dropPending('入桌授權已失效，請向店員確認這筆是否已經送出');
        }
        this.grant = result.table;
        if (!this.grant) {
            await this._checkTableOpen(run);
            if (this._stale(run)) return;
            this.snapshot = { ...this.snapshot, orders: [] };
            this._setConnection({ phase: REMOTE_PHASE.NEED_CODE, state: LINK_STATE.OPEN });
            return;
        }
        if (!(await this._loadMenu(run))) return;
        this._acceptTopics(result.topics, result.rev);
        // 場次已關閉時也要重送：主機若已寫入，會取回原訂單（協定規格 5.4 先查去重鍵）
        await this._flushPending(run);
    }

    async _checkTableOpen(run) {
        try {
            const { tables } = await this._remote.request('table.listOpen');
            if (this._stale(run)) return;
            const table = tables.find((t) => t.id === this.tableId);
            this.tableOpen = Boolean(table);
            if (table) this.tableName = table.name;
        } catch {
            this.tableOpen = null;
        }
    }

    /**
     * 以入桌碼加入這張桌目前的場次。錯誤（CODE_INVALID、RATE_LIMITED）直接拋給畫面顯示。
     * @param {string} code
     */
    async join(code) {
        const run = ++this._authRun;
        const joined = await this._remote.request('table.join', { tableId: this.tableId, code: String(code ?? '').trim() });
        if (this._stale(run)) return;
        this.stored = { credential: joined.credential, tableId: joined.session.tableId, diningSessionId: joined.session.id, sig: this.sig };
        saveTableCredential(this.namespace, this.roomId, this.stored);
        this.grant = { id: joined.credential.id, tableId: joined.session.tableId, diningSessionId: joined.session.id };
        // 換了一份入桌授權：舊授權下等待確認的送單不改用它重送
        this._dropPending('送出這筆時用的入桌授權已經更換，請向店員確認這筆是否已經送出', { keep: this.credentialId });
        if (!(await this._loadMenu(run))) return;
        this._acceptTopics(joined.topics, joined.rev);
    }

    _onRevoked({ credentialId } = {}) {
        if (credentialId !== this.grant?.id) return;
        clearTableCredential(this.namespace, this.roomId);
        this._dropPending('入桌授權已失效，請向店員確認這筆是否已經送出');
        this.stored = null;
        this.grant = null;
        this.snapshot = { ...this.snapshot, orders: [] };
        this._setConnection({ phase: REMOTE_PHASE.NEED_CODE, state: LINK_STATE.OPEN });
    }

    _applyTopics(topics = {}) {
        if (topics.myOrders) this.snapshot = { ...this.snapshot, orders: topics.myOrders.orders, error: null };
        if (topics.session && this.grant) {
            const open = topics.session.status === 'open';
            this._setConnection({ phase: open ? REMOTE_PHASE.READY : REMOTE_PHASE.CLOSED, state: LINK_STATE.OPEN });
            return;
        }
        if (topics.myOrders) this._emit();
    }

    async placeOrder(items, requestId) {
        try {
            return await super.placeOrder(items, requestId);
        } catch (err) {
            if (err?.code === POS_V2_ERROR_CODES.SESSION_CLOSED) await this.refresh();
            throw err;
        }
    }

    async act() {
        throw new Error('顧客端不能變更訂單狀態');
    }
}
