import { BaseService } from './base-service.js';

/**
 * StorageService - 原生儲存管理服務
 * 利用 StorageManager API 監控空間配額與數據持久化。
 */
export class StorageService extends BaseService {
    constructor() {
        super();
        this.metrics = {
            usage: 0,
            quota: 0,
            percent: 0,
            persisted: false
        };
    }

    /**
     * 獲取儲存空間估算
     */
    async updateEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            this.metrics.usage = estimate.usage || 0;
            this.metrics.quota = estimate.quota || 0;
            this.metrics.percent = this.metrics.quota > 0 
                ? ((this.metrics.usage / this.metrics.quota) * 100).toFixed(2) 
                : 0;
        }
        
        if (navigator.storage && navigator.storage.persisted) {
            this.metrics.persisted = await navigator.storage.persisted();
        }

        this.emit('update', this.metrics);
        return this.metrics;
    }

    /**
     * 請求持久化儲存
     * 瀏覽器可能會彈出權限提示，或根據使用者互動記錄自動決定。
     */
    async requestPersistence() {
        if (navigator.storage && navigator.storage.persist) {
            const persisted = await navigator.storage.persist();
            this.metrics.persisted = persisted;
            this.emit('update', this.metrics);
            return persisted;
        }
        return false;
    }

    /**
     * 格式化位元組為可讀字串
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

export const storageService = new StorageService();
