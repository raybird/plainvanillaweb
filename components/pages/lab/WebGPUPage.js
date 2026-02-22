import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { webgpuService } from '../../../lib/webgpu-service.js';
import { notificationService } from '../../../lib/notification-service.js';

/**
 * WebGPUPage - 次世代硬體加速運算實驗室
 */
export class WebGPUPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isSupported: webgpuService.isSupported,
            isComputing: false,
            inputData: [1.5, 2.5, 3.5, 4.5, 5.5, 10.0, 100.0, 0.1],
            outputData: null,
            computeTime: 0
        });
    }

    async runCompute() {
        if (!this.state.isSupported) return;

        this.state.isComputing = true;
        const startTime = performance.now();

        try {
            const data = new Float32Array(this.state.inputData);
            const result = await webgpuService.computeDouble(data);

            this.state.outputData = Array.from(result);
            this.state.computeTime = (performance.now() - startTime).toFixed(4);
            notificationService.success('WebGPU 運算完成！');
        } catch (err) {
            notificationService.error('運算失敗: ' + err.message);
        } finally {
            this.state.isComputing = false;
        }
    }

    render() {
        const t = (k) => this.$t(k);

        return html`
            <style>
                .compute-box { background: var(--card-bg); padding: 1.5rem; border-radius: 12px; border: 1px solid #eee; margin-bottom: 1.5rem; }
                .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0; }
                .data-panel { background: #f8f9fa; padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.9rem; border: 1px solid #ddd; }
                .status-tag { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.8rem; margin-bottom: 1rem; }
                .tag-success { background: #e6fffa; color: #28a745; border: 1px solid #b2f2bb; }
                .tag-error { background: #fff5f5; color: #dc3545; border: 1px solid #feb2b2; }
                .metrics { font-size: 0.85rem; color: #666; margin-top: 0.5rem; }
            </style>

            <div class="lab-header">
                <h2>⚡ 次世代運算 (WebGPU)</h2>
                <p>利用瀏覽器原生的 WebGPU API，直接調用 GPU 進行高效能通用計算 (GPGPU)。</p>
            </div>

            <div class="compute-box">
                <span class="status-tag ${this.state.isSupported ? 'tag-success' : 'tag-error'}">
                    ${this.state.isSupported ? '✅ 您的瀏覽器支援 WebGPU' : '❌ 瀏覽器不支援 WebGPU (建議使用 Chrome 113+)'}
                </span>

                <p><strong>實驗目標：</strong> 將一個浮點數組傳送至 GPU，利用 <code>Compute Shader (WGSL)</code> 將每個數值乘以 2 後傳回。</p>

                <div class="data-grid">
                    <div>
                        <label>輸入數據 (CPU)</label>
                        <div class="data-panel">
                            [${this.state.inputData.join(', ')}]
                        </div>
                    </div>
                    <div>
                        <label>運算結果 (GPU)</label>
                        <div class="data-panel">
                            ${this.state.outputData ? `[${this.state.outputData.map(n => n.toFixed(1)).join(', ')}]` : '等待運算...'}
                        </div>
                    </div>
                </div>

                <div class="btn-group">
                    <button class="btn btn-primary" 
                            ${!this.state.isSupported || this.state.isComputing ? 'disabled' : ''}
                            onclick="this.closest('page-lab-webgpu').runCompute()">
                        ${this.state.isComputing ? '⏳ 運算中...' : '🚀 執行 GPU 運算'}
                    </button>
                </div>

                ${this.state.outputData ? html`
                    <div class="metrics">
                        ⏱️ 運算耗時: <strong>${this.state.computeTime} ms</strong> (包含 Buffer 傳輸與 Shader 執行)
                    </div>
                ` : ''}
            </div>

            <section class="info-section">
                <h3>💡 技術說明</h3>
                <ul>
                    <li><strong>WGSL</strong>：WebGPU 的原生著色器語言，比 WebGL 的 GLSL 更現代且強大。</li>
                    <li><strong>平行運算</strong>：GPU 可以同時處理成千上萬個運算單元，適合矩陣運算、圖像處理與機器學習。</li>
                    <li><strong>資源管理</strong>：直接操作顯存緩衝區 (Buffer)，減少 CPU 與 GPU 之間的溝通開銷。</li>
                </ul>
                <div style="margin-top: 1.5rem;">
                    <a href="#/docs/webgpu" class="btn btn-secondary btn-sm">📚 閱讀技術手冊</a>
                    <a href="#/lab" class="btn btn-secondary btn-sm">⬅️ 回到實驗室列表</a>
                </div>
            </section>
        `;
    }
}

customElements.define('page-lab-webgpu', WebGPUPage);
