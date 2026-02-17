import { BaseService } from './base-service.js';

/**
 * ConnectivityService - 網路連線狀態服務
 * 監聽瀏覽器的 online/offline 事件，並提供即時狀態。
 */
export class ConnectivityService extends BaseService {
    constructor() {
        super();
        this._isOnline = navigator.onLine;
        
        window.addEventListener('online', () => this._updateStatus(true));
        window.addEventListener('offline', () => this._updateStatus(false));
    }

    _updateStatus(status) {
        this._isOnline = status;
        this.emit('change', { isOnline: this._isOnline });
        console.log(`[Connectivity] ${status ? 'Online' : 'Offline'}`);
    }

    get isOnline() {
        return this._isOnline;
    }
}

export const connectivityService = new ConnectivityService();
