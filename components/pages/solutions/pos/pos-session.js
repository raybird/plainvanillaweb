/**
 * Multi-Window POS 視窗工作階段（#10）：把 IndexedDB 權威資料、跨視窗通知與節點探索接在一起。
 *
 * 同步模型：寫入只走 `PosRepository`（權威狀態），成功後以 MessageBus 發出 `pos:changed`；
 * 收到通知的視窗不相信訊息內容，一律重讀 IndexedDB。漏接訊息（背景凍結、重新整理、晚加入）
 * 也沒關係：開啟、回到前景與重新連線時都會重讀。
 *
 * 廚房站台以 Web Lock 宣告「這個站台還開著」：視窗關閉時瀏覽器自動釋放鎖，其他站台才能接手它的訂單。
 */
import { createMessageBus, createPeerDiscovery } from '../../../../lib/coordination.js';
import { createTeardown, detectFeatures, resetSolutionData, resolveNamespace, solutionStorageName } from '../solution-kit.js';
import { createPosRepository } from './pos-repository.js';
import { DEFAULT_MENU } from './pos-model.js';

export const POS_SLUG = 'pos';
export const POS_TOPIC_CHANGED = 'pos:changed';

/** 角色與路由；`hub` 是入口頁，不算角色視窗 */
export const POS_ROLES = Object.freeze({
    order: { path: '/solutions/pos/order', title: '點餐', icon: '🧾' },
    kitchen: { path: '/solutions/pos/kitchen', title: '廚房', icon: '🍳' },
    display: { path: '/solutions/pos/display', title: '顧客叫號', icon: '📣' },
    admin: { path: '/solutions/pos/admin', title: '管理統計', icon: '📊' },
});

/**
 * 能力偵測：IndexedDB 與 BroadcastChannel 是必要能力；Web Locks 與 Wake Lock 為選用
 * （沒有 Web Locks 時無法判斷站台是否已關閉，接手改由人工確認；沒有 Wake Lock 時叫號畫面不提供常亮）。
 */
export function detectPosFeatures() {
    return detectFeatures({
        indexedDB: () => typeof indexedDB !== 'undefined',
        broadcastChannel: () => typeof BroadcastChannel === 'function',
        webLocks: () => typeof navigator !== 'undefined' && !!navigator.locks?.query,
        wakeLock: () => typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    });
}

/** @returns {string} 例如 `K-3F9A` */
function randomStationId() {
    const bytes = crypto.getRandomValues(new Uint8Array(2));
    return `K-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * @typedef {object} PosSnapshot
 * @property {object[]} products
 * @property {object[]} orders
 * @property {Set<string> | null} activeStations 仍開著的廚房站台（依 Web Lock）；不支援 Web Locks 時為 null
 * @property {object[]} peers 目前在線的視窗（PeerDiscovery，含自己）
 * @property {boolean} online
 * @property {Error | null} error 最近一次讀取失敗的原因
 */

export class PosSession {
    /** 必要能力是否齊全 */
    static get supported() {
        const { supported } = detectPosFeatures();
        return supported.indexedDB && supported.broadcastChannel;
    }

    /**
     * @param {{ role: 'hub' | 'order' | 'kitchen' | 'display' | 'admin', hash?: string, onChange: (snapshot: PosSnapshot) => void }} options
     */
    constructor({ role, hash = location.hash, onChange }) {
        this.role = role;
        this.namespace = resolveNamespace(POS_SLUG, hash);
        this.dbName = solutionStorageName(this.namespace, 'orders');
        this.stationId = null;
        this._onChange = onChange;
        this._teardown = createTeardown();
        this._repo = createPosRepository({ dbName: this.dbName });
        this._teardown.add(() => this._repo.close());
        this._refreshing = null;
        this._dirty = false;
        this._disposed = false;
        /** @type {Set<ReturnType<typeof setTimeout>>} */
        this._timers = new Set();
        this._teardown.add(() => {
            for (const timer of this._timers) clearTimeout(timer);
            this._timers.clear();
        });
        /** @type {PosSnapshot} */
        this.snapshot = { products: [], orders: [], activeStations: null, peers: [], online: navigator.onLine, error: null };
    }

    /** 本視窗在 PeerDiscovery 中的節點 id */
    get nodeId() {
        return this._peers?.nodeId ?? null;
    }

    /** 預設 namespace 時不在網址帶 ns，網址保持乾淨 */
    get nsOption() {
        return this.namespace === `solution-${POS_SLUG}` ? undefined : this.namespace;
    }

    get stationLockPrefix() {
        return `${solutionStorageName(this.namespace, 'station')}:`;
    }

    async start() {
        this._bus = createMessageBus({ namespace: this.namespace });
        this._teardown.add(() => this._bus.dispose());
        this._teardown.add(this._bus.subscribe(POS_TOPIC_CHANGED, () => this.refresh()));

        if (this.role === 'kitchen') await this._claimStation();

        this._peers = createPeerDiscovery({
            bus: this._bus,
            meta: { role: this.role, station: this.stationId },
            heartbeatIntervalMs: 1000,
            peerTimeoutMs: 3500,
        });
        this._teardown.add(() => this._peers.dispose());
        for (const type of ['peer-join', 'peer-update']) {
            this._teardown.add(this._peers.on(type, () => this.refresh()));
        }
        // 視窗關閉時先在 pagehide 發出離開訊息，Web Lock 要等文件真正銷毀才釋放；
        // 收到離開當下重讀常常還看得到鎖，所以再延遲重讀幾次，讓「接手」按鈕確實出現。
        for (const type of ['peer-leave', 'peer-expire']) {
            this._teardown.add(this._peers.on(type, () => {
                this.refresh();
                for (const ms of [300, 1500, 5000]) this._refreshLater(ms);
            }));
        }
        this._peers.start();

        const onVisible = () => {
            if (document.visibilityState === 'visible') this.refresh();
        };
        const onNetwork = () => this.refresh();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onNetwork);
        window.addEventListener('offline', onNetwork);
        this._teardown.add(() => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', onNetwork);
            window.removeEventListener('offline', onNetwork);
        });
        await this.refresh();
    }

    /**
     * 廚房站台身分：存在 sessionStorage，重新整理後沿用同一個站台、保有自己認領的訂單。
     * 以 ifAvailable 取得站台鎖；取不到代表另一個視窗（例如「複製分頁」連 sessionStorage 一起複製）
     * 正在使用這個站台，改用新的站台 id。
     */
    async _claimStation() {
        const key = solutionStorageName(this.namespace, 'station');
        let stationId = sessionStorage.getItem(key) || randomStationId();
        if (!navigator.locks) {
            this.stationId = stationId;
            sessionStorage.setItem(key, stationId);
            return;
        }
        for (let attempt = 0; attempt < 5; attempt++) {
            const acquired = await new Promise((resolve) => {
                navigator.locks.request(`${this.stationLockPrefix}${stationId}`, { ifAvailable: true }, (lock) => {
                    if (!lock) {
                        resolve(false);
                        return undefined;
                    }
                    resolve(true);
                    // 持有到視窗關閉或 teardown 為止
                    return new Promise((release) => this._teardown.add(release));
                });
            });
            if (acquired) break;
            stationId = randomStationId();
        }
        this.stationId = stationId;
        sessionStorage.setItem(key, stationId);
    }

    /** @param {number} ms */
    _refreshLater(ms) {
        if (this._disposed) return;
        const timer = setTimeout(() => {
            this._timers.delete(timer);
            this.refresh();
        }, ms);
        this._timers.add(timer);
    }

    /** @returns {Promise<Set<string> | null>} */
    async _activeStations() {
        if (!navigator.locks?.query) return null;
        const { held = [] } = await navigator.locks.query();
        const prefix = this.stationLockPrefix;
        return new Set(held.filter((lock) => lock.name?.startsWith(prefix)).map((lock) => lock.name.slice(prefix.length)));
    }

    /**
     * 重讀權威狀態。讀取中又收到通知時，讀完再讀一次，確保最後一次通知之後的狀態一定會被看到。
     * @returns {Promise<void>}
     */
    refresh() {
        if (this._disposed) return Promise.resolve();
        if (this._refreshing) {
            this._dirty = true;
            return this._refreshing;
        }
        this._refreshing = (async () => {
            do {
                this._dirty = false;
                try {
                    const [products, orders, activeStations] = await Promise.all([
                        this._repo.listProducts(),
                        this._repo.listOrders(),
                        this._activeStations(),
                    ]);
                    this.snapshot = {
                        products,
                        orders,
                        activeStations,
                        peers: this._peers?.getPeers({ includeSelf: true }) ?? [],
                        online: navigator.onLine,
                        error: null,
                    };
                } catch (err) {
                    this.snapshot = { ...this.snapshot, online: navigator.onLine, error: err };
                }
                if (this._disposed) return;
                this._onChange(this.snapshot);
            } while (this._dirty && !this._disposed);
        })().finally(() => {
            this._refreshing = null;
        });
        return this._refreshing;
    }

    /** 寫入成功後通知其他視窗並重讀自己的畫面 */
    async _afterWrite(detail) {
        this._bus.publish(POS_TOPIC_CHANGED, detail);
        await this.refresh();
    }

    /**
     * @param {Array<{ productId: string, qty: number }>} items
     * @param {string} requestId
     */
    async placeOrder(items, requestId) {
        const outcome = await this._repo.placeOrder({ items, requestId, by: this.role });
        await this._afterWrite({ kind: 'order', orderId: outcome.order.id });
        return outcome;
    }

    /**
     * @param {string} orderId
     * @param {string} action
     * @param {{ fromStation?: string }} [extra]
     */
    async act(orderId, action, extra = {}) {
        const actor = this.role === 'kitchen' ? this.stationId : this.role;
        const outcome = await this._repo.transition(orderId, { action, actor, ...extra });
        if (outcome.result === 'applied') await this._afterWrite({ kind: action, orderId });
        else await this.refresh();
        return outcome;
    }

    /**
     * 產生幾張示範訂單（隨機品項），方便直接展示廚房與叫號畫面。
     * @param {number} count
     */
    async seedDemoOrders(count = 3) {
        for (let i = 0; i < count; i++) {
            const picks = [...DEFAULT_MENU].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
            await this._repo.placeOrder({
                items: picks.map((product) => ({ productId: product.id, qty: 1 + Math.floor(Math.random() * 2) })),
                requestId: `seed-${crypto.randomUUID()}`,
                by: 'seed',
            });
        }
        await this._afterWrite({ kind: 'seed' });
    }

    /**
     * 刪除這個 namespace 的 POS 資料庫。其他視窗的連線會因 versionchange 自動關閉，
     * 收到通知後重讀時重新開啟，新資料庫會自動寫回示範菜單。
     * @returns {Promise<{ databases: Record<string, string>, storageKeys: string[], errors: unknown[] }>}
     */
    async reset() {
        this._repo.close();
        const report = await resetSolutionData({ databases: [this.dbName] });
        await this._afterWrite({ kind: 'reset' });
        return report;
    }

    async dispose() {
        this._disposed = true;
        await this._teardown.run();
    }
}
