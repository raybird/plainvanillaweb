import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { speechService } from '../../lib/speech-service.js';
import { notificationService } from '../../lib/notification-service.js';
import { cryptoService } from '../../lib/crypto-service.js';
import { wasmService } from '../../lib/wasm-service.js';
import { webgpuService } from '../../lib/webgpu-service.js';
import { webrtcService } from '../../lib/webrtc-service.js';
import { shareService } from '../../lib/share-service.js';
import { pwaService } from '../../lib/pwa-service.js';
import { bluetoothService } from '../../lib/bluetooth-service.js';
import { mediaService } from '../../lib/media-service.js';
import { paymentService } from '../../lib/payment-service.js'; // 引入支付服務
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
            shareTitle: '🍦 Plain Vanilla Web',
            shareText: '來看看這個超酷的現代原生網頁開發教學平台！',
            shareUrl: window.location.origin,
            canInstall: pwaService.canInstall,
            btDeviceName: '',
            btStatus: bluetoothService.isSupported ? '可用' : '不支援',
            isRecordingScreen: false,
            recordedVideoUrl: null,
            // 支付狀態
            cartItems: [
                { label: 'Vanilla JS 課程', amount: { currency: 'USD', value: '10.00' } },
                { label: '進階 PWA 指南', amount: { currency: 'USD', value: '5.00' } }
            ]
        });
    }

    connectedCallback() {
        super.connectedCallback();
        // ... (省略既有事件監聽) ...
        speechService.addEventListener('result', (e) => { this.state.transcript = e.detail.text; notificationService.success(`辨識結果: ${e.detail.text}`); });
        webrtcService.on('message', (data) => { this.state.rtcMessages = [...this.state.rtcMessages, { side: 'remote', text: data }]; notificationService.info('收到 P2P 訊息'); });
        webrtcService.on('state-change', (state) => this.state.rtcStatus = state);
        pwaService.on('install-available', () => { this.state.canInstall = true; notificationService.info('應用程式現在可以安裝至桌面！'); });
        pwaService.on('installed', () => { this.state.canInstall = false; notificationService.success('安裝完成！'); });
        bluetoothService.on('device-selected', (e) => { this.state.btDeviceName = e.detail.device.name || '未命名裝置'; notificationService.success(`已選擇裝置: ${this.state.btDeviceName}`); });
        mediaService.on('stream-started', (e) => { const video = this.querySelector('#previewVideo'); if (video) { video.srcObject = e.detail.stream; video.play(); } mediaService.startRecording(); });
        mediaService.on('recording-started', () => { this.state.isRecordingScreen = true; notificationService.info('開始錄製螢幕...'); });
        mediaService.on('recording-finished', (e) => { this.state.isRecordingScreen = false; this.state.recordedVideoUrl = e.detail.url; notificationService.success('錄製完成！'); });
        mediaService.on('stream-stopped', () => { this.state.isRecordingScreen = false; const video = this.querySelector('#previewVideo'); if (video) video.srcObject = null; });
        
        // 支付事件
        paymentService.on('payment-success', (e) => {
            notificationService.success(`支付成功！感謝 ${e.detail.payer}`);
        });
    }

    // ... (省略既有方法) ...
    async runInstall() { const outcome = await pwaService.install(); if (outcome === 'accepted') notificationService.success('感謝您的安裝！'); }
    async testSync() { try { await pwaService.registerSync('sync-actions'); notificationService.success('背景同步已註冊！'); } catch (err) { notificationService.error(err.message); } }
    async scanBluetooth() { if (!bluetoothService.isSupported) { notificationService.error('不支援 Web Bluetooth'); return; } try { const device = await bluetoothService.requestDevice(); this.state.btDeviceName = device.name || '未命名裝置'; } catch (err) { if (err.name !== 'NotFoundError') notificationService.error(`藍牙錯誤: ${err.message}`); } }
    async runShare() { try { const success = await shareService.share({ title: this.state.shareTitle, text: this.state.shareText, url: this.state.shareUrl }); if (success) notificationService.success('分享成功！'); } catch (err) { notificationService.error(err.message); } }
    async runWasmDemo() { if (!this.state.wasmLoaded) { await wasmService.loadDemoAdd(); this.state.wasmLoaded = true; } const exports = wasmService.get('demo-add'); if (exports && exports.add) { this.state.wasmResult = exports.add(this.state.wasmInputA, this.state.wasmInputB); } }
    async runWebGPUDemo() { try { this.state.isComputing = true; const data = new Float32Array(1000000).fill(1.5); const result = await webgpuService.computeDouble(data); this.state.gpuResult = `首項結果: ${result[0]}`; this.state.isComputing = false; notificationService.success('WebGPU 運算完成！'); } catch (err) { this.state.isComputing = false; notificationService.error(`WebGPU 錯誤: ${err.message}`); } }
    toggleScreenRecording() { if (this.state.isRecordingScreen) { mediaService.stop(); } else { mediaService.startScreenCapture().catch(() => notificationService.warn('已取消分享')); } }
    
    // WebRTC Methods
    async createRTCOffer() { const offer = await webrtcService.createOffer(); setTimeout(() => { this.state.rtcLocalSdp = JSON.stringify(webrtcService.getLocalDescription()); }, 500); }
    async acceptRTCOffer() { try { const offer = JSON.parse(this.state.rtcRemoteSdp); await webrtcService.createAnswer(offer); setTimeout(() => { this.state.rtcLocalSdp = JSON.stringify(webrtcService.getLocalDescription()); }, 500); } catch (err) { notificationService.error('無效的 Offer SDP'); } }
    async acceptRTCAnswer() { try { const answer = JSON.parse(this.state.rtcRemoteSdp); await webrtcService.setAnswer(answer); notificationService.success('Answer 已套用'); } catch (err) { notificationService.error('無效的 Answer SDP'); } }
    sendRTCMessage() { if (!this.state.rtcInput) return; webrtcService.send(this.state.rtcInput); this.state.rtcMessages = [...this.state.rtcMessages, { side: 'local', text: this.state.rtcInput }]; this.state.rtcInput = ''; }

    // Payment Methods
    async runCheckout() {
        try {
            await paymentService.checkout(this.state.cartItems);
        } catch (err) {
            notificationService.warn('結帳取消或失敗');
        }
    }

    render() {
        return html`
            <style>
                /* ... (保留既有樣式) ... */
                .lab-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; }
                .lab-card { border: 1px solid #ddd; padding: 1.5rem; border-radius: 12px; background: var(--bg-color); }
                textarea, input { width: 100%; padding: 0.5rem; border-radius: 8px; border: 1px solid #ccc; margin-bottom: 1rem; box-sizing: border-box; }
                .btn-group { display: flex; gap: 0.5rem; flex-wrap: wrap; }
                .status-badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; background: #eee; }
                .status-badge.success { background: #d4edda; color: #155724; }
                .chat-box { height: 80px; border: 1px solid #eee; padding: 0.5rem; overflow-y: auto; margin-bottom: 0.5rem; font-size: 0.8rem; }
                .rec-dot { display: inline-block; width: 10px; height: 10px; background: red; border-radius: 50%; margin-right: 5px; animation: blink 1s infinite; }
                @keyframes blink { 50% { opacity: 0; } }
                video { width: 100%; border-radius: 8px; background: #000; margin-top: 1rem; }
                .item-row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; border-bottom: 1px dashed #eee; padding-bottom: 0.2rem; }
            </style>

            <h1>🧪 Vanilla 實驗室 (Lab)</h1>
            <p>探索最前沿的原生 Web 技術與進階 PWA 功能。</p>

            <div class="lab-grid">
                <!-- 原生結帳單元 -->
                <div class="lab-card">
                    <h3>💳 原生結帳 (Payment Request)</h3>
                    <p><small>呼叫瀏覽器標準化的支付介面。</small></p>
                    <div style="background: #f9f9f9; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                        ${this.state.cartItems.map(item => html`
                            <div class="item-row">
                                <span>${item.label}</span>
                                <strong>$${item.amount.value}</strong>
                            </div>
                        `)}
                        <div style="text-align: right; margin-top: 0.5rem; font-size: 1.1rem;">
                            總計: <strong>$15.00</strong>
                        </div>
                    </div>
                    <button class="btn btn-success" 
                            style="width: 100%;"
                            ?disabled="${!paymentService.isSupported}"
                            onclick="this.closest('page-lab').runCheckout()">
                        ${paymentService.isSupported ? '💳 立即結帳' : '不支援 Payment API'}
                    </button>
                </div>

                <!-- 螢幕錄製單元 -->
                <div class="lab-card">
                    <h3>🎥 螢幕錄製 (Screen Recorder)</h3>
                    <button class="btn ${this.state.isRecordingScreen ? 'btn-danger' : 'btn-primary'}" 
                            onclick="this.closest('page-lab').toggleScreenRecording()">
                        ${this.state.isRecordingScreen ? html`<span class="rec-dot"></span> 停止錄製` : '🔴 開始錄影'}
                    </button>
                    ${this.state.recordedVideoUrl ? html`
                        <div style="margin-top: 1rem;">
                            <a href="${this.state.recordedVideoUrl}" download="recording.webm" class="btn btn-success" style="font-size: 0.8rem; padding: 4px 8px;">💾 下載影片</a>
                        </div>
                    ` : ''}
                    <video id="previewVideo" muted style="display: ${this.state.isRecordingScreen ? 'block' : 'none'}; height: 150px; object-fit: cover;"></video>
                </div>
            </div>

            <!-- ... (保留既有區塊: PWA, Web Share, WebRTC, WebGPU, Wasm) ... -->
            
            <div class="lab-grid" style="margin-top: 2rem;">
                <div class="lab-card">
                    <h3>📦 安裝與同步 (PWA Advanced)</h3>
                    <div class="btn-group">
                        <button class="btn btn-primary" 
                                ?disabled="${!this.state.canInstall}"
                                onclick="this.closest('page-lab').runInstall()">
                            📥 安裝應用
                        </button>
                        <button class="btn btn-secondary" onclick="this.closest('page-lab').testSync()">測試同步</button>
                    </div>
                </div>
                <div class="lab-card">
                    <h3>📱 內容分享 (Web Share)</h3>
                    <button class="btn btn-primary" onclick="this.closest('page-lab').runShare()">🚀 立即分享</button>
                </div>
            </div>

            <div class="lab-grid" style="margin-top: 2rem;">
                <div class="lab-card">
                    <h3>📡 藍牙通訊 (Web Bluetooth)</h3>
                    <div style="margin-bottom: 1rem;">
                        狀態: <span class="status-badge ${bluetoothService.isSupported ? 'success' : ''}">${this.state.btStatus}</span>
                    </div>
                    <button class="btn btn-primary" 
                            ?disabled="${!bluetoothService.isSupported}"
                            onclick="this.closest('page-lab').scanBluetooth()">
                        🔍 掃描裝置
                    </button>
                    ${this.state.btDeviceName ? html`<div style="margin-top:0.5rem; font-size:0.8rem;">已選: ${this.state.btDeviceName}</div>` : ''}
                </div>
                
                <div class="lab-card">
                    <h3>🎮 次世代運算 (WebGPU)</h3>
                    <button class="btn btn-secondary" onclick="this.closest('page-lab').runWebGPUDemo()">執行 GPU 運算</button>
                </div>
            </div>

            <h2 style="margin-top: 3rem;">📡 P2P 通訊 (WebRTC)</h2>
            <div class="lab-card">
                <!-- ... (保留 WebRTC 內容) ... -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div>
                        <textarea rows="2" placeholder="貼上對方的 SDP" oninput="this.closest('page-lab').state.rtcRemoteSdp = this.value"></textarea>
                        <div class="btn-group">
                            <button class="btn btn-primary" onclick="this.closest('page-lab').createRTCOffer()">發起 Offer</button>
                            <button class="btn btn-success" onclick="this.closest('page-lab').acceptRTCAnswer()">套用 Answer</button>
                        </div>
                    </div>
                    <div>
                        <div class="chat-box">
                            ${this.state.rtcMessages.map(m => html`<div>[${m.side}] ${m.text}</div>`)}
                        </div>
                        <input type="text" placeholder="訊息" oninput="this.closest('page-lab').state.rtcInput = this.value">
                        <button style="margin-top: 0.5rem;" class="btn btn-secondary" onclick="this.closest('page-lab').sendRTCMessage()">發送</button>
                    </div>
                </div>
            </div>

            <section style="margin-top: 3rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 教學重點</h3>
                <ul>
                    <li><strong>Payment Request</strong>：標準化的瀏覽器原生結帳流程。</li>
                    <li><strong>Screen Capture</strong>：原生媒體串流擷取與錄製。</li>
                    <li><strong>Web Bluetooth</strong>：網頁與實體硬體 (BLE) 的直接通訊。</li>
                </ul>
            </section>
        `;
    }
}
customElements.define('page-lab', LabPage);
