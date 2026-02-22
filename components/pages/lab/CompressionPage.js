import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { compressionService } from '../../../lib/compression-service.js';
import { notificationService } from '../../../lib/notification-service.js';

/**
 * CompressionPage - 原生數據壓縮實驗室
 */
export class CompressionPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isSupported: 'CompressionStream' in window,
            inputText: 'Vanilla JS is awesome! '.repeat(50),
            compressedData: null,
            originalSize: 0,
            compressedSize: 0,
            decompressedText: '',
            isProcessing: false
        });
    }

    async runCompress() {
        const ta = this.querySelector('#compress-input');
        const text = ta?.value;
        if (!text) return;
        this.state.isProcessing = true;
        try {
            const result = await compressionService.compress(text);
            this.state.compressedData = result;
            this.state.originalSize = new TextEncoder().encode(text).length;
            this.state.compressedSize = result.length;
            notificationService.success('壓縮完成！');
        } catch (err) {
            notificationService.error('壓縮失敗: ' + err.message);
        } finally {
            this.state.isProcessing = false;
        }
    }

    async runDecompress() {
        if (!this.state.compressedData) return;
        this.state.isProcessing = true;
        try {
            const result = await compressionService.decompress(this.state.compressedData);
            this.state.decompressedText = result;
            notificationService.success('解壓縮成功！');
        } catch (err) {
            notificationService.error('解壓縮失敗: ' + err.message);
        } finally {
            this.state.isProcessing = false;
        }
    }

    render() {
        const ratio = this.state.originalSize > 0
            ? ((1 - (this.state.compressedSize / this.state.originalSize)) * 100).toFixed(1)
            : 0;

        return html`
            <style>
                .comp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
                .data-card { background: var(--card-bg); padding: 1.5rem; border-radius: 12px; border: 1px solid #eee; }
                .size-stat { font-size: 2rem; font-weight: bold; color: var(--primary-color); }
                .text-preview { background: #f8f9fa; padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; height: 150px; overflow-y: auto; border: 1px solid #ddd; white-space: pre-wrap; }
                .hex-preview { background: #1a202c; color: #48bb78; }
            </style>

            <div class="lab-header">
                <h2>🗜️ 數據壓縮流 (Compression Streams)</h2>
                <p>利用瀏覽器內建的 <code>CompressionStream</code> 進行 Gzip 壓縮，無需任何第三方函式庫。</p>
            </div>

            <div class="comp-grid">
                <!-- 輸入區 -->
                <div class="data-card">
                    <h3>1. 原始數據</h3>
                    <textarea id="compress-input" class="form-control" style="height: 100px;"
                    >${'Vanilla JS is awesome! '.repeat(50)}</textarea>
                    <div class="btn-group" style="margin-top: 1rem;">
                        <button class="btn btn-primary" ?disabled="${this.state.isProcessing}" onclick="this.closest('page-lab-compression').runCompress()">
                            ⚡ 執行 Gzip 壓縮
                        </button>
                    </div>
                </div>

                <!-- 結果區 -->
                <div class="data-card">
                    <h3>2. 壓縮指標</h3>
                    <div style="display: flex; gap: 2rem; align-items: center;">
                        <div>
                            <div class="size-stat">${this.state.compressedSize} B</div>
                            <small>壓縮後體積</small>
                        </div>
                        <div style="font-size: 1.5rem; color: #999;">/</div>
                        <div>
                            <div style="font-size: 1.2rem;">${this.state.originalSize} B</div>
                            <small>原始體積</small>
                        </div>
                    </div>
                    <div style="margin-top: 1rem; color: #28a745; font-weight: bold;">
                        📉 壓縮率: ${ratio}%
                    </div>
                </div>
            </div>

            <div class="comp-grid" style="margin-top: 1.5rem;">
                <!-- 二進位預覽 -->
                <div class="data-card">
                    <h3>3. 壓縮數據預覽 (Gzip Binary)</h3>
                    <div class="text-preview hex-preview">
                        ${this.state.compressedData ? Array.from(this.state.compressedData.slice(0, 100)).map(b => b.toString(16).padStart(2, '0')).join(' ') + '...' : '等待壓縮...'}
                    </div>
                </div>

                <!-- 解壓驗證 -->
                <div class="data-card">
                    <h3>4. 解壓縮驗證</h3>
                    <div class="text-preview">
                        ${this.state.decompressedText || '等待執行解壓縮...'}
                    </div>
                    <button class="btn btn-secondary btn-sm" style="margin-top: 1rem;"
                            ?disabled="${!this.state.compressedData || this.state.isProcessing}"
                            onclick="this.closest('page-lab-compression').runDecompress()">
                        🔄 驗證解壓縮
                    </button>
                </div>
            </div>

            <section class="info-section" style="margin-top: 2rem;">
                <h3>🎓 工業情境應用</h3>
                <ul>
                    <li><strong>日誌傳輸</strong>：在將大型 Debug 日誌傳回伺服器前先進行壓縮。</li>
                    <li><strong>儲存優化</strong>：壓縮較大的 JSON 字串後再存入 IndexedDB。</li>
                    <li><strong>效能</strong>：原生實作通常比 JS 函式庫快且省電。</li>
                </ul>
                <div style="margin-top: 1.5rem;">
                    <a href="#/lab" class="btn btn-secondary btn-sm">⬅️ 回到實驗室列表</a>
                </div>
            </section>
        `;
    }
}

customElements.define('page-lab-compression', CompressionPage);
