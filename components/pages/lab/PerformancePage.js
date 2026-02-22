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
            metrics: performanceService.metrics,
            navMetrics: {
                dns: 0,
                tcp: 0,
                request: 0,
                response: 0,
                dom: 0
            }
        });
    }

    connectedCallback() {
        super.connectedCallback();

        performanceService.on('metric-update', ({ name, value, metrics }) => {
            if (name === 'navigation') {
                this.state.metrics = { ...metrics };
                this._calculateDetailedNavigation();
            } else {
                this.state.metrics = { ...this.state.metrics, [name]: value };
            }
        });

        this._calculateDetailedNavigation();
    }

    _calculateDetailedNavigation() {
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav) {
            this.state.navMetrics = {
                dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
                tcp: Math.round(nav.connectEnd - nav.connectStart),
                request: Math.round(nav.responseStart - nav.requestStart),
                response: Math.round(nav.responseEnd - nav.responseStart),
                dom: Math.round(nav.domContentLoadedEventEnd - nav.responseEnd)
            };
        }
    }

    render() {
        const m = this.state.metrics;
        const n = this.state.navMetrics;

        return html`
            <style>
                .perf-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
                .metric-card { background: var(--card-bg); padding: 1.5rem; border-radius: 12px; border: 1px solid #eee; text-align: center; }
                .metric-value { font-size: 2rem; font-weight: bold; color: var(--primary-color); display: block; margin: 0.5rem 0; }
                .metric-label { font-size: 0.85rem; color: #666; font-weight: bold; }
                .waterfall { background: #f8f9fa; padding: 1.5rem; border-radius: 12px; border: 1px solid #ddd; }
                .bar-container { display: flex; align-items: center; margin-bottom: 0.8rem; gap: 1rem; }
                .bar-label { width: 100px; font-size: 0.8rem; flex-shrink: 0; }
                .bar-wrapper { flex: 1; height: 20px; background: #eee; border-radius: 4px; overflow: hidden; position: relative; }
                .bar-fill { height: 100%; background: var(--primary-color); min-width: 2px; }
                .bar-text { position: absolute; right: 8px; top: 0; font-size: 0.7rem; line-height: 20px; color: #333; }
            </style>

            <h2>⏱️ 原生效能監控 (Web Performance)</h2>
            <p>利用 <code>PerformanceObserver</code> 與 <code>Navigation Timing API</code> 即時觀察網頁健康度與加載管線。</p>

            <div class="perf-grid">
                <div class="metric-card">
                    <span class="metric-label">LCP (載入最大內容)</span>
                    <span class="metric-value">${m.lcp}ms</span>
                    <small>${m.lcp < 2500 ? '✅ 良好' : '⚠️ 待優化'}</small>
                </div>
                <div class="metric-card">
                    <span class="metric-label">CLS (累計佈局位移)</span>
                    <span class="metric-value">${m.cls.toFixed(3)}</span>
                    <small>${m.cls < 0.1 ? '✅ 穩定' : '⚠️ 異常'}</small>
                </div>
                <div class="metric-card">
                    <span class="metric-label">總體加載時間</span>
                    <span class="metric-value">${m.loadTime}ms</span>
                </div>
            </div>

            <div class="waterfall">
                <h3>🛠️ 加載流程拆解 (Navigation Timing)</h3>
                
                <div class="bar-container">
                    <div class="bar-label">DNS 查詢</div>
                    <div class="bar-wrapper">
                        <div class="bar-fill" style="width: ${Math.min(100, n.dns / 2)}%"></div>
                        <div class="bar-text">${n.dns} ms</div>
                    </div>
                </div>

                <div class="bar-container">
                    <div class="bar-label">TCP 連線</div>
                    <div class="bar-wrapper">
                        <div class="bar-fill" style="width: ${Math.min(100, n.tcp / 2)}%"></div>
                        <div class="bar-text">${n.tcp} ms</div>
                    </div>
                </div>

                <div class="bar-container">
                    <div class="bar-label">伺服器回應 (TTFB)</div>
                    <div class="bar-wrapper">
                        <div class="bar-fill" style="width: ${Math.min(100, n.request / 5)}%"></div>
                        <div class="bar-text">${n.request} ms</div>
                    </div>
                </div>

                <div class="bar-container">
                    <div class="bar-label">DOM 解析</div>
                    <div class="bar-wrapper">
                        <div class="bar-fill" style="width: ${Math.min(100, n.dom / 10)}%"></div>
                        <div class="bar-text">${n.dom} ms</div>
                    </div>
                </div>
            </div>

            <section class="info-section" style="margin-top: 2rem;">
                <h3>💡 教學亮點</h3>
                <ul>
                    <li><strong>PerformanceObserver</strong>：以非同步方式監聽瀏覽器效能事件，不阻塞主執行緒。</li>
                    <li><strong>Web Vitals</strong>：Google 定義的核心效能指標，直接影響 SEO 與使用者留存。</li>
                    <li><strong>Zero Framework</strong>：純原生 API 即可實現專業級的 APM (Application Performance Monitoring)。</li>
                </ul>
                <div style="margin-top: 1.5rem;">
                    <a href="#/lab" class="btn btn-secondary btn-sm">⬅️ 回到實驗室列表</a>
                </div>
            </section>
        `;
    }
}

customElements.define('page-lab-performance', PerformancePage);
