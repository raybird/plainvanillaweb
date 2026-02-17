import { html } from '../lib/html.js';
import { notificationService } from '../lib/notification-service.js';

/**
 * NotificationArea 組件
 * 負責渲染由 notificationService 管理的全域通知。
 */
export class NotificationArea extends HTMLElement {
    constructor() {
        super();
        this.update = this.update.bind(this);
    }

    connectedCallback() {
        notificationService.addEventListener('add', this.update);
        notificationService.addEventListener('remove', this.update);
        this.update();
    }

    disconnectedCallback() {
        notificationService.removeEventListener('add', this.update);
        notificationService.removeEventListener('remove', this.update);
    }

    update() {
        const list = notificationService.list;
        
        const typeColors = {
            info: '#333',
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107'
        };

        this.innerHTML = html`
            <div style="position: fixed; top: 1rem; right: 1rem; z-index: 9999; display: flex; flex-direction: column; align-items: flex-end;">
                ${list.map(n => html`
                    <div style="background: ${typeColors[n.type] || '#333'}; color: white; padding: 0.8rem 1.2rem; margin-bottom: 0.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 200px; animation: slideIn 0.3s ease-out; transition: all 0.3s;">
                        ${n.message}
                    </div>
                `)}
            </div>
            <style>
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
        `;
    }
}
customElements.define('app-notification', NotificationArea);
