import { BaseService } from './base-service.js';
import { broadcastService } from './broadcast-service.js';

/** 只有純物件與陣列需要深層監控；Date、Map 等無法 JSON 持久化，維持原樣 */
function isPlainContainer(value) {
    if (value === null || typeof value !== 'object') return false;
    if (Array.isArray(value)) return true;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

export class Store extends BaseService {
    constructor(initialState = {}, storageKey = 'app_state') {
        super();
        this.storageKey = storageKey;
        const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(this.storageKey) : null;
        const baseState = saved ? { ...initialState, ...JSON.parse(saved) } : initialState;
        this._baseState = baseState; // 保存底層引用（永遠是純物件，可直接 JSON 序列化與跨分頁傳送）

        // 頂層屬性 -> (底層物件 -> Proxy)：讓 state.a === state.a 成立，且同一物件掛在不同頂層屬性下時各自回報正確的 key
        this._proxies = new Map();
        // Proxy -> 底層物件：寫入時解包，確保底層永遠不含 Proxy
        this._raws = new WeakMap();
        this.state = this._wrap(baseState, null);

        // 監聽來自其他分頁的同步訊息
        broadcastService.addEventListener('message', (e) => {
            const { type, payload, sender } = e.detail;
            if (type === 'sync_state') {
                console.log(`[Store] Syncing from tab ${sender}:`, payload.key);
                baseState[payload.key] = payload.value;
                this.emit('change', { ...payload, state: baseState, remote: true, sender });
            } else if (type === 'sync_snapshot') {
                console.log(`[Store] Applying snapshot from tab ${sender}`);
                Object.assign(baseState, payload);
                this.emit('change', { state: baseState, isSnapshot: true, remote: true, sender });
            }
        });
    }

    /**
     * 以 Proxy 包裝狀態物件。巢狀的純物件與陣列在讀取時才延遲包裝，
     * 任何層級的寫入都會以頂層屬性為單位持久化、發送事件與廣播。
     * @private
     * @param {object} target 底層純物件
     * @param {string|null} rootKey 所屬的頂層屬性名稱；null 表示 target 就是頂層狀態
     */
    _wrap(target, rootKey) {
        if (!this._proxies.has(rootKey)) this._proxies.set(rootKey, new WeakMap());
        const cache = this._proxies.get(rootKey);
        const cached = cache.get(target);
        if (cached) return cached;

        const proxy = new Proxy(target, {
            get: (t, key) => {
                const value = t[key];
                return isPlainContainer(value) ? this._wrap(value, rootKey ?? key) : value;
            },
            set: (t, key, value) => {
                const raw = this._raws.get(value) ?? value;
                if (t[key] === raw) return true;
                t[key] = raw;
                this._commit(rootKey ?? key);
                return true;
            },
            deleteProperty: (t, key) => {
                if (!(key in t)) return true;
                delete t[key];
                this._commit(rootKey ?? key);
                return true;
            }
        });

        cache.set(target, proxy);
        this._raws.set(proxy, target);
        return proxy;
    }

    /**
     * 頂層屬性（含其巢狀內容）變更後：持久化、發送事件、廣播給其他分頁
     * @private
     */
    _commit(key) {
        const value = this._baseState[key];
        this._sync();
        this.emit('change', { key, value, state: this._baseState });
        broadcastService.post('sync_state', { key, value });
    }

    _sync() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(this.storageKey, JSON.stringify(this._baseState));
        }
    }

    /**
     * 應用狀態快照 (Undo/Redo)
     * @param {object} snapshot 
     */
    applySnapshot(snapshot) {
        // 直接更新底層對象
        Object.assign(this._baseState, snapshot);
        this._sync();
        
        // 發送一個特殊事件通知所有組件
        this.emit('change', { state: this._baseState, isSnapshot: true });
        
        // 也廣播給其他分頁
        broadcastService.post('sync_snapshot', snapshot);
    }

    // 快取相關方法
    setCache(key, data, ttlMinutes = 5) {
        const entry = {
            data,
            expiry: Date.now() + (ttlMinutes * 60 * 1000)
        };
        localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
    }

    getCache(key) {
        const raw = localStorage.getItem(`cache_${key}`);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (Date.now() > entry.expiry) {
            localStorage.removeItem(`cache_${key}`);
            return null;
        }
        return entry.data;
    }
}

export const appStore = new Store({
    count: 0,
    theme: 'system', // 預設跟隨系統
    primaryColor: '#007bff', // 預設藍色
    lastSearch: '',
    userProfile: {
        name: 'Raybird', // 預設使用者名稱
        bio: 'Vanilla Web Enthusiast | TeleNexus User',
        avatar: 'assets/images/user-profile.jpg'
    }
});
