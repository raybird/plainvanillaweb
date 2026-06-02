import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { appStore } from '../../lib/store.js';
import { computeService } from '../../lib/worker-service.js';
import { idbService } from '../../lib/idb-service.js';
import { networkMonitor } from '../../lib/network-monitor.js';
import { performanceService } from '../../lib/performance-service.js';
import { notificationService } from '../../lib/notification-service.js';
import { broadcastService } from '../../lib/broadcast-service.js';
import { modalService } from '../../lib/modal-service.js';
import { syncService } from '../../lib/sync-service.js';
import { historyService } from '../../lib/history-service.js';
import { storageService } from '../../lib/storage-service.js'; // 引入儲存服務
import '../ui/NativeChart.js';

export class Dashboard extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            workerStatus: '閒置',
            idbCount: 0,
            lastUpdate: new Date().toLocaleTimeString(),
            showState: false,
            memoryUsage: 'N/A',
            networkLogs: [],
            perfMetrics: performanceService.summary,
            lastSyncTab: '無',
            syncCount: 0,
            thisTabId: broadcastService.tabId,
            syncQueueCount: 0,
            canUndo: false,
            canRedo: false,
            storageMetrics: { usage: 0, quota: 0, percent: 0, persisted: false },
            liveData: [10, 20, 15, 30, 25, 40, 35, 50, 45, 60] // 新增：圖表即時數據
        });
        this.onWorkerDone = this.onResult.bind(this);
        this.onStoreChange = this.onStoreUpdate.bind(this);
        this.onNetworkLog = this.updateNetworkLogs.bind(this);
        this.onPerfUpdate = this.updatePerfMetrics.bind(this);
        this.onSyncUpdate = () => this.updateQueueCount();
        this.onHistoryChange = (e) => {
            this.state.canUndo = e.detail.canUndo;
            this.state.canRedo = e.detail.canRedo;
        };
        this.onStorageUpdate = (m) => {
            this.state.storageMetrics = m;
        };
    }

    connectedCallback() {
        super.connectedCallback();
        computeService.addEventListener('done', this.onWorkerDone);
        appStore.addEventListener('change', this.onStoreChange);
        networkMonitor.addEventListener('log', this.onNetworkLog);
        networkMonitor.addEventListener('clear', this.onNetworkLog);
        performanceService.addEventListener('metric-update', this.onPerfUpdate);
        syncService.addEventListener('action-queued', this.onSyncUpdate);
        syncService.addEventListener('action-synced', this.onSyncUpdate);
        historyService.addEventListener('change', this.onHistoryChange);
        storageService.addEventListener('update', (e) => this.onStorageUpdate(e.detail));

        this.state.networkLogs = networkMonitor.logs;
        this.state.perfMetrics = performanceService.summary;
        this.state.canUndo = historyService.canUndo;
        this.state.canRedo = historyService.canRedo;

        this.refreshStats();
        this.updateQueueCount();
        storageService.updateEstimate();

        this.statsInterval = setInterval(() => {
            if (performance && performance.memory) {
                const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                this.state.memoryUsage = `${used} MB`;
            }

            // 更新即時圖表數據 (平滑捲動模擬)
            const newData = [...this.state.liveData.slice(1), Math.floor(Math.random() * 50) + 20];
            this.state.liveData = newData;
        }, 2000);
    }

    disconnectedCallback() {
        computeService.removeEventListener('done', this.onWorkerDone);
        appStore.removeEventListener('change', this.onStoreChange);
        networkMonitor.removeEventListener('log', this.onNetworkLog);
        networkMonitor.removeEventListener('clear', this.onNetworkLog);
        performanceService.removeEventListener('metric-update', this.onPerfUpdate);
        syncService.removeEventListener('action-queued', this.onSyncUpdate);
        syncService.removeEventListener('action-synced', this.onSyncUpdate);
        historyService.removeEventListener('change', this.onHistoryChange);
        clearInterval(this.statsInterval);
    }

    async updateQueueCount() {
        const queue = await idbService.getAll(idbService.stores.QUEUE);
        this.state.syncQueueCount = queue.length;
    }

    onStoreUpdate(e) {
        if (!e.detail.isSnapshot && !e.detail.remote) {
            historyService.push(appStore._baseState);
        }

        if (e.detail.remote) {
            this.state.lastSyncTab = e.detail.sender;
            this.state.syncCount++;
            notificationService.info(`已從分頁 ${e.detail.sender} 同步數據`);
        }
        if (this.state.showState) this.update();
    }

    updatePerfMetrics() {
        this.state.perfMetrics = performanceService.summary;
    }

    updateNetworkLogs() {
        this.state.networkLogs = networkMonitor.logs;
    }

    async refreshStats() {
        const stats = await idbService.getStats();
        this.state.idbCount = stats.count;
        this.state.lastUpdate = new Date().toLocaleTimeString();
        await storageService.updateEstimate();
    }

    async requestStoragePersistence() {
        const success = await storageService.requestPersistence();
        if (success) {
            notificationService.success("持久化儲存已啟用！數據將不再被自動清理。");
        } else {
            notificationService.warn("無法取得持久化權限。這可能取決於瀏覽器策略。");
        }
    }

    onResult(e) {
        this.state.workerStatus = `完成! 結果: ${e.detail.result} (耗時: ${e.detail.duration || '未知'}ms)`;
    }

    toggleStateView() {
        this.state.showState = !this.state.showState;
    }

    clearLogs() {
        networkMonitor.clear();
    }

    handleUndo() {
        const snapshot = historyService.undo(appStore._baseState);
        if (snapshot) appStore.applySnapshot(snapshot);
    }

    handleRedo() {
        const snapshot = historyService.redo(appStore._baseState);
        if (snapshot) appStore.applySnapshot(snapshot);
    }

    render() {
        const lastSearch = appStore.state.lastSearch || '無';
        const stateJson = JSON.stringify(appStore.state, null, 2);
        const { perfMetrics, lastSyncTab, syncCount, thisTabId, syncQueueCount, canUndo, canRedo, storageMetrics } = this.state;

        const logsHtml = this.state.networkLogs.map(log => {
            const statusColor = log.status >= 400 || log.status === 'Error' ? 'red' : 'green';
            return html`
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">${log.timestamp}</td>
                    <td style="padding: 0.5rem; font-weight: bold;">${log.method}</td>
                    <td style="padding: 0.5rem; color: ${statusColor}; font-weight: bold;">${log.status}</td>
                    <td style="padding: 0.5rem; color: var(--text-muted);">${log.duration}ms</td>
                    <td style="padding: 0.5rem; word-break: break-all; font-family: monospace; font-size: 0.8rem;">${log.url}</td>
                </tr>
            `;
        });

        return html`
            <style>
                .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
                .card { background: var(--card-bg); border: 1px solid var(--card-border); padding: 1.5rem; border-radius: 12px; box-shadow: var(--card-shadow); }
                .metric { font-size: 2rem; font-weight: bold; color: var(--primary-color); }
                .label { color: var(--text-muted); font-size: 0.9rem; }
                .perf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
                .perf-item { border-bottom: 1px solid var(--border-color); padding: 0.25rem 0; font-size: 0.85rem; }
                pre { background: var(--surface-color); padding: 1rem; border-radius: 8px; overflow-x: auto; max-height: 300px; font-size: 0.85rem; border: 1px solid var(--border-color); color: var(--text-color); }
                .btn-group { display: flex; gap: 0.5rem; margin-top: 1rem; }
                button { cursor: pointer; padding: 0.5rem 1rem; border: none; border-radius: 6px; font-weight: 500; transition: opacity 0.2s; }
                button:hover:not(:disabled) { opacity: 0.9; }
                button:disabled { opacity: 0.4; cursor: not-allowed; }
                .btn-primary { background: var(--primary-color); color: white; }
                .btn-danger { background: #dc2626; color: white; }
                .btn-secondary { background: #334155; color: white; }
                table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
                th { text-align: left; padding: 0.5rem; border-bottom: 2px solid var(--border-color); font-size: 0.9rem; color: var(--text-muted); }
                .progress-bar { height: 8px; background: var(--surface-color); border-radius: 4px; margin-top: 0.5rem; overflow: hidden; border: 1px solid var(--border-color); }
                .progress-fill { height: 100%; background: var(--primary-color); transition: width 0.3s; }
            </style>

            <h1>🎛️ 開發者控制台 (Dev Dashboard)</h1>
            <p>即時監控與除錯中心。最後更新：${this.state.lastUpdate}</p>

            <div class="dashboard-grid">
                <!-- 儲存管理 -->
                <div class="card" style="border-left: 5px solid #28a745;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h3>💾 儲存配額 (Storage)</h3>
                        <span style="font-size:0.7rem; padding:2px 6px; border-radius:4px; background:${storageMetrics.persisted ? '#dcfce7' : '#fef9c3'}; color:${storageMetrics.persisted ? '#166534' : '#854d0e'}; border:1px solid ${storageMetrics.persisted ? '#86efac' : '#fcd34d'};">
                            ${storageMetrics.persisted ? '🛡️ 已持久化' : '⚠️ 暫時性'}
                        </span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <div class="metric" style="color: #28a745; font-size: 1.5rem;">${storageService.formatBytes(storageMetrics.usage)}</div>
                            <div class="label">已使用空間</div>
                        </div>
                        <div>
                            <div class="metric" style="color: var(--text-muted); font-size: 1.5rem;">${storageMetrics.percent}%</div>
                            <div class="label">佔配額比例</div>
                        </div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${storageMetrics.percent}%"></div>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-secondary" style="flex:1; font-size:0.8rem;" ${storageMetrics.persisted ? 'disabled' : ''}
                                onclick="this.closest('page-dashboard').requestStoragePersistence()">請求持久化</button>
                    </div>
                </div>

                <!-- 離線同步資訊 -->
                <div class="card" style="border-left: 5px solid #ffc107;">
                    <h3>☁️ 離線同步 (Action Queue)</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <div class="metric" style="color: #ffc107; font-size: 1.5rem;">${syncQueueCount}</div>
                            <div class="label">待同步項目</div>
                        </div>
                        <div style="display:flex; align-items:center;">
                            <button class="btn btn-secondary" style="font-size:0.8rem; padding:0.4rem 0.8rem;" 
                                    onclick="import('./lib/sync-service.js').then(m => m.syncService.processQueue())">立即同步</button>
                        </div>
                    </div>
                </div>

                <!-- 分頁同步資訊 -->
                <div class="card" style="border-left: 5px solid var(--primary-color);">
                    <h3>🔗 跨分頁同步 (Multi-tab)</h3>
                    <p>當前分頁 ID: <code style="color:var(--primary-color)">${thisTabId}</code></p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                        <div>
                            <div class="metric" style="font-size:1.5rem">${syncCount}</div>
                            <div class="label">同步次數</div>
                        </div>
                        <div>
                            <div class="metric" style="font-size:1.5rem; overflow:hidden; text-overflow:ellipsis">${lastSyncTab}</div>
                            <div class="label">最後來源</div>
                        </div>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-secondary" style="flex:1;" ${!canUndo ? 'disabled' : ''} onclick="this.closest('page-dashboard').handleUndo()">↩️ 復原</button>
                        <button class="btn btn-secondary" style="flex:1;" ${!canRedo ? 'disabled' : ''} onclick="this.closest('page-dashboard').handleRedo()">↪️ 重做</button>
                    </div>
                </div>

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

                <!-- 性能監控 -->
                <div class="card">
                    <h3>🚀 性能核心 (Web Vitals)</h3>
                    <div class="perf-grid">
                        <div class="perf-item"><strong>LCP:</strong> ${perfMetrics.lcp}ms</div>
                        <div class="perf-item"><strong>FID:</strong> ${perfMetrics.fid}ms</div>
                        <div class="perf-item"><strong>CLS:</strong> ${perfMetrics.cls.toFixed(3)}</div>
                        <div class="perf-item"><strong>Load:</strong> ${perfMetrics.loadTime}ms</div>
                    </div>
                </div>

                <!-- 即時監控圖表 (SVG) -->
                <div class="card" style="grid-column: span 2;">
                    <x-chart title="即時監控趨勢 (SVG Reactive)" 
                             data="${JSON.stringify(this.state.liveData)}">
                        <div slot="controls">
                            <span class="status-badge success">LIVE</span>
                        </div>
                    </x-chart>
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

                <!-- 網路監控 -->
                <div class="card" style="grid-column: 1 / -1;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3>🌐 網路請求 (Network Monitor)</h3>
                        <button class="btn-secondary" onclick="this.closest('page-dashboard').clearLogs()">🗑️ 清除日誌</button>
                    </div>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${this.state.networkLogs.length === 0 ? '<p style="color:var(--text-muted); padding:1rem;">尚無網路請求紀錄。</p>' : html`
                            <table>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Method</th>
                                        <th>Status</th>
                                        <th>Duration</th>
                                        <th>URL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${logsHtml}
                                </tbody>
                            </table>
                        `}
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
                    <div class="btn-group">
                        <button class="btn-danger" onclick="this.closest('page-dashboard').triggerError()">
                            💥 觸發組件崩潰
                        </button>
                        <button class="btn-secondary" onclick="this.closest('page-dashboard').showModalDemo()">
                            📢 對話框示範
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async showModalDemo() {
        const confirmed = await modalService.confirm(
            '原生對話框示範',
            '這是一個利用瀏覽器原生 <dialog> 元素實作的對話框。它具備自動焦點鎖定、背景遮罩以及 Escape 鍵關閉等特性。您確定這很酷嗎？'
        );

        if (confirmed) {
            notificationService.success('感謝您的肯定！這確實很酷。');
        } else {
            notificationService.info('沒關係，原生技術的優雅需要時間體會。');
        }
    }

    async clearCache() {
        if (confirm('確定要清除所有 IndexedDB 快取嗎？')) {
            await idbService.clear();
            await this.refreshStats();
            notificationService.success("IndexedDB 快取已清空！");
        }
    }

    startTask(n) {
        this.state.workerStatus = `運算中 (Fib ${n})...`;
        computeService.run('fibonacci', n);
    }

    triggerError() {
        throw new Error("這是故意的模擬錯誤，用來展示 Error Boundary 的效果！");
    }
}
customElements.define('page-dashboard', Dashboard);
