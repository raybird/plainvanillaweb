import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { serialService } from '../../../lib/serial-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class SerialPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isSerialConnected: false,
            serialLogs: [],
            serialBaud: 9600,
            serialInput: '',
            serialStatus: serialService.isSupported ? '支援' : '不支援'
        });
    }

    connectedCallback() {
        super.connectedCallback();
        this._onData = (data) => {
            this.state.serialLogs = [...this.state.serialLogs, data].slice(-10);
        };
        this._onConnected = () => this.state.isSerialConnected = true;
        this._onDisconnected = () => this.state.isSerialConnected = false;

        serialService.on('data', this._onData);
        serialService.on('connected', this._onConnected);
        serialService.on('disconnected', this._onDisconnected);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        serialService.off('data', this._onData);
        serialService.off('connected', this._onConnected);
        serialService.off('disconnected', this._onDisconnected);
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
        const input = this.querySelector('#serial-input');
        const text = input?.value?.trim();
        if (!text) return;
        await serialService.write(text + '\n');
        if (input) input.value = '';
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>🔌 序列通訊 (Web Serial API)</h3>
                <div style="margin-bottom: 1rem;">
                    狀態: <span class="status-badge ${serialService.isSupported ? 'success' : ''}">${this.state.serialStatus}</span>
                </div>
                <div class="btn-group" style="margin-bottom: 1.5rem;">
                    <button class="btn ${this.state.isSerialConnected ? 'btn-danger' : 'btn-primary'}" 
                            ${!serialService.isSupported ? 'disabled' : ''}
                            onclick="this.closest('page-lab-serial').runSerialConnect()">
                        ${this.state.isSerialConnected ? '🔌 斷開連線' : '🔍 掃描並連線'}
                    </button>
                    <select class="control-btn" style="width: auto; margin-bottom: 0;"
                            onchange="this.closest('page-lab-serial').state.serialBaud = Number(this.value)">
                        <option value="9600">9600 Baud</option>
                        <option value="115200">115200 Baud</option>
                    </select>
                </div>
                <div class="chat-box" style="height: 120px; font-family: monospace; background: #1a1a1a; color: #00ff00; padding: 1rem; border-radius: 8px; overflow-y: auto;">
                    ${this.state.serialLogs.length === 0 ? '> 等待數據輸入...' : this.state.serialLogs.map(log => `<div>> ${log}</div>`).join('')}
                </div>
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <input type="text" id="serial-input" placeholder="發送命令..." 
                           onkeydown="if(event.key==='Enter') this.closest('page-lab-serial').sendSerialCommand()">
                    <button class="btn btn-secondary" onclick="this.closest('page-lab-serial').sendSerialCommand()">傳送</button>
                </div>
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-serial', SerialPage);
