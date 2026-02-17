import { BaseService } from './base-service.js';

/**
 * NetworkMonitor - 網路請求監控服務
 * 透過 Monkey Patching 攔截全域 fetch，記錄請求詳情。
 */
export class NetworkMonitor extends BaseService {
    constructor() {
        super();
        this._logs = [];
        this._originalFetch = window.fetch;
        this.isEnabled = false;
    }

    enable() {
        if (this.isEnabled) return;
        
        window.fetch = async (...args) => {
            const startTime = performance.now();
            let response;
            let error;
            
            // 解析請求資訊
            const url = args[0] instanceof Request ? args[0].url : args[0];
            const method = args[0] instanceof Request ? args[0].method : (args[1]?.method || 'GET');

            try {
                response = await this._originalFetch(...args);
                return response;
            } catch (err) {
                error = err;
                throw err;
            } finally {
                const duration = Math.round(performance.now() - startTime);
                const status = response ? response.status : (error ? 'Error' : 'Unknown');
                
                this._addLog({
                    id: Date.now(),
                    timestamp: new Date().toLocaleTimeString(),
                    method,
                    url,
                    status,
                    duration
                });
            }
        };
        
        this.isEnabled = true;
        console.log('[NetworkMonitor] Enabled');
    }

    disable() {
        if (!this.isEnabled) return;
        window.fetch = this._originalFetch;
        this.isEnabled = false;
        console.log('[NetworkMonitor] Disabled');
    }

    _addLog(log) {
        this._logs.unshift(log); // 最新在最前
        if (this._logs.length > 50) this._logs.pop(); // 限制保留 50 筆
        this.emit('log', { log, logs: this._logs });
    }

    get logs() {
        return this._logs;
    }

    clear() {
        this._logs = [];
        this.emit('clear');
    }
}

export const networkMonitor = new NetworkMonitor();
