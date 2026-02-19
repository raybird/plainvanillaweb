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
import { paymentService } from '../../lib/payment-service.js'; 
import { compressionService } from '../../lib/compression-service.js';
import { streamProcessorService } from '../../lib/stream-processor-service.js';
import { serialService } from '../../lib/serial-service.js';
import { FormGroup, FormControl, Validators } from '../../lib/form-engine.js';
import { crdtService } from '../../lib/crdt-service.js';
import '../ui/Card.js';
import '../ui/IsolatedCard.js';

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
            compressInput: '這是一段需要被壓縮的長文字，原生 API 支援 Gzip, Deflate 等格式。'.repeat(5),
            compressedBlob: null,
            compressionRatio: 0,
            cartItems: [
                { label: 'Vanilla JS 課程', amount: { currency: 'USD', value: '10.00' } },
                { label: '進階 PWA 指南', amount: { currency: 'USD', value: '5.00' } }
            ],
            collabNote: '',
            crdtStatus: 'Active (Node: ' + crdtService.nodeId + ')',
            registrationForm: {
                username: { valid: true, pending: false, touched: false, errors: null },
                email: { valid: true, touched: false, errors: null },
                formValid: false
            },
            isProcessingStream: false,
            currentFilter: 'none',
            streamStatus: streamProcessorService.isSupported ? '支援' : '不支援',
            isSerialConnected: false,
            serialLogs: [],
            serialBaud: 9600,
            serialInput: '',
            serialStatus: serialService.isSupported ? '支援' : '不支援'
        });

        this.form = new FormGroup({
            username: new FormControl('', [Validators.required, Validators.minLen(3)], [
                async (val) => {
                    await new Promise(r => setTimeout(r, 1000));
                    return val === 'admin' ? { duplicated: true } : null;
                }
            ]),
            email: new FormControl('', [Validators.required, Validators.email]),
            password: new FormControl('', [Validators.required, Validators.minLen(6)])
        });

        this.videoRef = null;
    }

    connectedCallback() {
        super.connectedCallback();
        
        // 協作事件
        crdtService.on('change', (data) => {
            if (data.id === 'lab-note') {
                this.state.collabNote = data.value;
            }
        });

        // 監聽表單狀態變動... (其餘保持不變)
        
        speechService.on('result', (data) => { this.state.transcript = data.text; notificationService.success(`辨識結果: ${data.text}`); });
        webrtcService.on('message', (data) => { this.state.rtcMessages = [...this.state.rtcMessages, { side: 'remote', text: data }]; notificationService.info('收到 P2P 訊息'); });
        webrtcService.on('state-change', (state) => this.state.rtcStatus = state);
        pwaService.on('install-available', () => { this.state.canInstall = true; notificationService.info('應用程式現在可以安裝至桌面！'); });
        pwaService.on('installed', () => { this.state.canInstall = false; notificationService.success('安裝完成！'); });
        bluetoothService.on('device-selected', (e) => { this.state.btDeviceName = e.detail.device.name || '未命名裝置'; notificationService.success(`已選擇裝置: ${this.state.btDeviceName}`); });
        
        // 媒體事件
        mediaService.on('stream-started', async (e) => { 
            this.videoRef = this.querySelector('#previewVideo');
            if (this.videoRef) { 
                this.videoRef.srcObject = e.detail.stream; 
                try {
                    await this.videoRef.play();
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.warn('[MediaService] 預覽播放異常:', err.message);
                    }
                }
            } 
            mediaService.startRecording(); 
        });
        mediaService.on('recording-started', () => { this.state.isRecordingScreen = true; notificationService.info('開始錄製螢幕...'); });
        mediaService.on('recording-stopped', (e) => { 
            this.state.isRecordingScreen = false; 
            this.state.recordedVideoUrl = URL.createObjectURL(e.detail.blob); 
            if (this.videoRef) this.videoRef.srcObject = null;
            notificationService.success('錄製完成！'); 
        });
        
        // 支付事件
        paymentService.on('payment-success', (e) => {
            e.detail.response.complete('success');
            notificationService.success(`支付成功！ID: ${e.detail.response.requestId}`);
        });
        paymentService.on('payment-cancelled', () => {
            notificationService.warn('支付已取消');
        });
    }

    async runInstall() { const outcome = await pwaService.install(); if (outcome === 'accepted') notificationService.success('感謝您的安裝！'); }
    async testSync() { try { await pwaService.registerSync('sync-actions'); notificationService.success('背景同步已註冊！'); } catch (err) { notificationService.error(err.message); } }
    async scanBluetooth() { if (!bluetoothService.isSupported) { notificationService.error('不支援 Web Bluetooth'); return; } try { const device = await bluetoothService.requestDevice(); this.state.btDeviceName = device.name || '未命名裝置'; } catch (err) { if (err.name !== 'NotFoundError') notificationService.error(`藍牙錯誤: ${err.message}`); } }
    async runShare() { try { const success = await shareService.share({ title: this.state.shareTitle, text: this.state.shareText, url: this.state.shareUrl }); if (success) notificationService.success('分享成功！'); } catch (err) { notificationService.error(err.message); } }
    async runWasmDemo() { if (!this.state.wasmLoaded) { await wasmService.loadDemoAdd(); this.state.wasmLoaded = true; } const exports = wasmService.get('demo-add'); if (exports && exports.add) { this.state.wasmResult = exports.add(this.state.wasmInputA, this.state.wasmInputB); } }
    async runWebGPUDemo() { try { this.state.isComputing = true; const data = new Float32Array(1000000).fill(1.5); const result = await webgpuService.computeDouble(data); this.state.gpuResult = `首項結果: ${result[0]}`; this.state.isComputing = false; notificationService.success('WebGPU 運算完成！'); } catch (err) { this.state.isComputing = false; notificationService.error(`WebGPU 錯誤: ${err.message}`); } }
    
    toggleScreenRecording() { 
        if (this.state.isRecordingScreen) { 
            mediaService.stopRecording(); 
        } else { 
            mediaService.startScreenShare().catch(() => notificationService.warn('已取消分享')); 
        } 
    }
    
    // WebRTC Methods
    async createRTCOffer() { try { const offer = await webrtcService.createOffer(); this.state.rtcLocalSdp = JSON.stringify(offer); notificationService.info('Offer 已生成'); } catch(e) { notificationService.error(e.message); } }
    async acceptRTCOffer() { try { const offer = JSON.parse(this.state.rtcRemoteSdp); const answer = await webrtcService.createAnswer(offer); this.state.rtcLocalSdp = JSON.stringify(answer); notificationService.success('Answer 已生成'); } catch (err) { notificationService.error('無效的 Offer SDP'); } }
    async acceptRTCAnswer() { try { const answer = JSON.parse(this.state.rtcRemoteSdp); await webrtcService.setAnswer(answer); notificationService.success('Answer 已套用'); } catch (err) { notificationService.error('無效的 Answer SDP'); } }
    sendRTCMessage() { if (!this.state.rtcInput) return; webrtcService.send(this.state.rtcInput); this.state.rtcMessages = [...this.state.rtcMessages, { side: 'local', text: this.state.rtcInput }]; this.state.rtcInput = ''; }

    // Speech Methods
    speak() {
        if (!this.state.ttsText) return;
        speechService.speak(this.state.ttsText);
    }

    toggleSpeechRecognition() {
        if (this.state.isListening) {
            speechService.stopListening();
            this.state.isListening = false;
        } else {
            try {
                speechService.startListening();
                this.state.isListening = true;
                notificationService.info('正在傾聽...');
            } catch (err) {
                notificationService.error(err.message);
            }
        }
    }

    // Crypto Methods
    async runEncrypt() {
        try {
            this.state.encryptedData = await cryptoService.encrypt(this.state.cryptoInput, this.state.cryptoPass);
            notificationService.success('加密成功');
        } catch (err) {
            notificationService.error('加密失敗');
        }
    }

    async runDecrypt() {
        if (!this.state.encryptedData) return;
        try {
            this.state.decryptedResult = await cryptoService.decrypt(this.state.encryptedData, this.state.cryptoPass);
            notificationService.success('解密成功');
        } catch (err) {
            notificationService.error('解密失敗，請檢查密碼');
        }
    }

    async runHash() {
        this.state.hashResult = await cryptoService.hash(this.state.cryptoInput);
    }

    // Compression Methods
    async runCompress() {
        if (!this.state.compressInput) return;
        try {
            const originalSize = new Blob([this.state.compressInput]).size;
            const compressed = await compressionService.compress(this.state.compressInput);
            this.state.compressedBlob = compressed;
            this.state.compressionRatio = Math.round((compressed.length / originalSize) * 100);
            notificationService.success(`壓縮完成！節省了 ${100 - this.state.compressionRatio}% 的空間`);
        } catch (err) {
            notificationService.error(`壓縮失敗: ${err.message}`);
        }
    }

    async runDecompress() {
        if (!this.state.compressedBlob) return;
        try {
            const decompressed = await compressionService.decompress(this.state.compressedBlob);
            this.state.compressInput = decompressed;
            notificationService.success('解壓縮完成！');
        } catch (err) {
            notificationService.error(`解壓縮失敗: ${err.message}`);
        }
    }

    // Payment Methods
    async runCheckout() {
        if (!window.PaymentRequest) {
            notificationService.error('瀏覽器不支援 Payment Request');
            return;
        }
        const methods = [{ supportedMethods: 'basic-card' }];
        const details = {
            total: { label: '總計', amount: { currency: 'USD', value: '15.00' } },
            displayItems: this.state.cartItems
        };
        try {
            await paymentService.showPayment(methods, details);
        } catch (err) {
            // Error handled in event listener or here
        }
    }

    async toggleLiveFilter() {
        if (this.state.isProcessingStream) {
            this.stopLiveStream();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoTrack = stream.getVideoTracks()[0];
            
            const transformer = streamProcessorService.createCanvasTransformer(this.state.currentFilter);
            const processedStream = streamProcessorService.process(videoTrack, transformer);
            
            const videoEl = this.querySelector('#processedVideo');
            if (videoEl) {
                videoEl.srcObject = processedStream;
                // 處理 play() Promise 以避免中斷錯誤
                try {
                    await videoEl.play();
                } catch (playErr) {
                    if (playErr.name === 'AbortError' || playErr.name === 'NotAllowedError') {
                        console.warn('[StreamProcessor] 播放被中斷或未授權:', playErr.message);
                    } else {
                        throw playErr;
                    }
                }
            }
            
            this.state.isProcessingStream = true;
            notificationService.success('即時濾鏡已啟動');
        } catch (err) {
            notificationService.error(`擷取失敗: ${err.message}`);
        }
    }

    stopLiveStream() {
        streamProcessorService.stop();
        const videoEl = this.querySelector('#processedVideo');
        if (videoEl && videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(t => t.stop());
            videoEl.srcObject = null;
        }
        this.state.isProcessingStream = false;
    }

    changeFilter(filter) {
        this.state.currentFilter = filter;
        if (this.state.isProcessingStream) {
            // 重新啟動以套用新濾鏡 (簡化實作)
            this.stopLiveStream();
            this.toggleLiveFilter();
        }
    }

    async runSerialConnect() {
        if (this.state.isSerialConnected) {
            await serialService.disconnect();
            return;
        }
        try {
            await serialService.connect(this.state.serialBaud);
        } catch (err) {
            if (err.name !== 'NotFoundError') notificationService.error(err.message);
        }
    }

    async sendSerialCommand() {
        if (!this.state.serialInput) return;
        await serialService.write(this.state.serialInput + '\n');
        this.state.serialInput = '';
    }

    handleFormInput(field, value) {
        this.form.controls[field].value = value;
    }

    submitForm() {
        this.form.validateAll();
        if (this.form.valid) {
            notificationService.success('表單驗證成功！數據已準備好發送。');
            console.log('[Form Success]', this.form.value);
        } else {
            notificationService.error('表單包含錯誤，請檢查紅框欄位。');
        }
    }

    resetForm() {
        // 簡單重置實作
        window.location.reload();
    }

    handleCollabInput(value) {
        crdtService.update('lab-note', value);
    }

    render() {
        // ... (保持前面 HTML 內容)
        return html`
            <style>
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
                
                @media (max-width: 768px) {
                    .lab-grid { gap: 1rem; grid-template-columns: 1fr; }
                    .lab-card { padding: 1rem; }
                    .rtc-grid { grid-template-columns: 1fr !important; gap: 1rem !important; }
                }
            </style>

            <h1>🧪 Vanilla 實驗室 (Lab)</h1>
            <p>探索最前沿的原生 Web 技術與進階 PWA 功能。</p>

            <div class="lab-grid">
                <!-- 原生語音單元 (TTS & STT) -->
                <div class="lab-card">
                    <h3>🗣️ 原生語音 (Speech API)</h3>
                    <p><small>文字轉語音 (TTS) 與 語音辨識 (STT)。</small></p>
                    <textarea placeholder="輸入要發音的文字..." 
                              oninput="this.closest('page-lab').state.ttsText = this.value">${this.state.ttsText}</textarea>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="this.closest('page-lab').speak()">🔊 朗讀文字</button>
                        <button class="btn ${this.state.isListening ? 'btn-danger' : 'btn-secondary'}" 
                                ?disabled="${!speechService.isRecognitionSupported}"
                                onclick="this.closest('page-lab').toggleSpeechRecognition()">
                            ${this.state.isListening ? '⏹️ 停止辨識' : '🎤 開始辨識'}
                        </button>
                    </div>
                    ${!speechService.isRecognitionSupported ? html`<p style="color:red; font-size:0.7rem; margin-top:0.5rem;">⚠️ 您的瀏覽器不支援語音辨識 (建議使用 Chrome/Edge)</p>` : ''}
                    ${this.state.transcript ? html`<div style="margin-top:1rem; font-size:0.9rem; border-top:1px solid #eee; padding-top:0.5rem;">辨識結果: <strong>${this.state.transcript}</strong></div>` : ''}
                </div>

                <!-- WebAssembly 單元 -->
                <div class="lab-card">
                    <h3>⚡ 高效能運算 (WebAssembly)</h3>
                    <p><small>呼叫編譯自 C/Rust 的 WASM 模組。</small></p>
                    <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                        <input type="number" placeholder="A" oninput="this.closest('page-lab').state.wasmInputA = Number(this.value)" value="${this.state.wasmInputA}">
                        <span>+</span>
                        <input type="number" placeholder="B" oninput="this.closest('page-lab').state.wasmInputB = Number(this.value)" value="${this.state.wasmInputB}">
                    </div>
                    <button class="btn btn-primary" onclick="this.closest('page-lab').runWasmDemo()">執行 WASM 加法</button>
                    ${this.state.wasmResult !== null ? html`<div style="margin-top:1rem;">結果: <strong>${this.state.wasmResult}</strong></div>` : ''}
                </div>
            </div>

            <div class="lab-grid" style="margin-top: 2rem;">
                <!-- 原生加密單元 -->
                <div class="lab-card">
                    <h3>🔐 原生加密 (SubtleCrypto)</h3>
                    <p><small>基於瀏覽器標準的高強度加解密。</small></p>
                    <input type="text" placeholder="輸入要加密的內容" oninput="this.closest('page-lab').state.cryptoInput = this.value" value="${this.state.cryptoInput}">
                    <input type="password" placeholder="設定密碼" oninput="this.closest('page-lab').state.cryptoPass = this.value" value="${this.state.cryptoPass}">
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="this.closest('page-lab').runEncrypt()">🔒 加密</button>
                        <button class="btn btn-success" ?disabled="${!this.state.encryptedData}" onclick="this.closest('page-lab').runDecrypt()">🔓 解密</button>
                        <button class="btn btn-secondary" onclick="this.closest('page-lab').runHash()">#️⃣ Hash</button>
                    </div>
                    ${this.state.decryptedResult ? html`<div style="margin-top:1rem; font-size:0.8rem;">解密結果: <br><code>${this.state.decryptedResult}</code></div>` : ''}
                    ${this.state.hashResult ? html`<div style="margin-top:1rem; font-size:0.7rem; color:#666; word-break:break-all;">SHA-256: ${this.state.hashResult}</div>` : ''}
                </div>

                <!-- 數據壓縮單元 -->
                <div class="lab-card">
                    <h3>🗜️ 數據壓縮 (Compression)</h3>
                    <p><small>原生 Gzip/Deflate 流式壓縮。</small></p>
                    <textarea rows="3" oninput="this.closest('page-lab').state.compressInput = this.value">${this.state.compressInput}</textarea>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="this.closest('page-lab').runCompress()">🗜️ 壓縮</button>
                        <button class="btn btn-success" ?disabled="${!this.state.compressedBlob}" onclick="this.closest('page-lab').runDecompress()">🔓 解壓</button>
                    </div>
                    ${this.state.compressionRatio ? html`<div style="margin-top:1rem; font-size:0.8rem;">壓縮率: <strong>${this.state.compressionRatio}%</strong></div>` : ''}
                </div>
            </div>

            <div class="lab-grid" style="margin-top: 2rem;">
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
                            onclick="this.closest('page-lab').runCheckout()">
                        💳 立即結帳
                    </button>
                </div>

                <!-- 螢幕錄製單元 -->
                <div class="lab-card">
                    <h3>🎥 螢幕錄製 (Screen Recorder)</h3>
                    <div class="btn-group">
                        <button class="btn ${this.state.isRecordingScreen ? 'btn-danger' : 'btn-primary'}" 
                                onclick="this.closest('page-lab').toggleScreenRecording()">
                            ${this.state.isRecordingScreen ? html`<span class="rec-dot"></span> 停止錄製` : '🔴 開始錄影'}
                        </button>
                        ${this.state.recordedVideoUrl ? html`
                            <a href="${this.state.recordedVideoUrl}" download="recording.webm" class="btn btn-success" style="text-decoration: none; display: inline-flex; align-items: center;">💾 下載影片</a>
                        ` : ''}
                    </div>
                    <video id="previewVideo" muted style="display: ${this.state.isRecordingScreen || this.state.recordedVideoUrl ? 'block' : 'none'}; height: 150px; object-fit: cover;"></video>
                </div>
            </div>

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
                <div class="rtc-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
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

            <h2 style="margin-top: 3rem;">🧩 元件封裝 (Shadow DOM Encapsulation)</h2>
            <div class="lab-grid">
                <div class="lab-card">
                    <h3>🛡️ 樣式隔離示範</h3>
                    <p><small>左側為啟用了 Shadow DOM 的組件，右側為一般的 Light DOM 組件。注意它們如何處理 <code>.title</code> 樣式衝突。</small></p>
                    
                    <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                        <!-- Shadow DOM 組件 -->
                        <div style="flex: 1; min-width: 250px;">
                            <p><strong>Isolated (Shadow)</strong></p>
                            <x-isolated-card title="隔離的標題">
                                這段文字位在 Shadow DOM 內部，其樣式完全獨立。
                                <div slot="footer">📍 狀態：樣式受保護</div>
                            </x-isolated-card>
                        </div>

                        <!-- Light DOM 組件範例 -->
                        <div style="flex: 1; min-width: 250px; border: 2px solid #ddd; border-radius: 12px; padding: 1.5rem;">
                            <p><strong>Standard (Light)</strong></p>
                            <div class="title">普通的標題</div>
                            <div class="content">
                                這段文字會受到全域 CSS 影響。
                                <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid #ddd; font-size: 0.8rem; color: #666;">
                                    📍 狀態：無隔離
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <h2 style="margin-top: 3rem;">🎞️ 即時串流處理 (Live Stream Processing)</h2>
            <div class="lab-card">
                <div style="margin-bottom: 1rem;">
                    狀態: <span class="status-badge ${streamProcessorService.isSupported ? 'success' : ''}">${this.state.streamStatus}</span>
                </div>
                <p><small>利用 MediaStreamTrackProcessor 直接攔截攝像頭影格並套用視覺濾鏡。</small></p>
                
                <div class="btn-group" style="margin-bottom: 1.5rem;">
                    <button class="btn ${this.state.isProcessingStream ? 'btn-danger' : 'btn-primary'}" 
                            ?disabled="${!streamProcessorService.isSupported}"
                            onclick="this.closest('page-lab').toggleLiveFilter()">
                        ${this.state.isProcessingStream ? '⏹️ 停止處理' : '📹 啟動處理器'}
                    </button>
                    <select class="control-btn" style="width: auto; margin-bottom: 0;"
                            onchange="this.closest('page-lab').changeFilter(this.value)">
                        <option value="none">無濾鏡</option>
                        <option value="grayscale">灰階 (Grayscale)</option>
                        <option value="invert">反轉 (Invert)</option>
                        <option value="sepia">棕褐色 (Sepia)</option>
                    </select>
                </div>

                <div style="background: #000; border-radius: 12px; overflow: hidden; position: relative; aspect-ratio: 16/9; max-width: 600px; margin: 0 auto;">
                    <video id="processedVideo" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
                    ${!this.state.isProcessingStream ? html`
                        <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #666;">
                            等待啟動...
                        </div>
                    ` : ''}
                </div>
            </div>

            <h2 style="margin-top: 3rem;">🔌 序列通訊 (Web Serial API)</h2>
            <div class="lab-card">
                <div style="margin-bottom: 1rem;">
                    狀態: <span class="status-badge ${serialService.isSupported ? 'success' : ''}">${this.state.serialStatus}</span>
                </div>
                <p><small>直接與透過 USB 或藍牙連接的硬體（如 Arduino）通訊。</small></p>
                
                <div class="btn-group" style="margin-bottom: 1.5rem;">
                    <button class="btn ${this.state.isSerialConnected ? 'btn-danger' : 'btn-primary'}" 
                            ?disabled="${!serialService.isSupported}"
                            onclick="this.closest('page-lab').runSerialConnect()">
                        ${this.state.isSerialConnected ? '🔌 斷開連線' : '🔍 掃描並連線'}
                    </button>
                    <select class="control-btn" style="width: auto; margin-bottom: 0;"
                            onchange="this.closest('page-lab').state.serialBaud = Number(this.value)">
                        <option value="9600">9600 Baud</option>
                        <option value="115200">115200 Baud</option>
                    </select>
                </div>

                <div class="chat-box" style="height: 120px; font-family: monospace; background: #1a1a1a; color: #00ff00; padding: 1rem; border-radius: 8px; overflow-y: auto;">
                    ${this.state.serialLogs.length === 0 ? '> 等待數據輸入...' : this.state.serialLogs.map(log => html`<div>> ${log}</div>`)}
                </div>

                <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <input type="text" placeholder="發送命令..." style="margin-bottom: 0;"
                           value="${this.state.serialInput}"
                           oninput="this.closest('page-lab').state.serialInput = this.value"
                           onkeyup="if(event.key === 'Enter') this.closest('page-lab').sendSerialCommand()">
                    <button class="btn btn-secondary" onclick="this.closest('page-lab').sendSerialCommand()">傳送</button>
                </div>
            </div>

            <h2 style="margin-top: 3rem;">📝 響應式表單 (Reactive Forms)</h2>
            <div class="lab-card">
                <p><small>基於模型驅動的驗證引擎，支援狀態追蹤與非同步檢查。</small></p>
                
                <div style="max-width: 400px; margin: 0 auto; text-align: left;">
                    <div style="margin-bottom: 1rem;">
                        <label>使用者名稱 (min 3 chars)</label>
                        <input type="text" placeholder="輸入 admin 測試重複"
                               style="border-color: ${this.state.registrationForm.username.invalid ? 'red' : '#ccc'}; margin-bottom: 5px;"
                               oninput="this.closest('page-lab').handleFormInput('username', this.value)"
                               onblur="this.closest('page-lab').form.controls.username.markAsTouched()">
                        ${this.state.registrationForm.username.pending ? html`<div style="font-size: 0.7rem; color: #666;">⏳ 正在檢查唯一性...</div>` : ''}
                        ${this.state.registrationForm.username.errors?.duplicated ? html`<div style="font-size: 0.7rem; color: red;">❌ 此名稱已被佔用</div>` : ''}
                        ${this.state.registrationForm.username.errors?.minlen ? html`<div style="font-size: 0.7rem; color: red;">❌ 長度不足</div>` : ''}
                    </div>

                    <div style="margin-bottom: 1rem;">
                        <label>電子郵件</label>
                        <input type="email" placeholder="example@mail.com"
                               style="border-color: ${this.state.registrationForm.email.invalid ? 'red' : '#ccc'}; margin-bottom: 5px;"
                               oninput="this.closest('page-lab').handleFormInput('email', this.value)"
                               onblur="this.closest('page-lab').form.controls.email.markAsTouched()">
                        ${this.state.registrationForm.email.errors?.email ? html`<div style="font-size: 0.7rem; color: red;">❌ 格式不正確</div>` : ''}
                    </div>

                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="this.closest('page-lab').submitForm()">送出註冊</button>
                        <button class="btn btn-secondary" onclick="this.closest('page-lab').resetForm()">重置</button>
                    </div>
                    
                    <div style="margin-top: 1rem; font-size: 0.8rem; color: ${this.state.registrationForm.formValid ? 'green' : '#666'};">
                        ● 表單狀態: <strong>${this.state.registrationForm.formValid ? 'VALID' : 'INVALID'}</strong>
                    </div>
                </div>
            </div>

            <h2 style="margin-top: 3rem;">🤝 CRDT 協作數據 (Conflict-free Sync)</h2>
            <div class="lab-card">
                <div style="margin-bottom: 1rem;">
                    狀態: <span class="status-badge success">${this.state.crdtStatus}</span>
                </div>
                <p><small>試著開啟多個分頁並同時編輯下方區域。系統利用 LWW-Register 確保所有分頁最終達成一致。</small></p>
                
                <textarea rows="5" placeholder="輸入協作內容..." 
                          style="font-family: 'Fira Code', monospace; background: #f9f9f9;"
                          oninput="this.closest('page-lab').handleCollabInput(this.value)">${this.state.collabNote}</textarea>
            </div>

            <section style="margin-top: 3rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 教學重點</h3>
                <ul>
                    <li><strong>Reactive Forms</strong>：模型驅動的表單驗證，支援 Dirty/Touched 狀態追蹤。</li>
                    <li><strong>CRDT (LWW-Register)</strong>：實現無衝突的數據合併，確保分散式環境下的最終一致性。</li>
                    <li><strong>Payment Request</strong>：標準化的瀏覽器原生結帳流程。</li>
                    <li><strong>Screen Capture</strong>：原生媒體串流擷取與錄製。</li>
                    <li><strong>Web Bluetooth</strong>：網頁與實體硬體 (BLE) 的直接通訊。</li>
                    <li><strong>Web Serial</strong>：與嵌入式系統、感測器的直接序列埠通訊。</li>
                    <li><strong>Shadow DOM</strong>：實現組件樣式與結構的真正物理隔離。</li>
                    <li><strong>Insertable Streams</strong>：高效能的即時影像影格處理。</li>
                </ul>
            </section>
        `;
    }
}
customElements.define('page-lab', LabPage);
