import { html } from '../../lib/html.js';
import { appStore } from '../../lib/store.js';

export class HomePage extends HTMLElement {
    constructor() {
        super();
        this.update = this.update.bind(this);
    }
    connectedCallback() {
        appStore.addEventListener('change', this.update);
        this.update();
    }
    disconnectedCallback() {
        appStore.removeEventListener('change', this.update);
    }
    update() {
        const lastSearch = appStore.state.lastSearch || '無';
        this.innerHTML = html`
            <h1>Vanilla 首頁</h1>
            <p>這是純原生實作的範本。</p>
            <div style="padding: 1rem; background: #f4f4f4; border-radius: 8px;">
                <strong>🔍 跨頁面狀態同步演示：</strong>
                <p>您最後一次搜尋的關鍵字是：<span style="color: #007bff; font-weight: bold;">${lastSearch}</span></p>
                <small>(此數據由 Store 同步，您可以去搜尋分頁試試看)</small>
            </div>
        `;
    }
}
customElements.define('page-home', HomePage);
