import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { broadcastService } from "../../../lib/broadcast-service.js";

export class BroadcastPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            messages: [],
            tabId: broadcastService.tabId
        });

        this._handleMessage = (payload) => {
            this.state.messages = [...this.state.messages, {
                ...payload,
                isMe: payload.sender === broadcastService.tabId
            }];
            this._scrollToBottom();
        };
    }

    connectedCallback() {
        super.connectedCallback();
        broadcastService.addEventListener('message', this._handleMessage);
        broadcastService.post('system', { text: `分頁 [${this.state.tabId}] 已上線。` });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        broadcastService.removeEventListener('message', this._handleMessage);
        broadcastService.post('system', { text: `分頁 [${this.state.tabId}] 已離線。` });
    }

    handleSend(e) {
        e.preventDefault();
        const input = this.querySelector('#bc-input');
        const text = input?.value?.trim();
        if (!text) return;

        broadcastService.post('chat', { text });

        // 本地也顯示自己的訊息
        this._handleMessage({
            type: 'chat',
            payload: { text },
            sender: broadcastService.tabId,
            timestamp: Date.now()
        });

        if (input) input.value = '';
    }

    _scrollToBottom() {
        setTimeout(() => {
            const list = this.querySelector('#bc-messages');
            if (list) list.scrollTop = list.scrollHeight;
        }, 50);
    }

    _formatTime(ts) {
        return new Date(ts).toLocaleTimeString();
    }

    render() {
        return html`
            <style>
                .bc-messages { height: 220px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px; padding: 1rem; background: #f8fafc; display: flex; flex-direction: column; gap: 0.5rem; margin: 1rem 0; }
                .bc-msg-system { text-align: center; font-size: 0.8rem; color: #94a3b8; }
                .bc-msg-me { align-self: flex-end; background: var(--primary-color, #2563eb); color: #fff; padding: 0.5rem 1rem; border-radius: 16px 16px 4px 16px; max-width: 80%; font-size: 0.9rem; }
                .bc-msg-other { align-self: flex-start; background: #fff; color: #334155; padding: 0.5rem 1rem; border-radius: 16px 16px 16px 4px; max-width: 80%; font-size: 0.9rem; border: 1px solid #e2e8f0; }
                .bc-meta { font-size: 0.72rem; opacity: 0.7; margin-bottom: 0.2rem; }
            </style>
            <div class="lab-card">
                <h3>📢 跨分頁同源廣播 (Broadcast Channel API)</h3>
                <p><small>免伺服器的分頁間即時通訊。你的分頁 ID：<code>[${this.state.tabId}]</code></small></p>
                
                <div style="padding: 0.6rem 1rem; background: #eff6ff; border-left: 3px solid #3b82f6; border-radius: 4px; font-size: 0.85rem; margin-bottom: 0.5rem;">
                    💡 開啟另一個分頁並導覽到此實驗，然後輪流發訊息，即可體驗 0 延遲跨分頁廣播。
                </div>

                <div class="bc-messages" id="bc-messages">
                    ${this.state.messages.length === 0 ? html`<div class="bc-msg-system">尚無訊息，快傳送第一則！</div>` : ''}
                    ${this.state.messages.map(msg => {
            if (msg.type === 'system') {
                return html`<div class="bc-msg-system">${msg.payload.text}</div>`;
            }
            const isMe = msg.isMe;
            return html`
                            <div style="display: flex; flex-direction: column;">
                                ${!isMe ? html`<div class="bc-meta">來自 [${msg.sender}] · ${this._formatTime(msg.timestamp)}</div>` : ''}
                                ${isMe ? html`<div class="bc-meta" style="text-align: right;">${this._formatTime(msg.timestamp)}</div>` : ''}
                                <div class="${isMe ? 'bc-msg-me' : 'bc-msg-other'}">${msg.payload.text}</div>
                            </div>
                        `;
        })}
                </div>

                <form onsubmit="this.closest('page-lab-broadcast').handleSend(event)" style="display: flex; gap: 0.5rem;">
                    <input id="bc-input" type="text" placeholder="輸入訊息..." autocomplete="off"
                           style="flex: 1; padding: 0.6rem 0.8rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem;" />
                    <button type="submit" class="btn btn-primary">發送</button>
                </form>
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}

customElements.define("page-lab-broadcast", BroadcastPage);
