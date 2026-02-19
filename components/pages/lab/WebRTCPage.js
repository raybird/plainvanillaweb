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
            notificationService.info('Offer 已生成');
        } catch(e) {
            notificationService.error(e.message);
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
                .chat-box { height: 150px; border: 1px solid #eee; padding: 0.5rem; overflow-y: auto; margin-bottom: 0.5rem; font-size: 0.8rem; background: #fafafa; }
                textarea { width: 100%; margin-bottom: 1rem; }
            </style>
            <h2>📡 P2P 通訊 (WebRTC)</h2>
            <div class="lab-card">
                <div style="margin-bottom: 1rem;">狀態: <strong>${this.state.rtcStatus}</strong></div>
                <div class="rtc-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div>
                        <label>遠端 SDP (Remote):</label>
                        <textarea rows="4" placeholder="貼上對方的 SDP..." oninput="this.closest('page-lab-webrtc').state.rtcRemoteSdp = this.value"></textarea>
                        <div class="btn-group">
                            <button class="btn btn-primary" onclick="this.closest('page-lab-webrtc').createRTCOffer()">1. 發起 Offer</button>
                            <button class="btn btn-success" onclick="this.closest('page-lab-webrtc').acceptRTCAnswer()">2. 套用 Answer</button>
                        </div>
                        ${this.state.rtcLocalSdp ? html`
                            <div style="margin-top: 1rem;">
                                <label>您的本地 SDP (Local):</label>
                                <textarea rows="4" readonly style="background: #f0f0f0;">${this.state.rtcLocalSdp}</textarea>
                                <p><small>請將上方內容複製給對方。</small></p>
                            </div>
                        ` : ''}
                    </div>
                    <div>
                        <label>即時對話:</label>
                        <div class="chat-box">
                            ${this.state.rtcMessages.map(m => html`<div>[${m.side === 'local' ? '您' : '對方'}] ${m.text}</div>`)}
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" placeholder="輸入訊息..." 
                                   oninput="this.closest('page-lab-webrtc').state.rtcInput = this.value"
                                   value="${this.state.rtcInput}"
                                   onkeyup="if(event.key === 'Enter') this.closest('page-lab-webrtc').sendRTCMessage()">
                            <button class="btn btn-secondary" onclick="this.closest('page-lab-webrtc').sendRTCMessage()">發送</button>
                        </div>
                    </div>
                </div>
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-webrtc', WebRTCPage);
