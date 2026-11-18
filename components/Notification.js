import { notificationService } from '../lib/notification-service.js';

/** 全域通知。保留 live region 與既有訊息，讓 AT 只朗讀新增項目。 */
export class NotificationArea extends HTMLElement {
    connectedCallback() {
        this.innerHTML = '<div class="app-toasts" role="status" aria-live="polite" aria-relevant="additions" aria-atomic="false"></div>';
        this._region = this.querySelector('.app-toasts');
        this._unsubscribeAdd = notificationService.on('add', ({ notification }) => this.addToast(notification));
        this._unsubscribeRemove = notificationService.on('remove', ({ id }) => {
            this._region.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
        });
        for (const notification of notificationService.list) this.addToast(notification);
    }

    disconnectedCallback() {
        this._unsubscribeAdd?.();
        this._unsubscribeRemove?.();
    }

    addToast({ id, type, message }) {
        const toast = document.createElement('div');
        toast.className = 'app-toast';
        toast.dataset.id = id;
        toast.dataset.type = type;
        toast.textContent = message;
        this._region.append(toast);
    }
}

customElements.define('app-notification', NotificationArea);
