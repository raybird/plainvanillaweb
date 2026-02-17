import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { appStore } from '../../lib/store.js';
import { computeService } from '../../lib/worker-service.js';
import { idbService } from '../../lib/idb-service.js';

export class Dashboard extends BaseComponent {
    constructor() {
        super();
        this.state = { workerStatus: '閒置' };
        this.onWorkerDone = this.onResult.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        computeService.addEventListener('done', this.onWorkerDone);
    }

    disconnectedCallback() {
        computeService.removeEventListener('done', this.onWorkerDone);
    }

    onResult(e) {
        this.state.workerStatus = `完成! 結果: ${e.detail.result}`;
        this.update();
    }

    render() {
        const lastSearch = appStore.state.lastSearch || '無';
        return html`
            <h1>技術整合 Dashboard</h1>
            <p>本頁面整合了專案中所有的原生技術模組。</p>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <!-- 狀態管理區 -->
                <section style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px;">
                    <h3>📡 Store (Sync)</h3>
                    <p>最後搜尋: <strong>${lastSearch}</strong></p>
                    <small>數據已持久化至 LocalStorage</small>
                </section>

                <!-- 大容量持久化區 -->
                <section style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px;">
                    <h3>💾 IndexedDB (Async)</h3>
                    <p>用於 API 快取與大型數據。</p>
                    <button onclick="this.closest('page-dashboard').clearCache()" style="background: #6c757d; color: white; border: none; padding: 0.5rem; border-radius: 4px; cursor: pointer;">
                        清除 API 快取
                    </button>
                </section>

                <!-- 高性能運算區 -->
                <section style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px;">
                    <h3>🧵 Web Worker</h3>
                    <p>狀態: ${this.state.workerStatus}</p>
                    <button onclick="this.closest('page-dashboard').startTask()">觸發背景運算</button>
                </section>

                <!-- 錯誤邊界測試區 -->
                <section style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px; border-color: #ffc107;">
                    <h3>⚠️ 穩定性測試</h3>
                    <button onclick="this.closest('page-dashboard').triggerError()" style="background: #dc3545; color: white; border: none; padding: 0.5rem; border-radius: 4px; cursor: pointer;">
                        模擬組件崩潰
                    </button>
                    <p><small>點擊後將觸發 Error Boundary 降級渲染</small></p>
                </section>
            </div>
        `;
    }

    async clearCache() {
        if (confirm('確定要清除所有 IndexedDB 快取嗎？')) {
            await idbService.clear();
            appStore.state.notifications = [...appStore.state.notifications, "IndexedDB 快取已清空！" ];
        }
    }

    startTask() {
        this.state.workerStatus = '運算中...';
        this.update();
        computeService.run('fibonacci', 35);
    }

    triggerError() {
        throw new Error("這是故意的模擬錯誤，用來展示 Error Boundary 的效果！");
    }
}
customElements.define('page-dashboard', Dashboard);
