import { BaseService } from './base-service.js';

/**
 * ConnectivityService - 原生連線性與網路資訊服務
 */
export class ConnectivityService extends BaseService {
    constructor() {
        super();
        this._isOnline = navigator.onLine;
        this._connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        
        window.addEventListener('online', () => this._handleStatusChange(true));
        window.addEventListener('offline', () => this._handleStatusChange(false));
        
        if (this._connection) {
            this._connection.addEventListener('change', () => this._handleNetworkChange());
        }
    }

    get isOnline() { return this._isOnline; }

    get networkInfo() {
        if (!this._connection) return null;
        const { effectiveType, downlink, rtt, saveData } = this._connection;
        return { effectiveType, downlink, rtt, saveData };
    }

    /**
     * 利用 Beacon API 發送可靠數據 (通常用於日誌或分析)
     * @param {string} url 
     * @param {object} data 
     */
    sendBeacon(url, data) {
        if (!navigator.sendBeacon) return false;
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        return navigator.sendBeacon(url, blob);
    }

    _handleStatusChange(online) {
        this._isOnline = online;
        this.emit('status-change', { online });
    }

    _handleNetworkChange() {
        this.emit('network-change', this.networkInfo);
    }
}

export const connectivityService = new ConnectivityService();
