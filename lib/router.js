import { BaseService } from './base-service.js';

export class RouterService extends BaseService {
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
        this.emit('route-change', { path: this.currentPath });
    }
}
export const router = new RouterService();
