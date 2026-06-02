import { html, unsafe } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { webrtcService } from '../../../lib/webrtc-service.js';
import { notificationService } from '../../../lib/notification-service.js';

/**
 * WebRTCPage - 重構版 P2P 通訊實驗室
 * 採用角色引導模式，降低手動 SDP 交換的複雜度。
 */
export class WebRTCPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            // 'none' | 'caller' | 'answerer'
            role: 'none',
            // 'idle' | 'offer-ready' | 'answer-ready' | 'connected'
            step: 'idle',
            localSdp: '',
            remoteSdpInput: '',
            messages: [],
            isChannelOpen: false,
            statusLabel: '🔴 未連線',
        });
    }

    connectedCallback() {
        super.connectedCallback();

        this._onMessage = (data) => {
            this.state.messages = [...this.state.messages, { side: 'remote', text: data }];
        };
        this._onStateChange = (state) => {
            const labels = {
                'new': '🟡 初始化中',
                'checking': '🟡 連線中...',
                'connected': '🟢 已連線',
                'completed': '🟢 已連線（完成）',
                'disconnected': '🔴 已中斷',
                'failed': '🔴 連線失敗',
                'closed': '⚫ 已關閉',
            };
            this.state.statusLabel = labels[state] || `📡 ${state}`;
        };
        this._onChannelOpen = () => {
            this.state.isChannelOpen = true;
            this.state.step = 'connected';
            notificationService.success('🎉 P2P 資料通道已開啟！可以開始聊天了。');
        };
        this._onChannelClose = () => {
            this.state.isChannelOpen = false;
            this.state.statusLabel = '⚫ 通道已關閉';
        };

        webrtcService.on('message', this._onMessage);
        webrtcService.on('state-change', this._onStateChange);
        webrtcService.on('channel-open', this._onChannelOpen);
        webrtcService.on('channel-close', this._onChannelClose);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        webrtcService.off('message', this._onMessage);
        webrtcService.off('state-change', this._onStateChange);
        webrtcService.off('channel-open', this._onChannelOpen);
        webrtcService.off('channel-close', this._onChannelClose);
    }

    selectRole(role) {
        this.state.role = role;
        this.state.step = 'idle';
        this.state.localSdp = '';
        this.state.remoteSdpInput = '';
    }

    async startAsCallerStep1() {
        try {
            notificationService.info('正在建立 Offer，請稍候...');
            const offer = await webrtcService.createOffer();
            this.state.localSdp = JSON.stringify(offer);
            this.state.step = 'offer-ready';
            notificationService.success('Offer 已生成！請複製後傳給對方（接收者）。');
        } catch (e) {
            notificationService.error('建立 Offer 失敗: ' + e.message);
        }
    }

    async startAsAnswererStep1() {
        if (!this.state.remoteSdpInput.trim()) {
            notificationService.error('請先貼上 Caller 給你的 Offer SDP！');
            return;
        }
        try {
            notificationService.info('正在建立 Answer，請稍候...');
            const offer = JSON.parse(this.state.remoteSdpInput);
            const answer = await webrtcService.createAnswer(offer);
            this.state.localSdp = JSON.stringify(answer);
            this.state.step = 'answer-ready';
            notificationService.success('Answer 已生成！請複製後傳回給 Caller。');
        } catch (e) {
            notificationService.error('建立 Answer 失敗，請確認貼入的 SDP 是否正確。');
        }
    }

    async callerApplyAnswer() {
        if (!this.state.remoteSdpInput.trim()) {
            notificationService.error('請先貼上 Answerer 回傳的 Answer SDP！');
            return;
        }
        try {
            const answer = JSON.parse(this.state.remoteSdpInput);
            await webrtcService.setAnswer(answer);
            notificationService.info('Answer 已套用，等待連線建立...');
        } catch (e) {
            notificationService.error('套用 Answer 失敗: ' + e.message);
        }
    }

    copySdp() {
        if (!this.state.localSdp) return;
        navigator.clipboard.writeText(this.state.localSdp)
            .then(() => notificationService.success('✅ SDP 已複製到剪貼簿！'))
            .catch(() => notificationService.error('複製失敗，請手動選取複製'));
    }

    sendMessage() {
        // 直接從 DOM 讀取，不走 reactive state，避免 oninput 觸發全頁重繪
        const input = this.querySelector('#webrtc-chat-input');
        const text = input?.value?.trim();
        if (!text) return;
        try {
            webrtcService.send(text);
            this.state.messages = [...this.state.messages, { side: 'local', text }];
            if (input) input.value = '';
        } catch (e) {
            notificationService.error('傳送失敗: ' + e.message);
        }
    }

    render() {
        return html`
            <style>
                .webrtc-page { max-width: 900px; margin: 0 auto; padding: 0 1rem; }
                .status-bar { display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface-color); border-radius: 8px; margin-bottom: 2rem; font-size: 1rem; border: 1px solid var(--border-color); }
                .status-text { font-weight: 600; }
                
                .role-selector { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }
                .role-card { padding: 2rem; border: 2px solid var(--border-color); border-radius: 12px; text-align: center; cursor: pointer; transition: all 0.2s; background: var(--card-bg); }
                .role-card:hover { border-color: var(--primary-color, #2563eb); box-shadow: 0 4px 12px rgba(37, 99, 235, 0.1); transform: translateY(-2px); }
                .role-card.active { border-color: var(--primary-color, #2563eb); background: #eff6ff; }
                .role-card h3 { margin-top: 0; color: var(--primary-color, #2563eb); }
                .role-icon { font-size: 3rem; margin-bottom: 1rem; }

                .guide-panel { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; }
                .guide-step { padding: 1.5rem 2rem; border-bottom: 1px solid var(--border-color); }
                .guide-step:last-child { border-bottom: none; }
                .step-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
                .step-number { width: 36px; height: 36px; border-radius: 50%; background: var(--primary-color, #2563eb); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; }
                .step-number.done { background: #10b981; }
                .step-number.dimmed { background: #cbd5e1; }
                .step-title { font-size: 1.1rem; font-weight: 600; }
                
                .sdp-box { font-family: monospace; font-size: 0.8rem; background: #1e293b; color: #a6accd; padding: 1rem; border-radius: 8px; word-break: break-all; max-height: 120px; overflow-y: auto; margin: 0.8rem 0; border: none; width: 100%; resize: vertical; }
                .sdp-input { font-family: monospace; font-size: 0.8rem; padding: 0.8rem; border: 2px solid var(--border-color); border-radius: 8px; width: 100%; resize: vertical; line-height: 1.4; }
                .sdp-input:focus { outline: none; border-color: var(--primary-color, #2563eb); }

                .chat-panel { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; margin-top: 2rem; }
                .chat-header { padding: 1rem 1.5rem; background: var(--surface-color); border-bottom: 1px solid var(--border-color); font-weight: 600; }
                .chat-messages { height: 200px; overflow-y: auto; padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; background: var(--surface-color); }
                .msg-local { align-self: flex-end; background: var(--primary-color, #2563eb); color: white; padding: 0.6rem 1rem; border-radius: 16px 16px 4px 16px; max-width: 75%; }
                .msg-remote { align-self: flex-start; background: var(--card-bg); color: #334155; padding: 0.6rem 1rem; border-radius: 16px 16px 16px 4px; max-width: 75%; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                .chat-input-area { display: flex; gap: 0.5rem; padding: 1rem; border-top: 1px solid var(--border-color); }
                .chat-input-area input { flex: 1; padding: 0.7rem 1rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 1rem; }
                .chat-input-area input:focus { outline: none; border-color: var(--primary-color, #2563eb); }
                
                .instruction-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 1rem; border-radius: 4px; font-size: 0.9rem; margin-top: 1rem; }
            </style>

            <div class="webrtc-page">
                <h2>📡 P2P 通訊實驗室 (WebRTC DataChannel)</h2>
                <p>體驗 100% 無伺服器的加密點對點通訊。你需要兩個瀏覽器視窗，手動交換一次 SDP 後即可建立加密的私密連線。</p>

                <!-- 狀態列 -->
                <div class="status-bar">
                    <span style="font-size: 1.2rem;">連線狀態：</span>
                    <span class="status-text">${this.state.statusLabel}</span>
                </div>

                <!-- 第 1 步：選擇角色 -->
                <h3>① 選擇你在這個視窗的角色</h3>
                <div class="role-selector">
                    <div class="role-card ${this.state.role === 'caller' ? 'active' : ''}" onclick="this.closest('page-lab-webrtc').selectRole('caller')">
                        <div class="role-icon">📞</div>
                        <h3>我是 Caller（發起者）</h3>
                        <p>我來建立連線、產生 Offer，等對方回傳 Answer 後完成配對。</p>
                    </div>
                    <div class="role-card ${this.state.role === 'answerer' ? 'active' : ''}" onclick="this.closest('page-lab-webrtc').selectRole('answerer')">
                        <div class="role-icon">📲</div>
                        <h3>我是 Answerer（接收者）</h3>
                        <p>Caller 把 Offer 給我，我貼上後產生 Answer 並回傳給 Caller。</p>
                    </div>
                </div>

                ${this.state.role === 'none' ? html`
                    <div class="instruction-box">
                        💡 請先選擇你的角色，接著照著步驟操作就能完成 P2P 連線！
                    </div>
                ` : ''}

                <!-- Caller 流程 -->
                ${this.state.role === 'caller' ? html`
                    <div class="guide-panel">
                        <!-- 步驟 1：建立 Offer -->
                        <div class="guide-step">
                            <div class="step-header">
                                <div class="step-number ${this.state.step !== 'idle' ? 'done' : ''}">1</div>
                                <div class="step-title">建立 Offer 並複製給對方（Answerer）</div>
                            </div>
                            ${this.state.localSdp && this.state.step === 'offer-ready' ? html`
                                <p style="color: var(--success); font-weight: 600;">✅ Offer 已生成！複製這段內容並傳給 Answerer。</p>
                                <textarea class="sdp-box" readonly rows="4">${this.state.localSdp}</textarea>
                                <button class="btn btn-secondary" onclick="this.closest('page-lab-webrtc').copySdp()">📋 一鍵複製 Offer SDP</button>
                            ` : html`
                                <p style="color: var(--text-muted);">點擊按鈕自動建立連線請求。這可能需要幾秒鐘。</p>
                                <button class="btn btn-primary" onclick="this.closest('page-lab-webrtc').startAsCallerStep1()">
                                    🚀 建立 Offer
                                </button>
                            `}
                        </div>

                        <!-- 步驟 2：貼上對方的 Answer -->
                        <div class="guide-step">
                            <div class="step-header">
                                <div class="step-number ${this.state.step === 'idle' ? 'dimmed' : ''} ${this.state.step === 'connected' ? 'done' : ''}">2</div>
                                <div class="step-title">貼上 Answerer 回傳的 Answer SDP</div>
                            </div>
                            <textarea 
                                class="sdp-input" 
                                rows="4"
                                placeholder="在此貼上 Answerer 給你的 Answer SDP..."
                                oninput="this.closest('page-lab-webrtc').state.remoteSdpInput = this.value"
                            ></textarea>
                            <div style="margin-top: 0.8rem;">
                                <button 
                                    class="btn btn-primary"
                                    onclick="this.closest('page-lab-webrtc').callerApplyAnswer()"
                                    ${unsafe(this.state.step === 'idle' || this.state.step === 'connected' ? 'disabled' : '')}>
                                    ✅ 套用 Answer，建立連線
                                </button>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Answerer 流程 -->
                ${this.state.role === 'answerer' ? html`
                    <div class="guide-panel">
                        <!-- 步驟 1：貼上 Offer -->
                        <div class="guide-step">
                            <div class="step-header">
                                <div class="step-number ${this.state.step !== 'idle' ? 'done' : ''}">1</div>
                                <div class="step-title">貼上 Caller 給你的 Offer SDP</div>
                            </div>
                            <textarea 
                                class="sdp-input" 
                                rows="4"
                                placeholder="在此貼上 Caller 給你的 Offer SDP..."
                                oninput="this.closest('page-lab-webrtc').state.remoteSdpInput = this.value"
                            ></textarea>
                            <div style="margin-top: 0.8rem;">
                                <button 
                                    class="btn btn-primary"
                                    onclick="this.closest('page-lab-webrtc').startAsAnswererStep1()">
                                    ⚡ 生成 Answer
                                </button>
                            </div>
                        </div>

                        <!-- 步驟 2：複製 Answer 回傳 -->
                        <div class="guide-step">
                            <div class="step-header">
                                <div class="step-number ${this.state.step === 'idle' ? 'dimmed' : ''} ${this.state.step === 'connected' ? 'done' : ''}">2</div>
                                <div class="step-title">把你的 Answer SDP 複製給 Caller</div>
                            </div>
                            ${this.state.localSdp ? html`
                                <p style="color: var(--success); font-weight: 600;">✅ Answer 已生成！複製這段內容傳回給 Caller。</p>
                                <textarea class="sdp-box" readonly rows="4">${this.state.localSdp}</textarea>
                                <button class="btn btn-secondary" onclick="this.closest('page-lab-webrtc').copySdp()">📋 一鍵複製 Answer SDP</button>
                            ` : html`
                                <p style="color: var(--text-subtle);">完成步驟 1 後，Answer SDP 會出現在這裡。</p>
                            `}
                        </div>
                    </div>
                ` : ''}

                <!-- 聊天區：連線後才顯示 -->
                ${this.state.step === 'connected' ? html`
                    <div class="chat-panel">
                        <div class="chat-header">💬 P2P 聊天（已建立端對端加密連線）</div>
                        <div class="chat-messages" id="webrtc-chat">
                            ${this.state.messages.length === 0 ? html`
                                <p style="color: var(--text-subtle); text-align: center; margin: auto;">盡情說話吧，這是一條加密的 P2P 連線 🔒</p>
                            ` : ''}
                            ${this.state.messages.map(m => html`
                                <div class="msg-${m.side}">${m.text}</div>
                            `)}
                        </div>
                        <div class="chat-input-area">
                            <input 
                                type="text" 
                                id="webrtc-chat-input"
                                placeholder="輸入訊息..."
                                onkeydown="if(event.key==='Enter'){ this.closest('page-lab-webrtc').sendMessage(); }"
                            />
                            <button class="btn btn-primary" onclick="this.closest('page-lab-webrtc').sendMessage()">發送</button>
                        </div>
                    </div>
                ` : ''}

                <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
            </div>
        `;
    }
}

customElements.define('page-lab-webrtc', WebRTCPage);
