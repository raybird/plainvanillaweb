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
import { paymentService } from '../../lib/payment-service.js';
import { mediaService } from '../../lib/media-service.js'; // 引入媒體服務
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
            paymentStatus: window.PaymentRequest ? '支援' : '不支援',
            paymentResult: '',
            // 媒體狀態
            isRecording: false,
            recordedBlob: null
        });
        this.videoRef = null;
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
        
        pwaService.on('install-available', () => {
            this.state.canInstall = true;
            notificationService.info('應用程式現在可以安裝至桌面！');
        });
        pwaService.on('installed', () => {
            this.state.canInstall = false;
            notificationService.success('安裝完成！');
        });

        bluetoothService.on('device-selected', (e) => {
            this.state.btDeviceName = e.detail.device.name || '未命名裝置';
            notificationService.success(`已選擇裝置: ${this.state.btDeviceName}`);
        });

        // 媒體事件
        mediaService.on('stream-started', (e) => {
            if (this.videoRef) {
                this.videoRef.srcObject = e.detail.stream;
                this.videoRef.play();
            }
        });
        mediaService.on('recording-stopped', (e) => {
            this.state.isRecording = false;
            this.state.recordedBlob = e.detail.blob;
            if (this.videoRef) this.videoRef.srcObject = null;
            notificationService.success('錄製完成！');
        });
    }

    async runInstall() {
        const outcome = await pwaService.install();
        if (outcome === 'accepted') {
            notificationService.success('感謝您的安裝！');
        }
    }

    async testSync() {
        try {
            await pwaService.registerSync('sync-actions');
            notificationService.success('背景同步已註冊！請試著斷網再恢復連線測試。');
        } catch (err) {
            notificationService.error(err.message);
        }
    }

    async scanBluetooth() {
        if (!bluetoothService.isSupported) {
            notificationService.error('您的瀏覽器不支援 Web Bluetooth');
            return;
        }
        try {
            const device = await bluetoothService.requestDevice();
            this.state.btDeviceName = device.name || '未命名裝置';
        } catch (err) {
            if (err.name !== 'NotFoundError') {
                notificationService.error(`藍牙錯誤: ${err.message}`);
            }
        }
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

    async runPayment() {
        if (!window.PaymentRequest) {
            notificationService.error('瀏覽器不支援 Payment Request');
            return;
        }

        const methods = [{ supportedMethods: 'basic-card' }];
        const details = {
            total: { label: '總計', amount: { currency: 'TWD', value: '100.00' } },
            displayItems: [
                { label: 'Vanilla 課程', amount: { currency: 'TWD', value: '80.00' } },
                { label: '手續費', amount: { currency: 'TWD', value: '20.00' } }
            ]
        };

        try {
            const response = await paymentService.showPayment(methods, details);
            if (response) {
                await response.complete('success');
                this.state.paymentResult = `支付成功！ID: ${response.requestId}`;
                notificationService.success('支付流程完成');
            }
        } catch (err) {
            this.state.paymentResult = `支付取消或失敗: ${err.message}`;
        }
    }

    async startScreenRecord() {
        try {
            const stream = await mediaService.startScreenShare();
            mediaService.startRecording(stream);
            this.state.isRecording = true;
            this.state.recordedBlob = null;
            notificationService.info('正在錄製螢幕...');
        } catch (err) {
            notificationService.error('無法啟動錄製: ' + err.message);
        }
    }

    stopScreenRecord() {
        mediaService.stopRecording();
    }

    downloadRecord() {
        if (this.state.recordedBlob) {
            mediaService.downloadVideo(this.state.recordedBlob);
        }
    }

    async runWasmDemo() {
        if (!this.state.wasmLoaded) {
            await wasmService.loadDemoAdd();
            this.state.wasmLoaded = true;
        }
        const exports = wasmService.get('demo-add');
        if (exports && exports.add) {
            this.state.wasmResult = exports.add(this.state.wasmInputA, this.state.wasmInputB);
        }
    }

    async runWebGPUDemo() {
        try {
            this.state.isComputing = true;
            const data = new Float32Array(1000000).fill(1.5);
            const result = await webgpuService.computeDouble(data);
            this.state.gpuResult = `首項結果: ${result[0]}`;
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
                .video-preview { width: 100%; border-radius: 8px; background: black; margin-top: 1rem; max-height: 200px; }
                
                @media (max-width: 768px) {
                    .lab-grid { gap: 1rem; grid-template-columns: 1fr; }
                    .lab-card { padding: 1rem; }
                    .rtc-grid { grid-template-columns: 1fr !important; gap: 1rem !important; }
                }
            </style>

            <h1>🧪 Vanilla 實驗室 (Lab)</h1>
            <p>探索最前沿的原生 Web 技術與進階 PWA 功能。</p>

            <div class="lab-grid">
                <!-- 螢幕錄製單元 -->
                <div class="lab-card">
                    <h3>🎥 螢幕錄製 (Screen Capture)</h3>
                    <p><small>無需安裝軟體，直接在瀏覽器錄製畫面。</small></p>
                    <div class="btn-group">
                        <button class="btn btn-primary" 
                                ?disabled="${this.state.isRecording}"
                                onclick="this.closest('page-lab').startScreenRecord()">
                            🔴 開始錄影
                        </button>
                        <button class="btn btn-secondary" 
                                ?disabled="${!this.state.isRecording}"
                                onclick="this.closest('page-lab').stopScreenRecord()">
                            ⏹️ 停止
                        </button>
                        <button class="btn btn-success" 
                                ?disabled="${!this.state.recordedBlob}"
                                onclick="this.closest('page-lab').downloadRecord()">
                            💾 下載影片
                        </button>
                    </div>
                    <video class="video-preview" 
                           onloadedmetadata="this.closest('page-lab').videoRef = this" 
                           muted autoplay></video>
                </div>

                <!-- 支付單元 -->
                <div class="lab-card">
                    <h3>💳 原生支付 (Web Payment)</h3>
                    <div style="margin-bottom: 1rem;">
                        狀態: <span class="status-badge ${this.state.paymentStatus === '支援' ? 'success' : ''}">${this.state.paymentStatus}</span>
                    </div>
                    <button class="btn btn-success" onclick="this.closest('page-lab').runPayment()">
                        購買課程 (NT$ 100)
                    </button>
                    ${this.state.paymentResult ? html`<div style="margin-top:1rem; font-size:0.8rem;">${this.state.paymentResult}</div>` : ''}
                </div>
            </div>

            <div class="lab-grid" style="margin-top: 2rem;">
                <div class="lab-card">
                    <h3>📦 安裝與同步 (PWA)</h3>
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

            <h2 style="margin-top: 3rem;">📡 P2P 通訊 (WebRTC)</h2>
            <div class="lab-card">
                <div class="rtc-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div>
                        <textarea rows="2" placeholder="貼上對方的 SDP" oninput="this.closest('page-lab').state.rtcRemoteSdp = this.value"></textarea>
                        <div class="btn-group">
                            <button class="btn btn-primary" onclick="this.closest('page-lab').createRTCOffer()">發起 Offer</button>
                            <button class="btn btn-success" onclick="this.closest('page-lab').acceptRTCAnswer()">套用 Answer</button>
                        </div>
                    </div>
                    <div>
                        <div style="height: 80px; border: 1px solid #eee; padding: 0.5rem; overflow-y: auto; margin-bottom: 0.5rem; font-size: 0.8rem;">
                            ${this.state.rtcMessages.map(m => html`<div>[${m.side}] ${m.text}</div>`)}
                        </div>
                        <input type="text" placeholder="訊息" oninput="this.closest('page-lab').state.rtcInput = this.value">
                    </div>
                </div>
            </div>

            <div class="lab-grid" style="margin-top: 2rem;">
                <div class="lab-card">
                    <h3>🎮 次世代運算 (WebGPU)</h3>
                    <button class="btn btn-secondary" onclick="this.closest('page-lab').runWebGPUDemo()">執行 GPU 運算</button>
                </div>
                <div class="lab-card">
                    <h3>⚙️ 高效能運算 (Wasm)</h3>
                    <button class="btn btn-secondary" onclick="this.closest('page-lab').runWasmDemo()">執行 Wasm 加法</button>
                </div>
            </div>

            <section style="margin-top: 3rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 教學重點</h3>
                <ul>
                    <li><strong>Media Streams</strong>：原生擷取螢幕畫面與錄製。</li>
                    <li><strong>Web Payment</strong>：標準化的瀏覽器原生結帳流程。</li>
                    <li><strong>Web Bluetooth</strong>：網頁與實體硬體 (BLE) 的直接通訊。</li>
                </ul>
            </section>
        `;
    }
}
customElements.define('page-lab', LabPage);
