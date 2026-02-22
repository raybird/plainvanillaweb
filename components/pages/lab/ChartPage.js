import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { CanvasChart } from "../../../lib/canvas-chart.js";

export class ChartPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            fps: '0.0',
            lastValue: 0
        });
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

        // 設定實際畫布大小以免模糊 (處理 Retina 螢幕)
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        this._chart = new CanvasChart(canvas, {
            color: '#10b981', // 翡翠綠
            lineWidth: 3,
            maxDataPoints: 60,
            padding: 30
        });

        // 取代原本的 fillText 來對文字放大
        const originalDraw = this._chart.draw.bind(this._chart);

        // 為了支援 dpr，我們微調繪製
        this._chart.draw = () => {
            const tempW = canvas.width;
            const tempH = canvas.height;
            canvas.width = rect.width;
            canvas.height = rect.height;

            originalDraw();

            canvas.width = tempW;
            canvas.height = tempH;
            ctx.scale(dpr, dpr);
            originalDraw();
        };

        this._chart.canvas = { width: rect.width, height: rect.height };

        // 啟動資料流模擬器
        this._startSimulation();
        this._startFPSMonitor();
    }

    _startSimulation() {
        let value = 50;
        this._timer = setInterval(() => {
            // 隨機波動 (Simulate Network Traffic or CPU Load)
            const change = (Math.random() - 0.5) * 10;
            value = Math.max(0, Math.min(100, value + change));

            this.state.lastValue = value.toFixed(1);
            if (this._chart) {
                this._chart.addData(value);
            }
        }, 100); // 100ms 更新一次 (10 FPS)
    }

    _startFPSMonitor() {
        const loop = () => {
            this._frameCount++;
            const now = performance.now();
            const elapsed = now - this._lastFpsTime;

            if (elapsed >= 1000) {
                this.state.fps = ((this._frameCount * 1000) / elapsed).toFixed(1);
                this._frameCount = 0;
                this._lastFpsTime = now;
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
                        這套系統每 100ms 刷新一次畫面，具備自動縮放 (Auto-scale) 與平滑漸層渲染的能力。
                    </p>

                    <canvas id="realtime-chart"></canvas>

                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-label">最新採樣數值</div>
                            <div class="stat-value" style="color: #10b981;">${this.state.lastValue}</div>
                        </div>
                        <div class="stat-box fps-box">
                            <div class="stat-label">瀏覽器渲染幀率 (FPS)</div>
                            <div class="stat-value" style="color: #3b82f6;">${this.state.fps}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define("page-lab-chart", ChartPage);
