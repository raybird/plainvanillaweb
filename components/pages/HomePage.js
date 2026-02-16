import { html } from '../../lib/html.js';
import { appStore } from '../../lib/store.js';
import { BaseComponent } from '../../lib/base-component.js';

export class HomePage extends BaseComponent {
    constructor() {
        super();
        this.onStateChange = this.onStateChange.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        appStore.addEventListener('change', this.onStateChange);
    }

    disconnectedCallback() {
        appStore.removeEventListener('change', this.onStateChange);
    }

    onStateChange() {
        this.update();
    }

    render() {
        const lastSearch = appStore.state.lastSearch || '無';
        return html`
            <h1>Vanilla 首頁</h1>
            <p>這是純原生實作的範本。</p>
            <div style="padding: 1rem; background: var(--nav-bg); border-radius: 8px;">
                <strong>🔍 跨頁面狀態同步演示：</strong>
                <p>您最後一次搜尋的關鍵字是：<span style="color: var(--primary-color); font-weight: bold;">${lastSearch}</span></p>
            </div>
        `;
    }
}
customElements.define('page-home', HomePage);
