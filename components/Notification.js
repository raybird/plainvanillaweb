import { html } from '../lib/html.js';
import { appStore } from '../lib/store.js';

export class NotificationArea extends HTMLElement {
    constructor() { super(); this.update = this.update.bind(this); }
    connectedCallback() { appStore.addEventListener('change', this.update); this.update(); }
    update() {
        const msgs = appStore.state.notifications || [];
        this.innerHTML = html`
            <div style="position: fixed; top: 1rem; right: 1rem; z-index: 9999;">
                ${msgs.map(m => html`
                    <div style="background: #333; color: white; padding: 0.8rem; margin-bottom: 0.5rem; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);">
                        ${m}
                    </div>
                `).join('')}
            </div>
        `;
        // 3秒後自動移除最舊的通知
        if (msgs.length > 0) {
            setTimeout(() => {
                const current = [...appStore.state.notifications];
                current.shift();
                appStore.state.notifications = current;
            }, 3000);
        }
    }
}
customElements.define('app-notification', NotificationArea);
