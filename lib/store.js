export class Store extends EventTarget {
    constructor(initialState = {}, storageKey = 'app_state') {
        super();
        this.storageKey = storageKey;
        
        // 嘗試從 localStorage 恢復
        const saved = localStorage.getItem(this.storageKey);
        const baseState = saved ? { ...initialState, ...JSON.parse(saved) } : initialState;

        this.state = new Proxy(baseState, {
            set: (target, key, value) => {
                target[key] = value;
                // 自動持久化
                localStorage.setItem(this.storageKey, JSON.stringify(target));
                this.dispatchEvent(new CustomEvent('change', { detail: { key, value, state: target } }));
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
