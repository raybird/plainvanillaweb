import { BaseService } from './base-service.js';
import { notificationService } from './notification-service.js';

export class ErrorService extends BaseService {
    constructor() {
        super();
        window.addEventListener('error', (e) => this.report(e.error));
        window.addEventListener('unhandledrejection', (e) => this.report(e.reason));
    }

    report(error) {
        // 過濾動畫被跳過 (AbortError / Transition was skipped) 等非代碼錯誤
        if (error) {
            const name = error.name || '';
            const msg = error.message || '';
            const isAbortError = name === 'AbortError' || msg === 'AbortError';
            const isTransitionSkipped = typeof msg === 'string' && msg.includes('Transition was skipped');
            
            if (isAbortError || isTransitionSkipped) {
                // 靜默忽略非關鍵性的瀏覽器警告，不污染控制台
                return;
            }
        }

        console.error('[Global Error Recovery]:', error);
        // 透過通知服務告知使用者
        notificationService.error(`⚠️ 系統異常: ${error ? (error.message || '未知錯誤') : '未知錯誤'}`);
        this.emit('error', { error });
    }
}
export const errorService = new ErrorService();
