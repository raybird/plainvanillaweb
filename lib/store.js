/**
 * Vanilla Store Pattern
 * 利用 Proxy 監聽狀態變更，並透過 EventTarget 發布事件。
 */
export class Store extends EventTarget {
    constructor(initialState = {}) {
        super();
        this.state = new Proxy(initialState, {
            set: (target, key, value) => {
                target[key] = value;
                // 發送自定義事件通知組件更新
                this.dispatchEvent(new CustomEvent('change', { 
                    detail: { key, value, state: target } 
                }));
                return true;
            }
        });
    }
}

// 導出一個全域單例供應用程式使用
export const appStore = new Store({
    count: 0,
    theme: 'light',
    lastSearch: ''
});
