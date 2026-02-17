import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { appStore } from '../../lib/store.js';
import { computeService } from '../../lib/worker-service.js';
import { idbService } from '../../lib/idb-service.js';

export class Dashboard extends BaseComponent {
    constructor() {
        super();
        this.state = {
            workerStatus: '閒置',
            idbCount: 0,
            lastUpdate: new Date().toLocaleTimeString(),
            showState: false, // 控制狀態檢視器展開
            memoryUsage: 'N/A'
        };
        this.onWorkerDone = this.onResult.bind(this);
        this.onStoreChange = this.updateStateView.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        computeService.addEventListener('done', this.onWorkerDone);
        appStore.addEventListener('change', this.onStoreChange);
        this.refreshStats();

        // 定期刷新記憶體使用量 (僅 Chrome/Chromium 支援)
        this.statsInterval = setInterval(() => {
            if (performance && performance.memory) {
                const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                this.state.memoryUsage = `${used} MB`;
                this.update();
            }
        }, 2000);
    }

    disconnectedCallback() {
        computeService.removeEventListener('done', this.onWorkerDone);
        appStore.removeEventListener('change', this.onStoreChange);
        clearInterval(this.statsInterval);
    }

    async refreshStats() {
        const stats = await idbService.getStats();
        this.state.idbCount = stats.count;
        this.state.lastUpdate = new Date().toLocaleTimeString();
        this.update();
    }

    onResult(e) {
        this.state.workerStatus = `完成! 結果: ${e.detail.result} (耗時: ${e.detail.duration || '未知'}ms)`;
        this.update();
    }

    updateStateView() {
        // 當 Store 變更時，若檢視器開啟則刷新
        if (this.state.showState) this.update();
    }

    toggleStateView() {
        this.state.showState = !this.state.showState;
        this.update();
    }

    render() {
        const lastSearch = appStore.state.lastSearch || '無';
        const stateJson = JSON.stringify(appStore.state, null, 2);

        return html`
            <style>
                .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
                .card { background: var(--bg-color); border: 1px solid #ddd; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .metric { font-size: 2rem; font-weight: bold; color: var(--primary-color); }
                .label { color: #666; font-size: 0.9rem; }
                pre { background: #f4f4f4; padding: 1rem; border-radius: 8px; overflow-x: auto; max-height: 300px; font-size: 0.85rem; }
                [data-theme="dark"] pre { background: #2d2d2d; color: #e0e0e0; }
                .btn-group { display: flex; gap: 0.5rem; margin-top: 1rem; }
                button { cursor: pointer; padding: 0.5rem 1rem; border: none; border-radius: 6px; font-weight: 500; transition: opacity 0.2s; }
                button:hover { opacity: 0.9; }
                .btn-primary { background: var(--primary-color); color: white; }
                .btn-danger { background: #dc3545; color: white; }
                .btn-secondary { background: #6c757d; color: white; }
            </style>

            <h1>🎛️ 開發者控制台 (Dev Dashboard)</h1>
            <p>即時監控與除錯中心。最後更新：${this.state.lastUpdate}</p>

            <div class="dashboard-grid">
                <!-- 系統指標 -->
                <div class="card">
                    <h3>📊 系統指標</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <div class="metric">${this.state.idbCount}</div>
                            <div class="label">快取項目 (IndexedDB)</div>
                        </div>
                        <div>
                            <div class="metric">${this.state.memoryUsage}</div>
                            <div class="label">JS Heap 使用量</div>
                        </div>
                    </div>
                    <div class="btn-group">
                         <button class="btn-secondary" onclick="this.closest('page-dashboard').refreshStats()">🔄 刷新數據</button>
                         <button class="btn-danger" onclick="this.closest('page-dashboard').clearCache()">🗑️ 清空快取</button>
                    </div>
                </div>

                <!-- 運算狀態 -->
                <div class="card">
                    <h3>⚡ 運算核心 (Web Worker)</h3>
                    <p>狀態: <strong>${this.state.workerStatus}</strong></p>
                    <div class="btn-group">
                        <button class="btn-primary" onclick="this.closest('page-dashboard').startTask(10)">輕量運算 (Fib 10)</button>
                        <button class="btn-primary" onclick="this.closest('page-dashboard').startTask(35)">重型運算 (Fib 35)</button>
                    </div>
                </div>

                <!-- 狀態檢視器 -->
                <div class="card" style="grid-column: 1 / -1;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3>🧬 全域狀態 (App Store)</h3>
                        <button class="btn-secondary" onclick="this.closest('page-dashboard').toggleStateView()">
                            ${this.state.showState ? '隱藏詳細' : '展開詳細'}
                        </button>
                    </div>
                    <p>最後搜尋: <strong>${lastSearch}</strong></p>
                    ${this.state.showState ? html`<pre>${stateJson}</pre>` : ''}
                </div>

                 <!-- 錯誤測試 -->
                 <div class="card" style="border-color: #ffc107;">
                    <h3>🐞 穩定性測試 (Error Boundary)</h3>
                    <p>測試組件在崩潰時的恢復能力。</p>
                    <button class="btn-danger" onclick="this.closest('page-dashboard').triggerError()">
                        💥 觸發組件崩潰
                    </button>
                </div>
            </div>
        `;
    }

    async clearCache() {
        if (confirm('確定要清除所有 IndexedDB 快取嗎？')) {
            await idbService.clear();
            await this.refreshStats();
            appStore.state.notifications = [...appStore.state.notifications, "IndexedDB 快取已清空！" ];
        }
    }

    startTask(n) {
        this.state.workerStatus = `運算中 (Fib ${n})...`;
        this.update();
        const start = performance.now();
        // 傳遞時間戳記以便計算耗時
        computeService.run('fibonacci', n);
        
        // 暫時 hack: 在這裡監聽一次性完成事件來計算時間，或者依賴 worker 回傳
        // 為了簡單起見，我們假設 worker 回傳時不包含時間，這裡只是 UI 顯示
    }

    triggerError() {
        throw new Error("這是故意的模擬錯誤，用來展示 Error Boundary 的效果！");
    }
}
customElements.define('page-dashboard', Dashboard);
