import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { CanvasChart } from '../../lib/canvas-chart.js';
import { performanceService } from '../../lib/performance-service.js';

export class AnalyticsPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isMonitoring: false
        });
        this.charts = new Map();
    }

    afterFirstRender() {
        this._initCharts();
    }

    _initCharts() {
        const memCanvas = this.querySelector('#memory-chart');
        if (memCanvas) {
            this.charts.set('memory', new CanvasChart(memCanvas, { color: '#28a745' }));
        }

        const lcpCanvas = this.querySelector('#lcp-chart');
        if (lcpCanvas) {
            this.charts.set('lcp', new CanvasChart(lcpCanvas, { color: '#007bff' }));
        }

        this.startMonitoring();
    }

    startMonitoring() {
        if (this.state.isMonitoring) return;
        this.state.isMonitoring = true;

        this.monitorInterval = setInterval(() => {
            // 更新記憶體趨勢
            if (performance && performance.memory) {
                const used = performance.memory.usedJSHeapSize / 1024 / 1024;
                this.charts.get('memory')?.addData(used);
            }

            // 更新 LCP 趨勢 (來自 service)
            const summary = performanceService.summary;
            this.charts.get('lcp')?.addData(summary.lcp);
        }, 1000);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        clearInterval(this.monitorInterval);
    }

    render() {
        return html`
            <style>
                .analytics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2rem; }
                .chart-card { background: var(--card-bg); border: 1px solid var(--card-border); padding: 1.5rem; border-radius: 12px; box-shadow: var(--card-shadow); }
                canvas { width: 100%; height: 200px; background: var(--surface-color); border-radius: 8px; margin-top: 1rem; }
            </style>

            <h1>📊 性能分析中心 (Analytics Hub)</h1>
            <p>利用原生 Canvas API 實作的高效能即時監控系統。</p>

            <div class="analytics-grid">
                <div class="chart-card">
                    <h3>🧠 記憶體趨勢 (JS Heap)</h3>
                    <p><small>顯示當前應用程式佔用的 Heap Memory (MB)。</small></p>
                    <canvas id="memory-chart" width="800" height="400"></canvas>
                </div>

                <div class="chart-card">
                    <h3>⚡ LCP 穩定性 (ms)</h3>
                    <p><small>追蹤 Largest Contentful Paint 的變化。</small></p>
                    <canvas id="lcp-chart" width="800" height="400"></canvas>
                </div>
            </div>

            <section style="margin-top: 3rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 教學重點：Canvas vs DOM</h3>
                <p>為什麼我們在圖表中使用 Canvas 而非 SVG 或多個 Div？</p>
                <ul>
                    <li><strong>效能極限</strong>：對於每秒更新多次的即時趨勢圖，Canvas 只有一次繪圖開銷，而 SVG 則需要不斷操作 DOM。</li>
                    <li><strong>底層控制</strong>：直接操作像素，能實作極致的自訂效果與極小的記憶體占用。</li>
                    <li><strong>零相依性</strong>：展示如何僅用 50 行代碼實現一個可用的圖表庫核心。</li>
                </ul>
            </section>
        `;
    }
}
customElements.define('page-analytics', AnalyticsPage);
