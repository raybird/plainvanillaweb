import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { serialService } from '../../../lib/serial-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class SerialPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isSerialConnected: false,
            isSerialBusy: false,
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
        this.state.isSerialConnected = Boolean(serialService.port);
    }

    afterFirstRender() {
        this.addEventListener('submit', event => {
            if (!event.target.matches('.serial-command')) return;
            event.preventDefault();
            void this.sendSerialCommand(event.target.elements.command);
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        serialService.off('data', this._onData);
        serialService.off('connected', this._onConnected);
        serialService.off('disconnected', this._onDisconnected);
    }

    async runSerialConnect() {
        if (this.state.isSerialBusy) return;
        this.state.isSerialBusy = true;
        try {
            if (this.state.isSerialConnected) {
                await serialService.disconnect();
            } else {
                await serialService.connect(this.state.serialBaud);
            }
        } catch (err) {
            if (err.name !== 'NotFoundError') notificationService.error(err.message);
        } finally {
            this.state.isSerialBusy = false;
        }
    }

    async sendSerialCommand(input) {
        const submittedValue = input.value;
        const text = submittedValue.trim();
        if (!text || !this.state.isSerialConnected || this.state.isSerialBusy) return;
        try {
            await serialService.write(text + '\n');
            if (input.value === submittedValue) input.value = '';
        } catch (err) {
            notificationService.error(err.message);
        }
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
                            ${!serialService.isSupported || this.state.isSerialBusy ? 'disabled' : ''}
                            onclick="this.closest('page-lab-serial').runSerialConnect()">
                        ${this.state.isSerialConnected ? '🔌 斷開連線' : '🔍 掃描並連線'}
                    </button>
                    <label for="serial-baud">鮑率</label>
                    <select id="serial-baud" class="control-btn" style="width: auto; margin-bottom: 0;"
                            onchange="this.closest('page-lab-serial').state.serialBaud = Number(this.value)">
                        <option value="9600">9600 Baud</option>
                        <option value="115200">115200 Baud</option>
                    </select>
                </div>
                <div class="chat-box" style="height: 120px; font-family: monospace; background: #1a1a1a; color: #00ff00; padding: 1rem; border-radius: 8px; overflow-y: auto;">
                    ${this.state.serialLogs.length === 0 ? '> 等待數據輸入...' : this.state.serialLogs.map(log => html`<div>> ${log}</div>`)}
                </div>
                <form class="serial-command" style="margin-top: 1rem;">
                    <label for="serial-input">序列埠命令</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="serial-input" name="command" required enterkeyhint="send">
                        <button type="submit" class="btn btn-secondary" ${!this.state.isSerialConnected || this.state.isSerialBusy ? 'disabled' : ''}>傳送</button>
                    </div>
                </form>
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-serial', SerialPage);
