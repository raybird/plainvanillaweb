import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { speechService } from '../../lib/speech-service.js';
import { notificationService } from '../../lib/notification-service.js';
import { cryptoService } from '../../lib/crypto-service.js';
import { wasmService } from '../../lib/wasm-service.js';
import { webgpuService } from '../../lib/webgpu-service.js';
import { webrtcService } from '../../lib/webrtc-service.js';
import { shareService } from '../../lib/share-service.js'; // 引入分享服務
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
            isComputing: false,
            rtcLocalSdp: '',
            rtcRemoteSdp: '',
            rtcStatus: 'Disconnected',
            rtcMessages: [],
            rtcInput: '',
            // 分享狀態
            shareTitle: '🍦 Plain Vanilla Web',
            shareText: '來看看這個超酷的現代原生網頁開發教學平台！',
            shareUrl: window.location.origin
        });
    }

    connectedCallback() {
        super.connectedCallback();
        speechService.addEventListener('result', (e) => {
            this.state.transcript = e.detail.text;
            notificationService.success(`辨識結果: ${e.detail.text}`);
        });
        
        webrtcService.on('message', (data) => {
            this.state.rtcMessages = [...this.state.rtcMessages, { side: 'remote', text: data }];
            notificationService.info('收到 P2P 訊息');
        });
        webrtcService.on('state-change', (state) => this.state.rtcStatus = state);
        webrtcService.on('channel-open', () => notificationService.success('P2P 通道已開啟！'));
    }

    async runShare() {
        try {
            const success = await shareService.share({
                title: this.state.shareTitle,
                text: this.state.shareText,
                url: this.state.shareUrl
            });
            if (success) notificationService.success('分享成功！');
        } catch (err) {
            notificationService.error(err.message);
        }
    }

    async runWasmDemo() {
        if (!this.state.wasmLoaded) {
            await wasmService.loadDemoAdd();
            this.state.wasmLoaded = true;
            notificationService.success('Wasm 模組已載入');
        }
        const exports = wasmService.get('demo-add');
        if (exports && exports.add) {
            this.state.wasmResult = exports.add(this.state.wasmInputA, this.state.wasmInputB);
            notificationService.info(`Wasm 運算完成: ${this.state.wasmResult}`);
        }
    }

    async runWebGPUDemo() {
        try {
            this.state.isComputing = true;
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
                .btn-group { display: flex; gap: 0.5rem; flex-wrap: wrap; }
                .status-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; background: #eee; }
                .status-badge.success { background: #d4edda; color: #155724; }
            </style>

            <h1>🧪 Vanilla 實驗室 (Lab)</h1>
            <p>探索最前沿的原生 Web 技術與實驗性功能。</p>

            <div class="lab-grid">
                <!-- Web Share 單元 -->
                <div class="lab-card">
                    <h3>📱 內容分享 (Web Share)</h3>
                    <p><small>呼叫作業系統原生的分享選單。</small></p>
                    <input type="text" placeholder="標題" value="${this.state.shareTitle}" oninput="this.closest('page-lab').state.shareTitle = this.value">
                    <textarea rows="2" placeholder="內容" oninput="this.closest('page-lab').state.shareText = this.value">${this.state.shareText}</textarea>
                    <button class="btn btn-primary" 
                            ?disabled="${!shareService.isSupported}"
                            onclick="this.closest('page-lab').runShare()">
                        ${shareService.isSupported ? '🚀 立即分享' : '瀏覽器不支援'}
                    </button>
                </div>

                <!-- WebGPU 單元 -->
                <div class="lab-card">
                    <h3>🎮 次世代運算 (WebGPU)</h3>
                    <button class="btn btn-secondary" 
                            ?disabled="${!webgpuService.isSupported || this.state.isComputing}"
                            onclick="this.closest('page-lab').runWebGPUDemo()">
                        執行 GPU 運算
                    </button>
                    ${this.state.gpuResult ? html`<div style="margin-top:1rem; font-size:0.8rem;"><strong>結果:</strong> ${this.state.gpuResult}</div>` : ''}
                </div>
            </div>

            <h2 style="margin-top: 3rem;">📡 P2P 通訊 (WebRTC)</h2>
            <div class="lab-card">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div>
                        <p><small>連線狀態: <strong>${this.state.rtcStatus}</strong></small></p>
                        <textarea rows="2" placeholder="貼上對方的 SDP" oninput="this.closest('page-lab').state.rtcRemoteSdp = this.value"></textarea>
                        <div class="btn-group">
                            <button class="btn btn-primary" onclick="this.closest('page-lab').createRTCOffer()">發起 Offer</button>
                            <button class="btn btn-success" onclick="this.closest('page-lab').acceptRTCAnswer()">套用 Answer</button>
                        </div>
                    </div>
                    <div>
                        <div style="height: 100px; border: 1px solid #eee; padding: 0.5rem; overflow-y: auto; margin-bottom: 0.5rem; font-size: 0.8rem;">
                            ${this.state.rtcMessages.map(m => html`<div>[${m.side}] ${m.text}</div>`)}
                        </div>
                        <input type="text" placeholder="訊息" oninput="this.closest('page-lab').state.rtcInput = this.value">
                    </div>
                </div>
            </div>

            <section style="margin-top: 3rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 教學重點</h3>
                <ul>
                    <li><strong>Web Share</strong>：實現網頁與原生應用的內容互通。</li>
                    <li><strong>WebRTC</strong>：去中心化的點對點通訊架構。</li>
                    <li><strong>Wasm & GPU</strong>：瀏覽器的高效能計算雙雄。</li>
                </ul>
            </section>
        `;
    }
}
customElements.define('page-lab', LabPage);
