import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { speechService } from '../../lib/speech-service.js';
import { notificationService } from '../../lib/notification-service.js';
import { cryptoService } from '../../lib/crypto-service.js';
import { wasmService } from '../../lib/wasm-service.js'; // 引入 Wasm 服務
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
            wasmInputB: 20
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
            </style>

            <h1>🧪 Vanilla 實驗室 (Lab)</h1>
            <p>探索最前沿的原生 Web 技術與實驗性功能。</p>

            <div class="lab-grid">
                <!-- 文字轉語音 -->
                <div class="lab-card">
                    <h3>🗣️ 文字轉語音 (TTS)</h3>
                    <p><small>利用 <code>SpeechSynthesis</code> API 讓網頁開口說話。</small></p>
                    <textarea rows="3" oninput="this.closest('page-lab').state.ttsText = this.value">${this.state.ttsText}</textarea>
                    <button class="btn btn-primary" onclick="this.closest('page-lab').speak()">播放語音</button>
                </div>

                <!-- 語音轉文字 -->
                <div class="lab-card" style="text-align: center;">
                    <h3>🎙️ 語音辨識 (STT)</h3>
                    <p><small>利用 <code>SpeechRecognition</code> API 實作聲控輸入。</small></p>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                        <button class="mic-btn ${this.state.isListening ? 'active' : ''}" onclick="this.closest('page-lab').toggleListening()">
                            ${this.state.isListening ? '⏹️' : '🎤'}
                        </button>
                        <div style="min-height: 2.5rem; font-style: italic; color: #666;">
                            ${this.state.transcript || '辨識結果將顯示在此...'}
                        </div>
                    </div>
                </div>
            </div>

            <h2 style="margin-top: 3rem;">⚙️ 高效能運算 (WebAssembly)</h2>
            <div class="lab-grid">
                <div class="lab-card" style="grid-column: 1 / -1;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                        <div>
                            <p>展示如何在不依賴建置工具的情況下，原生加載並執行 Wasm 模組。本範例使用內嵌的二進位碼來執行 32 位元整數加法。</p>
                            <div style="display: flex; gap: 1rem; align-items: center;">
                                <input type="number" style="margin:0;" value="${this.state.wasmInputA}" oninput="this.closest('page-lab').state.wasmInputA = parseInt(this.value)">
                                <span>+</span>
                                <input type="number" style="margin:0;" value="${this.state.wasmInputB}" oninput="this.closest('page-lab').state.wasmInputB = parseInt(this.value)">
                            </div>
                            <div class="btn-group" style="margin-top: 1rem;">
                                <button class="btn btn-primary" onclick="this.closest('page-lab').runWasmDemo()">執行 Wasm 加法</button>
                            </div>
                        </div>
                        <div>
                            <div class="wasm-box">
                                <strong>運算結果：</strong>
                                <span style="font-size: 1.5rem; color: var(--primary-color); margin-left: 1rem;">
                                    ${this.state.wasmResult !== null ? this.state.wasmResult : '等待執行...'}
                                </span>
                            </div>
                            <div class="code-block" style="font-size: 0.75rem;">
(module <br>
&nbsp;&nbsp;(func $add (param i32 i32) (result i32) <br>
&nbsp;&nbsp;&nbsp;&nbsp;local.get 0 local.get 1 i32.add) <br>
&nbsp;&nbsp;(export "add" (func $add)))
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <h2 style="margin-top: 3rem;">🔐 安全與加密 (Web Crypto)</h2>
            <div class="lab-grid">
                <div class="lab-card" style="grid-column: 1 / -1;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                        <div>
                            <label><strong>輸入數據 (Plaintext)</strong></label>
                            <textarea rows="3" oninput="this.closest('page-lab').state.cryptoInput = this.value">${this.state.cryptoInput}</textarea>
                            
                            <label><strong>加密密碼 (Password)</strong></label>
                            <input type="password" oninput="this.closest('page-lab').state.cryptoPass = this.value" value="${this.state.cryptoPass}">
                            
                            <div class="btn-group">
                                <button class="btn btn-primary" onclick="this.closest('page-lab').generateHash()">生成 SHA-256</button>
                                <button class="btn btn-success" onclick="this.closest('page-lab').encryptData()">執行加密</button>
                                <button class="btn btn-secondary" onclick="this.closest('page-lab').decryptData()" ${!this.state.encryptedData ? 'disabled' : ''}>執行解密</button>
                            </div>
                        </div>
                        <div>
                            <label><strong>運算結果 (Output)</strong></label>
                            ${this.state.hashResult ? html`<div><small>SHA-256:</small><div class="code-block">${this.state.hashResult}</div></div>` : ''}
                            ${this.state.encryptedData ? html`<div><small>加密內容 (Base64):</small><div class="code-block">${this.state.encryptedData.ciphertext}</div></div>` : ''}
                            ${this.state.decryptedResult ? html`<div><small>解密還原:</small><div class="code-block" style="background:#1e4620;">${this.state.decryptedResult}</div></div>` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <h2 style="margin-top: 3rem;">🧩 進階組件組合 (Slots)</h2>
            <div class="lab-grid">
                <ui-card>
                    <span slot="title">🚀 原生插槽演示</span>
                    <button slot="actions" class="btn btn-secondary" onclick="alert('Action Clicked!')" style="font-size: 0.7rem; padding: 4px 8px;">點擊測試</button>
                    
                    <p>這段文字是被分發到「預設插槽」的內容。</p>
                    <div class="code-block">
&lt;ui-card&gt;<br>
&nbsp;&nbsp;&lt;span slot="title"&gt;標題&lt;/span&gt;<br>
&nbsp;&nbsp;&lt;p&gt;內容正文...&lt;/p&gt;<br>
&lt;/ui-card&gt;
                    </div>
                    <em slot="footer">⚡ Powered by BaseComponent 2.2</em>
                </ui-card>

                <div class="lab-card">
                    <h3>💡 為什麼需要它？</h3>
                    <p>在 Vanilla 開發中，透過 2.2 版的內容擷取機制：</p>
                    <ul>
                        <li><strong>保持語義化</strong>：在 HTML 中宣告內容，由組件決定位置。</li>
                        <li><strong>CSS 友善</strong>：非 Shadow DOM 結構讓樣式能直接作用。</li>
                        <li><strong>穩定渲染</strong>：分發的內容在更新時保持穩定。</li>
                    </ul>
                </div>
            </div>

            <section style="margin-top: 3rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 教學重點</h3>
                <ul>
                    <li><strong>WebAssembly</strong>：展示近乎原生的執行速度與 JS 的互操作性。</li>
                    <li><strong>安全性 (Security)</strong>：Web Crypto API 提供在客戶端安全處理敏感數據的能力。</li>
                    <li><strong>無障礙 (A11y)</strong>：語音技術是輔助科技的核心。</li>
                </ul>
            </section>
        `;
    }
}
customElements.define('page-lab', LabPage);
