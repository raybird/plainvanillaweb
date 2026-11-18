import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { performanceService } from '../../../lib/performance-service.js';

/**
 * PerformancePage - 原生效能監控實驗室
 */
export class PerformancePage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            metrics: performanceService.summary,
            navMetrics: null
        });
    }

    connectedCallback() {
        super.connectedCallback();

        this.state.metrics = performanceService.summary;
        this._unsubscribeMetrics = performanceService.on('metric-update', ({ name }) => {
            this.state.metrics = performanceService.summary;
            if (name === 'navigation') this._calculateDetailedNavigation();
        });

        this._calculateDetailedNavigation();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._unsubscribeMetrics?.();
    }

    _calculateDetailedNavigation() {
        const nav = performance.getEntriesByType('navigation')[0];
        const duration = (end, start) => end > 0 ? Math.round(end - start) : null;
        if (nav) {
            this.state.navMetrics = {
                dns: duration(nav.domainLookupEnd, nav.domainLookupStart),
                tcp: duration(nav.connectEnd, nav.connectStart),
                request: duration(nav.responseStart, nav.requestStart),
                dom: duration(nav.domInteractive, nav.responseEnd)
            };
        }
    }

    render() {
        const m = this.state.metrics;
        const n = this.state.navMetrics ?? {};
        const milliseconds = value => value == null ? '未取得' : `${value} ms`;

        return html`
            <style>
                .perf-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
                .metric-card { background: var(--card-bg); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); text-align: center; }
                .metric-value { font-size: 2rem; font-weight: bold; color: var(--primary-color); display: block; margin: 0.5rem 0; }
                .metric-label { font-size: 0.85rem; color: var(--text-muted); font-weight: bold; }
                .waterfall { background: var(--surface-color); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); }
                .bar-container { display: flex; align-items: center; margin-bottom: 0.8rem; gap: 1rem; }
                .bar-label { width: 100px; font-size: 0.8rem; flex-shrink: 0; }
                .bar-wrapper { flex: 1; height: 20px; background: #eee; border-radius: 4px; overflow: hidden; position: relative; }
                .bar-fill { height: 100%; background: var(--primary-color); min-width: 2px; }
                .bar-text { position: absolute; right: 8px; top: 0; font-size: 0.7rem; line-height: 20px; color: var(--text-color); }
            </style>

            <h2>⏱️ 原生效能監控 (Web Performance)</h2>
            <p>利用 <code>PerformanceObserver</code> 與 <code>Navigation Timing API</code> 即時觀察網頁健康度與加載管線。</p>

            <div class="perf-grid">
                <div class="metric-card">
                    <span class="metric-label">LCP (載入最大內容)</span>
                    <span class="metric-value">${milliseconds(m.lcp)}</span>
                    <small>${m.lcp === null ? '' : m.lcp <= 2500 ? '✅ 良好' : '⚠️ 待優化'}</small>
                </div>
                <div class="metric-card">
                    <span class="metric-label">CLS (累計佈局位移)</span>
                    <span class="metric-value">${m.cls?.toFixed(3) ?? '未取得'}</span>
                    <small>${m.cls === null ? '' : m.cls <= 0.1 ? '✅ 穩定' : '⚠️ 異常'}</small>
                </div>
                <div class="metric-card">
                    <span class="metric-label">最慢觀測互動（Event Timing）</span>
                    <span class="metric-value">${milliseconds(m.interactionLatency)}</span>
                    <small>單次頁面觀測，不等同於 INP</small>
                </div>
                <div class="metric-card">
                    <span class="metric-label">總體加載時間</span>
                    <span class="metric-value">${milliseconds(m.loadTime)}</span>
                </div>
            </div>

            <div class="waterfall">
                <h3>🛠️ 加載流程拆解 (Navigation Timing)</h3>
                
                <div class="bar-container">
                    <div class="bar-label">DNS 查詢</div>
                    <div class="bar-wrapper">
                        <div class="bar-fill" style="width: ${Math.min(100, (n.dns ?? 0) / 2)}%"></div>
                        <div class="bar-text">${milliseconds(n.dns)}</div>
                    </div>
                </div>

                <div class="bar-container">
                    <div class="bar-label">TCP 連線</div>
                    <div class="bar-wrapper">
                        <div class="bar-fill" style="width: ${Math.min(100, (n.tcp ?? 0) / 2)}%"></div>
                        <div class="bar-text">${milliseconds(n.tcp)}</div>
                    </div>
                </div>

                <div class="bar-container">
                    <div class="bar-label">請求至首位元組</div>
                    <div class="bar-wrapper">
                        <div class="bar-fill" style="width: ${Math.min(100, (n.request ?? 0) / 5)}%"></div>
                        <div class="bar-text">${milliseconds(n.request)}</div>
                    </div>
                </div>

                <div class="bar-container">
                    <div class="bar-label">DOM 解析</div>
                    <div class="bar-wrapper">
                        <div class="bar-fill" style="width: ${Math.min(100, (n.dom ?? 0) / 10)}%"></div>
                        <div class="bar-text">${milliseconds(n.dom)}</div>
                    </div>
                </div>
            </div>

            <section class="info-section" style="margin-top: 2rem;">
                <h3>💡 教學亮點</h3>
                <ul>
                    <li><strong>PerformanceObserver</strong>：以非同步方式監聽瀏覽器效能事件，不阻塞主執行緒。</li>
                    <li><strong>Web Vitals</strong>：此頁顯示目前文件的觀測值，供開發除錯。</li>
                    <li><strong>Zero Framework</strong>：直接讀取瀏覽器的效能資料。</li>
                </ul>
                <div style="margin-top: 1.5rem;">
                    <a href="#/lab" class="btn btn-secondary btn-sm">⬅️ 回到實驗室列表</a>
                </div>
            </section>
        `;
    }
}

customElements.define('page-lab-performance', PerformancePage);
