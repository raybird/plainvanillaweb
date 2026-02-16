export class Store extends EventTarget {
    constructor(initialState = {}, storageKey = 'app_state') {
        super();
        this.storageKey = storageKey;
        
        // 防禦性檢查：確保 localStorage 存在 (Node.js 環境可能不存在)
        let saved = null;
        if (typeof localStorage !== 'undefined') {
            saved = localStorage.getItem(this.storageKey);
        }
        
        const baseState = saved ? { ...initialState, ...JSON.parse(saved) } : initialState;

        this.state = new Proxy(baseState, {
            set: (target, key, value) => {
                target[key] = value;
                // 自動持久化 (同樣加入環境檢查)
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(this.storageKey, JSON.stringify(target));
                }
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
