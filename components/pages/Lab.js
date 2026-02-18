import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { speechService } from '../../lib/speech-service.js';
import { notificationService } from '../../lib/notification-service.js';
import { cryptoService } from '../../lib/crypto-service.js';
import { wasmService } from '../../lib/wasm-service.js';
import { webgpuService } from '../../lib/webgpu-service.js'; // 引入 WebGPU 服務
import '../ui/Card.js';

export class LabPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isListening: false,
            transcript: '',
            ttsText: '歡迎來到 Vanilla Web 實驗室，這裡展示了原生網頁 API 的無限可能。',
            cryptoInput: '這是一段敏感內容',
            cryptoPass: 'password123',
            encryptedData: null,
            decryptedResult: '',
            hashResult: '',
            wasmLoaded: false,
            wasmResult: null,
            wasmInputA: 10,
            wasmInputB: 20,
            webgpuStatus: webgpuService.isSupported ? '支援' : '不支援',
            gpuResult: null,
            isComputing: false
        });
        this.handleResult = this.handleResult.bind(this);
        this.handleEnd = this.handleEnd.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        speechService.addEventListener('result', this.handleResult);
        speechService.addEventListener('end', this.handleEnd);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        speechService.removeEventListener('result', this.handleResult);
        speechService.removeEventListener('end', this.handleEnd);
    }

    handleResult(e) {
        this.state.transcript = e.detail.text;
        notificationService.success(`辨識結果: ${e.detail.text}`);
    }

    handleEnd() {
        this.state.isListening = false;
    }

    toggleListening() {
        if (this.state.isListening) {
            speechService.stopListening();
        } else {
            try {
                speechService.startListening();
                this.state.isListening = true;
                notificationService.info('請開始說話...');
            } catch (err) {
                notificationService.error(err.message);
            }
        }
    }

    speak() {
        speechService.speak(this.state.ttsText);
    }

    async generateHash() {
        this.state.hashResult = await cryptoService.sha256(this.state.cryptoInput);
        notificationService.info('雜湊生成成功');
    }

    async encryptData() {
        try {
            this.state.encryptedData = await cryptoService.encrypt(this.state.cryptoInput, this.state.cryptoPass);
            notificationService.success('加密成功！');
        } catch (err) {
            notificationService.error('加密失敗');
        }
    }

    async decryptData() {
        if (!this.state.encryptedData) return;
        try {
            this.state.decryptedResult = await cryptoService.decrypt(
                this.state.encryptedData.ciphertext,
                this.state.encryptedData.iv,
                this.state.cryptoPass
            );
            notificationService.success('解密成功！');
        } catch (err) {
            notificationService.error(err.message);
        }
    }

    async runWasmDemo() {
        if (!this.state.wasmLoaded) {
            await wasmService.loadDemoAdd();
            this.state.wasmLoaded = true;
            notificationService.success('Wasm 模組已載入 (Simple Add)');
        }
        
        const exports = wasmService.get('demo-add');
        if (exports && exports.add) {
            this.state.wasmResult = exports.add(this.state.wasmInputA, this.state.wasmInputB);
            notificationService.info(`Wasm 運算完成: ${this.state.wasmResult}`);
        }
    }

    async runWebGPUDemo() {
        if (!webgpuService.isSupported) {
            notificationService.error('您的瀏覽器不支援 WebGPU');
            return;
        }

        try {
            this.state.isComputing = true;
            notificationService.info('WebGPU 運算中 (100萬筆數據)...');
            
            // 建立 100 萬筆測試數據
            const data = new Float32Array(1000000).fill(1.5);
            const start = performance.now();
            const result = await webgpuService.computeDouble(data);
            const end = performance.now();
            
            this.state.gpuResult = `首項結果: ${result[0]} (耗時: ${(end - start).toFixed(2)}ms)`;
            this.state.isComputing = false;
            notificationService.success('WebGPU 運算完成！');
        } catch (err) {
            this.state.isComputing = false;
            notificationService.error(`WebGPU 錯誤: ${err.message}`);
        }
    }

    render() {
        return html`
            <style>
                .lab-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; }
                .lab-card { border: 1px solid #ddd; padding: 1.5rem; border-radius: 12px; background: var(--bg-color); }
                textarea, input { width: 100%; padding: 0.5rem; border-radius: 8px; border: 1px solid #ccc; margin-bottom: 1rem; box-sizing: border-box; }
                .mic-btn { 
                    width: 60px; height: 60px; border-radius: 50%; border: none; 
                    background: var(--primary-color); color: white; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1.5rem; transition: transform 0.2s, background 0.2s;
                }
                .mic-btn.active { background: #dc3545; animation: pulse 1.5s infinite; }
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.4); }
                    70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
                }
                .code-block { background: #272822; color: #f8f8f2; padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; overflow-x: auto; margin: 1rem 0; word-break: break-all; }
                .btn-group { display: flex; gap: 0.5rem; }
                .wasm-box { background: #eef; padding: 1rem; border-radius: 8px; margin-top: 1rem; }
                .status-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; background: #eee; }
                .status-badge.success { background: #d4edda; color: #155724; }
            </style>

            <h1>🧪 Vanilla 實驗室 (Lab)</h1>
            <p>探索最前沿的原生 Web 技術與實驗性功能。</p>

            <div class="lab-grid">
                <!-- WebGPU 單元 -->
                <div class="lab-card">
                    <h3>🎮 次世代運算 (WebGPU)</h3>
                    <p><small>直接利用顯示卡進行大量併行運算。</small></p>
                    <div style="margin-bottom: 1rem;">
                        狀態: <span class="status-badge ${webgpuService.isSupported ? 'success' : ''}">${this.state.webgpuStatus}</span>
                    </div>
                    <button class="btn btn-primary" 
                            ?disabled="${!webgpuService.isSupported || this.state.isComputing}"
                            onclick="this.closest('page-lab').runWebGPUDemo()">
                        ${this.state.isComputing ? '運算中...' : '執行 GPU 運算 (1M Data)'}
                    </button>
                    ${this.state.gpuResult ? html`<div class="wasm-box"><strong>結果:</strong> ${this.state.gpuResult}</div>` : ''}
                </div>

                <!-- WebAssembly 單元 -->
                <div class="lab-card">
                    <h3>⚙️ 高效能運算 (Wasm)</h3>
                    <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;">
                        <input type="number" style="width: 60px; margin:0;" value="${this.state.wasmInputA}" oninput="this.closest('page-lab').state.wasmInputA = parseInt(this.value)">
                        +
                        <input type="number" style="width: 60px; margin:0;" value="${this.state.wasmInputB}" oninput="this.closest('page-lab').state.wasmInputB = parseInt(this.value)">
                    </div>
                    <button class="btn btn-secondary" onclick="this.closest('page-lab').runWasmDemo()">執行 Wasm 加法</button>
                    ${this.state.wasmResult !== null ? html`<div class="wasm-box"><strong>結果:</strong> ${this.state.wasmResult}</div>` : ''}
                </div>
            </div>

            <h2 style="margin-top: 3rem;">🔐 安全與加密 (Web Crypto)</h2>
            <div class="lab-grid">
                <div class="lab-card" style="grid-column: 1 / -1;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                        <div>
                            <label><strong>輸入數據</strong></label>
                            <textarea rows="3" oninput="this.closest('page-lab').state.cryptoInput = this.value">${this.state.cryptoInput}</textarea>
                            <div class="btn-group">
                                <button class="btn btn-primary" onclick="this.closest('page-lab').generateHash()">SHA-256</button>
                                <button class="btn btn-success" onclick="this.closest('page-lab').encryptData()">執行加密</button>
                                <button class="btn btn-secondary" onclick="this.closest('page-lab').decryptData()" ${!this.state.encryptedData ? 'disabled' : ''}>執行解密</button>
                            </div>
                        </div>
                        <div>
                            <label><strong>運算結果</strong></label>
                            ${this.state.hashResult ? html`<div class="code-block">${this.state.hashResult}</div>` : ''}
                            ${this.state.encryptedData ? html`<div class="code-block">${this.state.encryptedData.ciphertext}</div>` : ''}
                            ${this.state.decryptedResult ? html`<div class="code-block" style="background:#1e4620;">${this.state.decryptedResult}</div>` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <div class="lab-grid" style="margin-top: 2rem;">
                <!-- 文字轉語音 -->
                <div class="lab-card">
                    <h3>🗣️ 文字轉語音 (TTS)</h3>
                    <textarea rows="2" oninput="this.closest('page-lab').state.ttsText = this.value">${this.state.ttsText}</textarea>
                    <button class="btn btn-primary" onclick="this.closest('page-lab').speak()">播放語音</button>
                </div>

                <!-- 語音轉文字 -->
                <div class="lab-card" style="text-align: center;">
                    <h3>🎙️ 語音辨識 (STT)</h3>
                    <button class="mic-btn ${this.state.isListening ? 'active' : ''}" onclick="this.closest('page-lab').toggleListening()">
                        ${this.state.isListening ? '⏹️' : '🎤'}
                    </button>
                    <div style="margin-top: 0.5rem; font-style: italic; font-size: 0.8rem;">
                        ${this.state.transcript || '等待辨識...'}
                    </div>
                </div>
            </div>

            <section style="margin-top: 3rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 教學重點</h3>
                <ul>
                    <li><strong>WebGPU</strong>：現代圖形 API，支援 Compute Shader 進行大規模併行計算。</li>
                    <li><strong>WebAssembly</strong>：展示近乎原生的執行速度與 JS 的互操作性。</li>
                    <li><strong>安全性 (Security)</strong>：Web Crypto API 提供在客戶端安全處理敏感數據的能力。</li>
                </ul>
            </section>
        `;
    }
}
customElements.define('page-lab', LabPage);
