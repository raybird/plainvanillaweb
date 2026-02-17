import { BaseService } from './base-service.js';
import { notificationService } from './notification-service.js';

export class ErrorService extends BaseService {
    constructor() {
        super();
        window.addEventListener('error', (e) => this.report(e.error));
        window.addEventListener('unhandledrejection', (e) => this.report(e.reason));
    }

    report(error) {
        console.error('[Global Error Recovery]:', error);
        // 透過通知服務告知使用者
        notificationService.error(`⚠️ 系統異常: ${error.message || '未知錯誤'}`);
        this.emit('error', { error });
    }
}
export const errorService = new ErrorService();
