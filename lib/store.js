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
                // 使用基類的 emit 方法
                this.emit('change', { key, value, state: target });
                return true;
            }
        });
    }
}

export const appStore = new Store({
    count: 0,
    theme: 'light',
    lastSearch: '',
    notifications: []
});
