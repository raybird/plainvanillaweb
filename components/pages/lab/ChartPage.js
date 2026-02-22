import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { CanvasChart } from "../../../lib/canvas-chart.js";

export class ChartPage extends BaseComponent {
    constructor() {
        super();
        // ⚠️ 不使用 initReactiveState！
        // fps 和 lastValue 需要高頻更新，若放進 reactive state 每次都會觸發
        // scheduleUpdate() → innerHTML 全量重繪 → Canvas 消失並閃爍。
        // 改為直接操作目標 DOM 的 textContent，效能更好且無閃爍。
        this._timer = null;
        this._chart = null;
        this._frameCount = 0;
        this._lastFpsTime = performance.now();
    }

    connectedCallback() {
        super.connectedCallback();
        // 等待首次渲染後初始化 Canvas
        requestAnimationFrame(() => this._initChart());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._timer) clearInterval(this._timer);
    }

    _initChart() {
        const canvas = this.querySelector('#realtime-chart');
        if (!canvas) return;

        // 設定實際畫布大小以防模糊 (Retina 螢幕)
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        this._chart = new CanvasChart(canvas, {
            color: '#10b981',
            lineWidth: 2.5,
            maxDataPoints: 60,
            padding: 30
        });

        // 記錄邏輯畫布大小以供 CanvasChart 內部使用
        this._chart.canvas = { ...canvas, width: rect.width, height: rect.height };

        // 啟動資料流模擬器與 FPS 監控
        this._startSimulation();
        this._startFPSMonitor();
    }

    _startSimulation() {
        let value = 50;
        this._timer = setInterval(() => {
            const change = (Math.random() - 0.5) * 10;
            value = Math.max(0, Math.min(100, value + change));

            // 直接更新 DOM textContent，不觸發 reactive state 重繪
            const valueEl = this.querySelector('#stat-value');
            if (valueEl) valueEl.textContent = value.toFixed(1);

            if (this._chart) {
                this._chart.addData(value);
            }
        }, 100);
    }

    _startFPSMonitor() {
        const loop = () => {
            this._frameCount++;
            const now = performance.now();
            const elapsed = now - this._lastFpsTime;

            if (elapsed >= 1000) {
                const fps = ((this._frameCount * 1000) / elapsed).toFixed(1);
                this._frameCount = 0;
                this._lastFpsTime = now;

                // 直接更新 DOM textContent，不觸發 reactive state 重繪
                const fpsEl = this.querySelector('#stat-fps');
                if (fpsEl) fpsEl.textContent = fps;
            }
            if (this.isConnected) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    render() {
        return html`
            <style>
                .chart-container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 2rem;
                }
                .card {
                    background: var(--surface-color, #fff);
                    border-radius: 12px;
                    padding: 2rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }
                canvas {
                    width: 100%;
                    height: 300px;
                    background: #f8fafc;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    margin: 2rem 0;
                    display: block;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                }
                .stat-box {
                    padding: 1.5rem;
                    background: #f0fdf4;
                    border-radius: 8px;
                    border-left: 4px solid #10b981;
                }
                .stat-box.fps-box {
                    background: #eff6ff;
                    border-left-color: #3b82f6;
                }
                .stat-label {
                    font-size: 0.85rem;
                    color: #475569;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .stat-value {
                    font-size: 2rem;
                    font-weight: 700;
                    color: #0f172a;
                    margin-top: 0.5rem;
                }
            </style>

            <div class="chart-container">
                <div class="card">
                    <h2>📊 高效能原生圖表 (Canvas Chart)</h2>
                    <p>
                        在不引入 Chart.js, D3.js 等龐大依賴的情況下，使用純 <code>CanvasRenderingContext2D</code> 繪製的即時數據。
                        這套系統每 100ms 刷新一次，具備自動縮放 (Auto-scale) 與平滑漸層渲染的能力。
                    </p>

                    <canvas id="realtime-chart"></canvas>

                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-label">最新採樣數值</div>
                            <div id="stat-value" class="stat-value" style="color: #10b981;">--</div>
                        </div>
                        <div class="stat-box fps-box">
                            <div class="stat-label">瀏覽器渲染幀率 (FPS)</div>
                            <div id="stat-fps" class="stat-value" style="color: #3b82f6;">--</div>
                        </div>
                    </div>
                </div>
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}

customElements.define("page-lab-chart", ChartPage);
