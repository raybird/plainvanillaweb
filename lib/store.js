import { BaseService } from './base-service.js';

export class Store extends BaseService {
    constructor(initialState = {}, storageKey = 'app_state') {
        super();
        this.storageKey = storageKey;
        const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(this.storageKey) : null;
        const baseState = saved ? { ...initialState, ...JSON.parse(saved) } : initialState;

        this.state = new Proxy(baseState, {
            set: (target, key, value) => {
                target[key] = value;
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(this.storageKey, JSON.stringify(target));
                }
                this.emit('change', { key, value, state: target });
                return true;
            }
        });
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
    theme: 'light',
    lastSearch: '',
    notifications: [],
    userProfile: {
        name: 'Raybird', // 預設使用者名稱
        bio: 'Vanilla Web Enthusiast | TeleNexus User',
        avatar: 'assets/images/user-profile.jpg'
    }
});
