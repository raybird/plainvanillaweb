import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { bluetoothService } from '../../../lib/bluetooth-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class BluetoothPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isConnected: false,
            deviceName: '未連接',
            services: [],
            receivedData: []
        });
    }

    async connect() {
        try {
            const device = await bluetoothService.connect();
            this.state.isConnected = true;
            this.state.deviceName = device.name || '未知設備';
            notificationService.success(`已連線至 ${this.state.deviceName}`);

            // 監聽斷線
            device.addEventListener('gattserverdisconnected', () => {
                this.state.isConnected = false;
                this.state.deviceName = '已斷線';
                notificationService.warn('藍牙設備已中斷連線');
            });
        } catch (err) {
            notificationService.error(err.message);
        }
    }

    render() {
        return html`
            <style>
                .bt-card { background: var(--card-bg); padding: 2rem; border-radius: 12px; border: 1px solid var(--border-color); text-align: center; }
                .status-ui { margin: 2rem 0; padding: 1rem; background: var(--surface-color); border-radius: 8px; }
                .bt-icon { font-size: 3rem; margin-bottom: 1rem; color: ${this.state.isConnected ? '#007bff' : '#ccc'}; }
            </style>

            <div class="lab-header">
                <h2>📱 原生藍牙通訊 (Web Bluetooth)</h2>
                <p>利用低功耗藍牙 (BLE) 與周邊硬體直接通訊。請確保使用 Secure Context (HTTPS)。</p>
            </div>

            <div class="bt-card">
                <div class="bt-icon">📡</div>
                <h3>設備狀態：${this.state.deviceName}</h3>
                
                <div class="status-ui">
                    ${this.state.isConnected ? html`
                        <span class="status-badge success">已連線 (Active)</span>
                        <p><small>您可以開始讀取 GATT 服務與特徵值。</small></p>
                    ` : html`
                        <span class="status-badge">等待掃描...</span>
                    `}
                </div>

                <div class="btn-group">
                    <button class="btn btn-primary" onclick="this.closest('page-lab-bluetooth').connect()" ${this.state.isConnected ? 'disabled' : ''}>
                        🚀 掃描並連接設備
                    </button>
                </div>
            </div>

            <section class="info-section">
                <h3>🎓 技術手冊</h3>
                <ul>
                    <li><strong>User Gesture</strong>：安全規範要求必須由點擊事件觸發掃描。</li>
                    <li><strong>GATT 協議</strong>：透過 Service 與 Characteristic 進行階層式數據交換。</li>
                    <li><strong>UUID 篩選</strong>：可限制僅顯示符合特定功能的設備（如心率計）。</li>
                </ul>
                <a href="#/lab" class="btn btn-secondary btn-sm" style="margin-top: 1.5rem;">⬅️ 回實驗室列表</a>
            </section>
        `;
    }
}
customElements.define('page-lab-bluetooth', BluetoothPage);
