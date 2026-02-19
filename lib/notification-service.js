import { BaseService } from './base-service.js';

/**
 * NotificationService - 全域通知服務
 * 負責通知的生命週期管理（添加、自動移除、類型管理）。
 */
export class NotificationService extends BaseService {
    constructor() {
        super();
        this._notifications = [];
        this._autoHideDuration = 3000;
    }

    /**
     * 發送通知
     * @param {string} message 
     * @param {string} type 'info' | 'success' | 'error' | 'warning'
     */
    notify(message, type = 'info') {
        // 防止重複通知 (尤其是在多分頁環境下)
        const isDuplicate = this._notifications.some(n => n.message === message && n.type === type);
        if (isDuplicate) return null;

        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        const notification = { id, message, type };
        
        this._notifications.push(notification);
        this.emit('add', { notification, list: this._notifications });

        // 自動移除
        setTimeout(() => {
            this.remove(id);
        }, this._autoHideDuration);

        return id;
    }

    /**
     * 移除特定通知
     * @param {string} id 
     */
    remove(id) {
        const index = this._notifications.findIndex(n => n.id === id);
        if (index !== -1) {
            const removed = this._notifications.splice(index, 1)[0];
            this.emit('remove', { id, removed, list: this._notifications });
        }
    }

    get list() {
        return [...this._notifications];
    }

    // 快捷方法
    success(msg) { return this.notify(msg, 'success'); }
    error(msg) { return this.notify(msg, 'error'); }
    warn(msg) { return this.notify(msg, 'warning'); }
    info(msg) { return this.notify(msg, 'info'); }
}

export const notificationService = new NotificationService();
