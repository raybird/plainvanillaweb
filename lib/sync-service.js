import { BaseService } from './base-service.js';
import { idbService } from './idb-service.js';
import { connectivityService } from './connectivity-service.js';
import { notificationService } from './notification-service.js';

/**
 * SyncService - 離線數據同步服務
 * 負責將離線時的操作存入佇列，並在連線恢復後自動執行。
 */
export class SyncService extends BaseService {
    constructor() {
        super();
        this._isProcessing = false;
        
        // 監聽連線狀態變更
        connectivityService.addEventListener('change', (e) => {
            if (e.detail.isOnline) {
                this.processQueue();
            }
        });
    }

    /**
     * 將動作加入同步佇列
     * @param {string} type 動作類型
     * @param {object} payload 動作數據
     */
    async queueAction(type, payload) {
        await idbService.put(idbService.stores.QUEUE, {
            type,
            payload,
            createdAt: Date.now()
        });
        
        this.emit('action-queued', { type, payload });

        if (!connectivityService.isOnline) {
            notificationService.info('目前處於離線狀態，您的變更已儲存在本地，將在連線後自動同步。');
        } else {
            this.processQueue();
        }
    }

    /**
     * 處理同步佇列
     */
    async processQueue() {
        if (this._isProcessing || !connectivityService.isOnline) return;
        
        const queue = await idbService.getAll(idbService.stores.QUEUE);
        if (queue.length === 0) return;

        this._isProcessing = true;
        console.log(`[SyncService] 開始同步 ${queue.length} 項離線操作...`);

        for (const action of queue) {
            try {
                // 這裡模擬執行 API 同步請求
                // 在實際應用中，會根據 action.type 呼叫不同的 API
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // 同步成功後從資料庫移除
                await idbService.delete(idbService.stores.QUEUE, action.id);
                this.emit('action-synced', action);
            } catch (err) {
                console.error('[SyncService] 同步失敗:', action, err);
                // 失敗時保留在佇列中，待下次重試
            }
        }

        this._isProcessing = false;
        if (queue.length > 0) {
            notificationService.success(`成功同步 ${queue.length} 項離線變更！`);
        }
    }
}

export const syncService = new SyncService();
