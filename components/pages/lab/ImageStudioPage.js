import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { imageService } from '../../../lib/image-service.js';
import { notificationService } from '../../../lib/notification-service.js';

/**
 * ImageStudioPage - 原生影像工作室
 */
export class ImageStudioPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            originalUrl: null,
            processedUrl: null,
            isProcessing: false,
            filters: {
                grayscale: 0,
                sepia: 0,
                invert: 0,
                brightness: 100
            },
            compressionQuality: 80,
            targetWidth: 800
        });
    }

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.state.originalUrl = event.target.result;
            this.applyFilters();
        };
        reader.readAsDataURL(file);
    }

    async applyFilters() {
        if (!this.state.originalUrl) return;
        this.state.isProcessing = true;
        try {
            const result = await imageService.process(this.state.originalUrl, this.state.filters);
            this.state.processedUrl = result;
        } catch (err) {
            notificationService.error(err.message);
        } finally {
            this.state.isProcessing = false;
        }
    }

    updateFilter(name, value) {
        this.state.filters = { ...this.state.filters, [name]: value };
        this.applyFilters();
    }

    async downloadResult() {
        if (!this.state.originalUrl) return;
        try {
            const blob = await imageService.resizeAndCompress(
                this.state.originalUrl,
                this.state.targetWidth,
                this.state.compressionQuality / 100
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vanilla-edit-${Date.now()}.webp`;
            a.click();
            URL.revokeObjectURL(url);
            notificationService.success('圖片已壓縮並下載 (WebP)');
        } catch (err) {
            notificationService.error('下載失敗: ' + err.message);
        }
    }

    render() {
        return html`
            <style>
                .studio-layout { display: grid; grid-template-columns: 1fr 300px; gap: 2rem; }
                .preview-area { background: #f0f0f0; border-radius: 12px; min-height: 400px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; border: 2px dashed var(--border-color); }
                .preview-img { max-width: 100%; max-height: 600px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
                .controls-panel { background: var(--card-bg); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); }
                .filter-group { margin-bottom: 1.2rem; }
                .filter-group label { display: block; font-size: 0.85rem; margin-bottom: 0.4rem; color: var(--text-muted); }
                input[type="range"] { width: 100%; }
                .upload-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.8); cursor: pointer; }
            </style>

            <div class="lab-header">
                <h2>🎨 原生影像工作室 (Native Image Studio)</h2>
                <p>純前端、零套件的圖片濾鏡與壓縮引擎。所有運算皆在您的瀏覽器內完成。</p>
            </div>

            <div class="studio-layout">
                <!-- 預覽區 -->
                <div class="preview-area">
                    ${this.state.processedUrl ? html`
                        <img src="${this.state.processedUrl}" class="preview-img">
                    ` : html`
                        <div class="upload-overlay" onclick="this.nextElementSibling.click()">
                            <span>📁 點擊或拖放圖片至此</span>
                            <small>支援 JPG, PNG, WebP</small>
                        </div>
                    `}
                    <input type="file" hidden accept="image/*" onchange="this.closest('page-lab-image-studio').handleFileUpload(event)">
                </div>

                <!-- 控制區 -->
                <div class="controls-panel">
                    <h3>🛠️ 影像濾鏡</h3>
                    
                    <div class="filter-group">
                        <label>灰階 (Grayscale): ${this.state.filters.grayscale}%</label>
                        <input type="range" min="0" max="100" value="${this.state.filters.grayscale}"
                               oninput="this.closest('page-lab-image-studio').updateFilter('grayscale', this.value)">
                    </div>

                    <div class="filter-group">
                        <label>褐色 (Sepia): ${this.state.filters.sepia}%</label>
                        <input type="range" min="0" max="100" value="${this.state.filters.sepia}"
                               oninput="this.closest('page-lab-image-studio').updateFilter('sepia', this.value)">
                    </div>

                    <div class="filter-group">
                        <label>反轉 (Invert): ${this.state.filters.invert}%</label>
                        <input type="range" min="0" max="100" value="${this.state.filters.invert}"
                               oninput="this.closest('page-lab-image-studio').updateFilter('invert', this.value)">
                    </div>

                    <div class="filter-group">
                        <label>亮度 (Brightness): ${this.state.filters.brightness}%</label>
                        <input type="range" min="0" max="200" value="${this.state.filters.brightness}"
                               oninput="this.closest('page-lab-image-studio').updateFilter('brightness', this.value)">
                    </div>

                    <hr>
                    <h3>💾 導出設定</h3>
                    
                    <div class="filter-group">
                        <label>導出寬度: ${this.state.targetWidth}px</label>
                        <input type="range" min="200" max="2000" step="50" value="${this.state.targetWidth}"
                               oninput="this.closest('page-lab-image-studio').state.targetWidth = this.value">
                    </div>

                    <div class="filter-group">
                        <label>壓縮品質: ${this.state.compressionQuality}%</label>
                        <input type="range" min="10" max="100" value="${this.state.compressionQuality}"
                               oninput="this.closest('page-lab-image-studio').state.compressionQuality = this.value">
                    </div>

                    <button class="btn btn-primary" style="width: 100%;" 
                            ${!this.state.originalUrl || this.state.isProcessing ? 'disabled' : ''}
                            onclick="this.closest('page-lab-image-studio').downloadResult()">
                        🚀 下載 WebP 圖片
                    </button>
                </div>
            </div>

            <section class="info-section" style="margin-top: 2rem;">
                <h3>🎓 技術亮點</h3>
                <ul>
                    <li><strong>Canvas Filters</strong>：利用 <code>ctx.filter</code> 屬性實作硬體加速的影像特效。</li>
                    <li><strong>WebP 轉換</strong>：原生支援將任何格式圖片轉為現代高效能的 WebP。</li>
                    <li><strong>隱私安全</strong>：圖片完全在本地處理，不會上傳到任何伺服器。</li>
                </ul>
                <div style="margin-top: 1.5rem;">
                    <a href="#/lab" class="btn btn-secondary btn-sm">⬅️ 回到實驗室列表</a>
                </div>
            </section>
        `;
    }
}

customElements.define('page-lab-image-studio', ImageStudioPage);
