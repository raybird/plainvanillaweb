/**
 * POS v2 店員裝置的工作階段（#16）：介面和第一代 `PosSession` 一致（建構參數、`snapshot`、`placeOrder`、
 * `act`、`refresh`、`stationId`、`namespace`、`nsOption`），讓點餐、廚房、叫號畫面直接重用第一代元件。
 *
 * 資料來源從本機 IndexedDB 換成主機：連上後以本機保存的裝置授權 `auth`，之後靠主機推送的完整快照更新畫面；
 * 寫入一律送 RPC，主機寫入成功才回覆。快照另外帶 `connection`，第二代畫面用它顯示連線與配對狀態。
 */
import { LINK_STATE } from './peer-link.js';
import { PEER_ERROR_CODES } from './pos-v2-rpc-client.js';
import {
    DEFAULT_NAMESPACE,
    LINK_STATE_LABEL,
    PosV2Remote,
    clearStaffCredential,
    loadStaffCredential,
    readRemoteParams,
    remoteSupported,
} from './pos-v2-remote.js';

/** 畫面要顯示的階段；只有 `ready` 時才顯示第一代的角色畫面 */
export const REMOTE_PHASE = Object.freeze({
    /** 網址沒有房間或信令 */
    MISSING: 'missing',
    /** 這台裝置在這個房間沒有授權 */
    UNPAIRED: 'unpaired',
    /** 授權被主機拒絕或撤銷 */
    REVOKED: 'revoked',
    /** 授權的角色和這個畫面不同 */
    WRONG_ROLE: 'wrong-role',
    CONNECTING: 'connecting',
    READY: 'ready',
});

export class RemotePosSession {
    static get supported() {
        return remoteSupported();
    }

    /**
     * @param {{ role: 'order' | 'kitchen' | 'display', hash?: string, onChange: (snapshot: object) => void, remoteOptions?: object }} options
     */
    constructor({ role, hash = location.hash, onChange, remoteOptions = {} }) {
        this.role = role;
        const { roomId, sig, namespace } = readRemoteParams(hash);
        this.roomId = roomId;
        this.sig = sig;
        this.namespace = namespace;
        this.device = null;
        this._onChange = onChange;
        this._remoteOptions = remoteOptions;
        this._remote = null;
        this._disposed = false;
        this._authRun = 0;
        this.snapshot = {
            products: [],
            orders: [],
            activeStations: new Set(),
            peers: [],
            online: false,
            error: null,
            connection: { phase: REMOTE_PHASE.CONNECTING, link: LINK_STATE.IDLE, label: LINK_STATE_LABEL[LINK_STATE.IDLE] },
        };
    }

    /** 廚房站台名稱，由主機核准時指定 */
    get stationId() {
        return this.device?.station ?? null;
    }

    get nsOption() {
        return this.namespace === DEFAULT_NAMESPACE ? undefined : this.namespace;
    }

    async start() {
        if (!this.roomId || !this.sig) {
            this._setConnection({ phase: REMOTE_PHASE.MISSING });
            return;
        }
        this.stored = loadStaffCredential(this.namespace, this.roomId);
        if (!this.stored) {
            this._setConnection({ phase: REMOTE_PHASE.UNPAIRED });
            return;
        }
        const remote = new PosV2Remote({ sig: this.sig, roomId: this.roomId, ...this._remoteOptions });
        this._remote = remote;
        remote.on('state', (detail) => {
            if (detail.state !== LINK_STATE.OPEN) this._setConnection({ phase: this._phaseWhileOffline(), ...detail });
        });
        remote.on('open', () => this._authenticate());
        remote.on('push', ({ topic, data }) => this._applyPush(topic, data));
        remote.on('gap', () => this.refresh());
        remote.start();
    }

    _phaseWhileOffline() {
        const phase = this.snapshot.connection.phase;
        return phase === REMOTE_PHASE.REVOKED || phase === REMOTE_PHASE.WRONG_ROLE ? phase : REMOTE_PHASE.CONNECTING;
    }

    /** 每次 DataChannel 開啟都重新驗證：主機重新整理或換分頁後，連線上的授權要重新建立 */
    async _authenticate() {
        const run = ++this._authRun;
        try {
            const result = await this._remote.request('auth', { credentials: [this.stored.credential] });
            if (this._disposed || run !== this._authRun) return;
            if (!result.device) {
                this._revoked();
                return;
            }
            this.device = result.device;
            if (result.device.role !== this.role) {
                this._setConnection({ phase: REMOTE_PHASE.WRONG_ROLE, actualRole: result.device.role });
                return;
            }
            if (this.role === 'order') {
                const { products } = await this._remote.request('menu.get');
                if (this._disposed || run !== this._authRun) return;
                this.snapshot = { ...this.snapshot, products };
            }
            this._applyTopics(result.topics);
            this._setConnection({ phase: REMOTE_PHASE.READY, state: LINK_STATE.OPEN });
        } catch (err) {
            if (this._disposed || run !== this._authRun) return;
            // 連線又斷了：等下一次 open 再驗證
            if (err?.code === PEER_ERROR_CODES.HOST_UNAVAILABLE) return;
            this.snapshot = { ...this.snapshot, error: err };
            this._emit();
        }
    }

    _revoked() {
        clearStaffCredential(this.namespace, this.roomId);
        this.device = null;
        this._setConnection({ phase: REMOTE_PHASE.REVOKED });
        this._remote?.dispose();
        this._remote = null;
    }

    _applyPush(topic, data) {
        if (topic === 'grant.revoked') {
            if (data?.credentialId === this.stored?.credential.id) this._revoked();
            return;
        }
        this._applyTopics({ [topic]: data });
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
        if (!this._remote?.isOpen || this.snapshot.connection.phase !== REMOTE_PHASE.READY) return;
        try {
            const { topics } = await this._remote.request('sync');
            this._applyTopics(topics);
        } catch {
            // 連線中斷時由重連後的 auth 補上
        }
    }

    /**
     * @param {Array<{ productId: string, qty: number }>} items
     * @param {string} requestId
     */
    async placeOrder(items, requestId) {
        const outcome = await this._remote.request('order.place', { items, requestId });
        // 推送稍後才到：先把回覆的訂單放進畫面，避免「取餐號碼」閃一下才出現
        if (!this.snapshot.orders.some((o) => o.id === outcome.order.id)) {
            this.snapshot = { ...this.snapshot, orders: [...this.snapshot.orders, outcome.order] };
            this._emit();
        }
        return outcome;
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
