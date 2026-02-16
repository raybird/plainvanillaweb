export class RouterService extends EventTarget {
    constructor() {
        super();
        window.addEventListener('hashchange', () => this.handleHashChange());
    }

    get currentPath() {
        return window.location.hash.slice(1) || '/';
    }

    push(path) {
        window.location.hash = path;
    }

    handleHashChange() {
        this.dispatchEvent(new CustomEvent('route-change', { 
            detail: { path: this.currentPath } 
        }));
    }

    // 解析動態路徑範例: /repos/:id -> 正則表達式
    static pathToRegex(path) {
        return new RegExp("^" + path.replace(/\//g, "\\/").replace(/:\w+/g, "(.+)") + "$");
    }

    static getParams(match, path) {
        const values = match.slice(1);
        const keys = Array.from(path.matchAll(/:(\w+)/g)).map(result => result[1]);
        return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
    }
}
export const router = new RouterService();
