import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { broadcastService } from "../../../lib/broadcast-service.js";

export class BroadcastPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            messages: [],
            inputText: '',
            tabId: broadcastService.tabId
        });

        // 綁定 Broadcast Service 的訊息監聽
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

        // 頁面載入時自己廣播一個上線通知
        broadcastService.post('system', {
            text: `[分頁 ${this.state.tabId}] 加入了廣播頻道。`
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        broadcastService.removeEventListener('message', this._handleMessage);

        // 離開時發送離線通知
        broadcastService.post('system', {
            text: `[分頁 ${this.state.tabId}] 離開了廣播頻道。`
        });
    }

    handleSend(e) {
        e.preventDefault();
        const text = this.state.inputText.trim();
        if (!text) return;

        // 透過 Broadcast Service 廣播給所有訂閱者 (不包含自己)
        broadcastService.post('chat', { text });

        // 自己本地亦推送顯示
        this._handleMessage({
            type: 'chat',
            payload: { text },
            sender: broadcastService.tabId,
            timestamp: Date.now()
        });

        this.state.inputText = '';
    }

    handleInput(e) {
        this.state.inputText = e.target.value;
    }

    _scrollToBottom() {
        setTimeout(() => {
            const list = this.querySelector('.chat-list');
            if (list) list.scrollTop = list.scrollHeight;
        }, 50);
    }

    _formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
    }

    render() {
        return html`
            <style>
                .broadcast-container {
                    display: flex;
                    flex-direction: column;
                    height: 600px;
                    max-width: 800px;
                    margin: 0 auto;
                    background: var(--surface-color, #fff);
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                    overflow: hidden;
                }
                .header {
                    padding: 1.5rem;
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                }
                .chat-list {
                    flex: 1;
                    padding: 1.5rem;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    background: #f1f5f9;
                }
                .message {
                    max-width: 80%;
                    padding: 0.8rem 1.2rem;
                    border-radius: 16px;
                    font-size: 0.95rem;
                    line-height: 1.4;
                    position: relative;
                }
                .message.system {
                    align-self: center;
                    background: #e2e8f0;
                    color: #475569;
                    font-size: 0.85rem;
                    border-radius: 999px;
                    padding: 0.4rem 1rem;
                }
                .message.other {
                    align-self: flex-start;
                    background: #fff;
                    color: #334155;
                    border-bottom-left-radius: 4px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .message.me {
                    align-self: flex-end;
                    background: var(--primary-color, #2563eb);
                    color: #fff;
                    border-bottom-right-radius: 4px;
                }
                .meta {
                    font-size: 0.75rem;
                    opacity: 0.7;
                    margin-bottom: 0.3rem;
                }
                .meta.me-meta {
                    text-align: right;
                }
                .input-area {
                    padding: 1rem;
                    background: #fff;
                    border-top: 1px solid #e2e8f0;
                    display: flex;
                    gap: 0.5rem;
                }
                input[type="text"] {
                    flex: 1;
                    padding: 0.8rem;
                    border: 1px solid #cbd5e1;
                    border-radius: 8px;
                    font-size: 1rem;
                    outline: none;
                }
                input[type="text"]:focus {
                    border-color: var(--primary-color, #2563eb);
                }
                button {
                    padding: 0 1.5rem;
                    background: var(--primary-color, #2563eb);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                button:hover {
                    background: #1d4ed8;
                }
                .instructions {
                    margin-bottom: 1rem;
                    padding: 1rem;
                    background: #eff6ff;
                    border-left: 4px solid #3b82f6;
                    border-radius: 4px;
                }
            </style>

            <div class="broadcast-container">
                <div class="header">
                    <h2>📢 跨分頁同源廣播 (Broadcast Channel API)</h2>
                    <div class="instructions">
                        <p><strong>💡 實驗方式：</strong> 請點擊右鍵「在新分頁開啟另一個 Lab」，然後兩邊輪流打字。你將會看到訊息瞬間同步傳遞，完全不需要經過後端伺服器或 WebSocket！</p>
                        <p>您目前的分頁識別碼：<code>[${this.state.tabId}]</code></p>
                    </div>
                </div>

                <div class="chat-list">
                    ${this.state.messages.map(msg => {
            if (msg.type === 'system') {
                return html`<div class="message system">${msg.payload.text} - ${this._formatTime(msg.timestamp)}</div>`;
            }

            const isMe = msg.isMe;
            const cssClass = isMe ? 'me' : 'other';
            return html`
                            <div class="message-wrapper" style="display: flex; flex-direction: column;">
                                ${!isMe ? html`<div class="meta">來自 [${msg.sender}] • ${this._formatTime(msg.timestamp)}</div>` : ''}
                                ${isMe ? html`<div class="meta me-meta">${this._formatTime(msg.timestamp)}</div>` : ''}
                                <div class="message ${cssClass}">
                                    ${msg.payload.text}
                                </div>
                            </div>
                        `;
        })}
                </div>

                <form class="input-area" onsubmit="this.closest('page-lab-broadcast').handleSend(event)">
                    <input 
                        type="text" 
                        placeholder="輸入訊息，廣播到所有開啟此網頁的分頁..." 
                        value="${this.state.inputText}"
                        oninput="this.closest('page-lab-broadcast').handleInput(event)"
                        autocomplete="off"
                    />
                    <button type="submit">發送</button>
                </form>
            </div>
        `;
    }
}

customElements.define("page-lab-broadcast", BroadcastPage);
