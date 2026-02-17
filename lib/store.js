import { BaseService } from './base-service.js';
import { broadcastService } from './broadcast-service.js';

export class Store extends BaseService {
    constructor(initialState = {}, storageKey = 'app_state') {
        super();
        this.storageKey = storageKey;
        const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(this.storageKey) : null;
        const baseState = saved ? { ...initialState, ...JSON.parse(saved) } : initialState;
        this._baseState = baseState; // 保存底層引用

        this.state = new Proxy(baseState, {
            set: (target, key, value) => {
                const oldValue = target[key];
                if (oldValue === value) return true;

                target[key] = value;
                this._sync();
                
                // 發送事件
                this.emit('change', { key, value, state: target });
                
                // 廣播給其他分頁
                broadcastService.post('sync_state', { key, value });
                
                return true;
            }
        });

        // 監聽來自其他分頁的同步訊息
        broadcastService.addEventListener('message', (e) => {
            const { type, payload, sender } = e.detail;
            if (type === 'sync_state') {
                console.log(`[Store] Syncing from tab ${sender}:`, payload.key);
                baseState[payload.key] = payload.value;
                this.emit('change', { ...payload, state: baseState, remote: true, sender });
            }
        });
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
