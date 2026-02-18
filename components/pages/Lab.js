import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { speechService } from '../../lib/speech-service.js';
import { notificationService } from '../../lib/notification-service.js';
import { cryptoService } from '../../lib/crypto-service.js';
import { wasmService } from '../../lib/wasm-service.js';
import { webgpuService } from '../../lib/webgpu-service.js';
import { webrtcService } from '../../lib/webrtc-service.js'; // 引入 WebRTC 服務
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
            // WebRTC 狀態
            rtcLocalSdp: '',
            rtcRemoteSdp: '',
            rtcStatus: 'Disconnected',
            rtcMessages: [],
            rtcInput: ''
        });
        this.handleRTCMessage = this.handleRTCMessage.bind(this);
        this.handleRTCState = this.handleRTCState.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        speechService.addEventListener('result', (e) => {
            this.state.transcript = e.detail.text;
            notificationService.success(`辨識結果: ${e.detail.text}`);
        });
        
        // WebRTC 事件監聽
        webrtcService.on('message', (data) => this.handleRTCMessage(data));
        webrtcService.on('state-change', (state) => this.state.rtcStatus = state);
        webrtcService.on('channel-open', () => notificationService.success('P2P 通道已開啟！'));
    }

    handleRTCMessage(data) {
        this.state.rtcMessages = [...this.state.rtcMessages, { side: 'remote', text: data }];
        notificationService.info('收到 P2P 訊息');
    }

    async createRTCOffer() {
        const offer = await webrtcService.createOffer();
        // 延遲一下等待 Ice 收集 (簡單實作)
        setTimeout(() => {
            this.state.rtcLocalSdp = JSON.stringify(webrtcService.getLocalDescription());
        }, 500);
    }

    async acceptRTCOffer() {
        try {
            const offer = JSON.parse(this.state.rtcRemoteSdp);
            const answer = await webrtcService.createAnswer(offer);
            setTimeout(() => {
                this.state.rtcLocalSdp = JSON.stringify(webrtcService.getLocalDescription());
            }, 500);
        } catch (err) {
            notificationService.error('無效的 Offer SDP');
        }
    }

    async acceptRTCAnswer() {
        try {
            const answer = JSON.parse(this.state.rtcRemoteSdp);
            await webrtcService.setAnswer(answer);
            notificationService.success('Answer 已套用');
        } catch (err) {
            notificationService.error('無效的 Answer SDP');
        }
    }

    sendRTCMessage() {
        if (!this.state.rtcInput) return;
        webrtcService.send(this.state.rtcInput);
        this.state.rtcMessages = [...this.state.rtcMessages, { side: 'local', text: this.state.rtcInput }];
        this.state.rtcInput = '';
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
                .code-block { background: #272822; color: #f8f8f2; padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.7rem; overflow-x: auto; margin: 1rem 0; word-break: break-all; max-height: 150px; }
                .btn-group { display: flex; gap: 0.5rem; flex-wrap: wrap; }
                .chat-box { height: 200px; border: 1px solid #eee; border-radius: 8px; overflow-y: auto; padding: 1rem; margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
                .msg { padding: 5px 10px; border-radius: 15px; max-width: 80%; font-size: 0.9rem; }
                .msg.local { align-self: flex-end; background: var(--primary-color); color: white; }
                .msg.remote { align-self: flex-start; background: #e9ecef; }
            </style>

            <h1>🧪 Vanilla 實驗室 (Lab)</h1>
            <p>探索最前沿的原生 Web 技術與實驗性功能。</p>

            <h2 style="margin-top: 2rem;">📡 P2P 通訊 (WebRTC)</h2>
            <div class="lab-grid">
                <div class="lab-card" style="grid-column: 1 / -1;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                        <div>
                            <h4>1. 信令交換 (Signaling)</h4>
                            <p><small>手動複製本地 SDP 給對方，並貼上對方的 SDP 以建立連線。</small></p>
                            <label><strong>我的 SDP (給對方)</strong></label>
                            <textarea rows="3" readonly onclick="this.select()">${this.state.rtcLocalSdp}</textarea>
                            
                            <label><strong>對方的 SDP (貼在此)</strong></label>
                            <textarea rows="3" oninput="this.closest('page-lab').state.rtcRemoteSdp = this.value">${this.state.rtcRemoteSdp}</textarea>
                            
                            <div class="btn-group">
                                <button class="btn btn-primary" onclick="this.closest('page-lab').createRTCOffer()">發起 Offer</button>
                                <button class="btn btn-success" onclick="this.closest('page-lab').acceptRTCOffer()">接受 Offer 並生成 Answer</button>
                                <button class="btn btn-secondary" onclick="this.closest('page-lab').acceptRTCAnswer()">套用 Answer</button>
                            </div>
                        </div>
                        <div>
                            <h4>2. 即時通訊展示</h4>
                            <div style="margin-bottom: 0.5rem;">連線狀態: <strong>${this.state.rtcStatus}</strong></div>
                            <div class="chat-box">
                                ${this.state.rtcMessages.map(m => html`<div class="msg ${m.side}">${m.text}</div>`)}
                                ${this.state.rtcMessages.length === 0 ? html`<div style="color:#ccc;text-align:center;margin-top:2rem;">連線成功後在此聊天</div>` : ''}
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <input type="text" placeholder="輸入訊息..." 
                                       value="${this.state.rtcInput}"
                                       oninput="this.closest('page-lab').state.rtcInput = this.value"
                                       onkeyup="if(event.key==='Enter') this.closest('page-lab').sendRTCMessage()">
                                <button class="btn btn-primary" onclick="this.closest('page-lab').sendRTCMessage()" style="white-space:nowrap;">發送</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="lab-grid" style="margin-top: 3rem;">
                <div class="lab-card">
                    <h3>🎮 次世代運算 (WebGPU)</h3>
                    <button class="btn btn-primary" onclick="this.closest('page-lab').runWebGPUDemo()">執行 GPU 運算</button>
                    ${this.state.gpuResult ? html`<div class="wasm-box"><strong>結果:</strong> ${this.state.gpuResult}</div>` : ''}
                </div>

                <div class="lab-card">
                    <h3>⚙️ 高效能運算 (Wasm)</h3>
                    <button class="btn btn-secondary" onclick="this.closest('page-lab').runWasmDemo()">執行 Wasm 加法</button>
                    ${this.state.wasmResult !== null ? html`<div class="wasm-box"><strong>結果:</strong> ${this.state.wasmResult}</div>` : ''}
                </div>
            </div>

            <h2 style="margin-top: 3rem;">🔐 安全與加密 (Web Crypto)</h2>
            <div class="lab-card">
                <textarea rows="2" oninput="this.closest('page-lab').state.cryptoInput = this.value">${this.state.cryptoInput}</textarea>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="this.closest('page-lab').generateHash()">SHA-256</button>
                    <button class="btn btn-success" onclick="this.closest('page-lab').encryptData()">加密</button>
                    <button class="btn btn-secondary" onclick="this.closest('page-lab').decryptData()">解密</button>
                </div>
            </div>

            <section style="margin-top: 3rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 教學重點</h3>
                <ul>
                    <li><strong>WebRTC</strong>：瀏覽器間的點對點加密通訊，不需伺服器轉發數據。</li>
                    <li><strong>WebGPU</strong>：現代圖形 API，支援大規模併行計算。</li>
                    <li><strong>WebAssembly</strong>：展示近乎原生的執行速度與 JS 的互操作性。</li>
                </ul>
            </section>
        `;
    }
}
customElements.define('page-lab', LabPage);
