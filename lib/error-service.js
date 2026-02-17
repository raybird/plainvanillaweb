import { BaseService } from './base-service.js';
import { appStore } from './store.js';

export class ErrorService extends BaseService {
    constructor() {
        super();
        window.addEventListener('error', (e) => this.report(e.error));
        window.addEventListener('unhandledrejection', (e) => this.report(e.reason));
    }

    report(error) {
        console.error('[Global Error Recovery]:', error);
        // 透過 Store 通知全域 UI (例如彈出 Notification)
        if (appStore) {
            appStore.state.notifications = [...appStore.state.notifications, `⚠️ 系統異常: ${error.message || '未知錯誤'}`];
        }
        this.emit('error', { error });
    }
}
export const errorService = new ErrorService();
