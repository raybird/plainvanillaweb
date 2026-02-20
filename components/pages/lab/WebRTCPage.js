import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { webrtcService } from '../../../lib/webrtc-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class WebRTCPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            rtcLocalSdp: '',
            rtcRemoteSdp: '',
            rtcStatus: 'Disconnected',
            rtcMessages: [],
            rtcInput: ''
        });
    }

    connectedCallback() {
        super.connectedCallback();
        this._onRTCMessage = (data) => {
            this.state.rtcMessages = [...this.state.rtcMessages, { side: 'remote', text: data }];
            notificationService.info('收到 P2P 訊息');
        };
        this._onRTCStateChange = (state) => this.state.rtcStatus = state;

        webrtcService.on('message', this._onRTCMessage);
        webrtcService.on('state-change', this._onRTCStateChange);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        webrtcService.off('message', this._onRTCMessage);
        webrtcService.off('state-change', this._onRTCStateChange);
    }

        async createRTCOffer() {
            try {
                const offer = await webrtcService.createOffer();
                this.state.rtcLocalSdp = JSON.stringify(offer);
                notificationService.info('Offer 已生成，請複製給對方');
            } catch(e) {
                notificationService.error('建立 Offer 失敗: ' + e.message);
            }
        }
    
        async createRTCAnswer() {
            try {
                const offer = JSON.parse(this.state.rtcRemoteSdp);
                const answer = await webrtcService.createAnswer(offer);
                this.state.rtcLocalSdp = JSON.stringify(answer);
                notificationService.info('Answer 已生成，請複製回傳給對方');
            } catch(e) {
                notificationService.error('建立 Answer 失敗 (請確認遠端 SDP 是否正確)');
            }
        }
    
        async acceptRTCAnswer() {
            try {
                const answer = JSON.parse(this.state.rtcRemoteSdp);
                await webrtcService.setAnswer(answer);
                notificationService.success('Answer 已套用，連線建立中...');
            } catch (err) {
                notificationService.error('套用 Answer 失敗: ' + err.message);
            }
        }
    
        copyLocalSDP() {
            if (!this.state.rtcLocalSdp) return;
            navigator.clipboard.writeText(this.state.rtcLocalSdp)
                .then(() => notificationService.success('SDP 已複製到剪貼簿'))
                .catch(() => notificationService.error('複製失敗'));
        }
    
        sendRTCMessage() {
            if (!this.state.rtcInput) return;
            try {
                webrtcService.send(this.state.rtcInput);
                this.state.rtcMessages = [...this.state.rtcMessages, { side: 'local', text: this.state.rtcInput }];
                this.state.rtcInput = '';
            } catch (e) {
                notificationService.error('傳送失敗: ' + e.message);
            }
        }
    
        render() {
            return html`
                <style>
                    .chat-box { height: 200px; border: 1px solid #ddd; padding: 1rem; overflow-y: auto; margin-bottom: 1rem; font-size: 0.9rem; background: #fff; border-radius: 8px; }
                    .rtc-step { background: #f8f9fa; padding: 1rem; border-radius: 8px; border: 1px solid #eee; margin-bottom: 1.5rem; }
                    .rtc-step h3 { margin-top: 0; font-size: 1.1rem; color: var(--primary-color); }
                    textarea { width: 100%; margin: 0.5rem 0; font-family: monospace; font-size: 0.75rem; padding: 0.5rem; border-radius: 4px; border: 1px solid #ccc; resize: vertical; }
                    .sdp-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
                    .msg-local { color: #007bff; text-align: right; margin-bottom: 0.4rem; }
                    .msg-remote { color: #28a745; text-align: left; margin-bottom: 0.4rem; }
                </style>
    
                <div class="lab-header">
                    <h2>📡 P2P 通訊 (WebRTC)</h2>
                    <p>體驗無伺服器的瀏覽器端點對點通訊。請開啟兩個視窗並手動交換 SDP。</p>
                </div>
    
                <div style="margin-bottom: 1.5rem;">
                    連線狀態: <span class="status-badge">${this.state.rtcStatus}</span>
                </div>
    
                <div class="rtc-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem;">
                    <!-- 連線控制區 -->
                    <div class="rtc-controls">
                        <div class="rtc-step">
                            <h3>步驟 1: 發起或回應</h3>
                            <div class="btn-group">
                                <button class="btn btn-primary" onclick="this.closest('page-lab-webrtc').createRTCOffer()">A. 建立 Offer</button>
                                <button class="btn btn-outline" onclick="this.closest('page-lab-webrtc').createRTCAnswer()">B. 建立 Answer</button>
                            </div>
                            
                            ${this.state.rtcLocalSdp ? html`
                                <div style="margin-top: 1rem;">
                                    <label>您的本地 SDP (Local):</label>
                                    <textarea rows="5" readonly>${this.state.rtcLocalSdp}</textarea>
                                    <button class="btn btn-sm btn-secondary" onclick="this.closest('page-lab-webrtc').copyLocalSDP()">📋 複製內容</button>
                                </div>
                            ` : ''}
                        </div>
    
                        <div class="rtc-step">
                            <h3>步驟 2: 套用對方的 SDP</h3>
                            <textarea rows="5" placeholder="在此貼上對方給您的 SDP..."
                                      .value="${this.state.rtcRemoteSdp}"
                                      oninput="this.closest('page-lab-webrtc').state.rtcRemoteSdp = this.value"></textarea>
                            <button class="btn btn-success" 
                                    ?disabled="${!this.state.rtcRemoteSdp}"
                                    onclick="this.closest('page-lab-webrtc').acceptRTCAnswer()">
                                套用並建立連線
                            </button>
                        </div>
                    </div>
    
                    <!-- 聊天互動區 -->
                    <div class="rtc-chat">
                        <h3>P2P 即時對話</h3>
                        <div class="chat-box" id="rtc-chat-box">
                            ${this.state.rtcMessages.length === 0 ? html`<p style="color: #999; text-align: center;">尚未建立連線</p>` : ''}
                            ${this.state.rtcMessages.map(m => html`
                                <div class="msg-${m.side}">
                                    <small>${m.side === 'local' ? '您' : '對方'}:</small>
                                    <div>${m.text}</div>
                                </div>
                            `)}
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" class="form-control" placeholder="輸入訊息..." 
                                   oninput="this.closest('page-lab-webrtc').state.rtcInput = this.value"
                                   .value="${this.state.rtcInput}"
                                   onkeyup="if(event.key === 'Enter') this.closest('page-lab-webrtc').sendRTCMessage()">
                            <button class="btn btn-primary" onclick="this.closest('page-lab-webrtc').sendRTCMessage()">發送</button>
                        </div>
                    </div>
                </div>
    
                <section class="info-section" style="margin-top: 2rem;">
                    <h3>🛡️ 測試指引</h3>
                    <ol>
                        <li>在視窗 A 點擊<strong>「建立 Offer」</strong>，複製 SDP。</li>
                        <li>在視窗 B 貼上 SDP，點擊<strong>「建立 Answer」</strong>，複製生成的 Answer SDP。</li>
                        <li>回視窗 A 貼上視窗 B 的 SDP，點擊<strong>「套用並建立連線」</strong>。</li>
                    </ol>
                </section>
    
                <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室列表</a>
            `;
        }
    }
    
customElements.define('page-lab-webrtc', WebRTCPage);
