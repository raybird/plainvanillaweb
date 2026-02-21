import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { notificationService } from '../../../lib/notification-service.js';

/**
 * 模擬一個業務服務
 */
class DemoBusinessService extends (await import('../../../lib/base-service.js')).BaseService {
    constructor() {
        super();
        this.data = { status: 'Idle', lastUpdate: '-' };
    }
    
    performAction(action) {
        this.data = { status: `Processing ${action}`, lastUpdate: new Date().toLocaleTimeString() };
        this.emit('action-started', this.data);
        
        setTimeout(() => {
            this.data.status = `Completed ${action}`;
            this.emit('action-completed', this.data);
        }, 1500);
    }
}
const demoService = new DemoBusinessService();

export class ServicePatternPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            serviceStatus: 'Idle',
            lastSync: '-',
            eventLogs: []
        });
    }

    connectedCallback() {
        super.connectedCallback();
        // 1. 訂閱服務事件，並保存取消訂閱函式
        this._unsub1 = demoService.on('action-started', (data) => {
            this.state.serviceStatus = data.status;
            this.state.lastSync = data.lastUpdate;
            this._logEvent('Service -> Component: Action Started');
        });

        this._unsub2 = demoService.on('action-completed', (data) => {
            this.state.serviceStatus = data.status;
            this._logEvent('Service -> Component: Action Completed');
            notificationService.success('業務邏輯處理完成');
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        // 2. 自動執行資源清理
        if (this._unsub1) this._unsub1();
        if (this._unsub2) this._unsub2();
    }

    _logEvent(msg) {
        this.state.eventLogs = [{ time: new Date().toLocaleTimeString(), msg }, ...this.state.eventLogs].slice(0, 5);
    }

    triggerAction(type) {
        this._logEvent(`Component -> Service: Request ${type}`);
        demoService.performAction(type);
    }

    render() {
        return html`
            <style>
                .pattern-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem; }
                .status-board { background: #2d2d2d; color: #00ff00; padding: 1.5rem; border-radius: 12px; font-family: monospace; }
                .event-log { font-size: 0.85rem; border-top: 1px solid #444; margin-top: 1rem; padding-top: 0.5rem; }
                .action-btn { width: 100%; margin-bottom: 0.5rem; }
            </style>

            <div class="lab-header">
                <h2>🔌 Service 交互模式 (Pub/Sub)</h2>
                <p>示範組件如何透過觀察者模式與業務服務進行解耦通訊。</p>
            </div>

            <div class="pattern-grid">
                <div class="lab-card">
                    <h3>🕹️ 控制發送 (Command)</h3>
                    <p><small>組件主動調用 Service 方法來觸發業務邏輯。</small></p>
                    <button class="btn btn-primary action-btn" onclick="this.closest('page-lab-service-pattern').triggerAction('Data Sync')">🔄 同步遠端數據</button>
                    <button class="btn btn-secondary action-btn" onclick="this.closest('page-lab-service-pattern').triggerAction('Report Gen')">📄 產出業務報告</button>
                </div>

                <div class="status-board">
                    <h3>📡 即時通訊軌跡</h3>
                    <div style="margin-bottom: 1rem;">
                        <div>狀態: ${this.state.serviceStatus}</div>
                        <div>同步: ${this.state.lastSync}</div>
                    </div>
                    <strong>事件日誌:</strong>
                    ${this.state.eventLogs.map(log => html`
                        <div class="event-log">[${log.time}] ${log.msg}</div>
                    `)}
                </div>
            </div>

            <section class="info-section">
                <h3>🎓 交互開發規範</h3>
                <ul>
                    <li><strong>Decoupling</strong>：組件不持有服務邏輯，僅透過事件響應。</li>
                    <li><strong>Lifecycle</strong>：務必在 <code>disconnectedCallback</code> 中解除訂閱以防洩漏。</li>
                    <li><strong>Single Source of Truth</strong>：Service 負責維護數據權威，組件負責反應式投影。</li>
                </ul>
                <a href="#/lab" class="btn btn-secondary btn-sm" style="margin-top: 1.5rem;">⬅️ 回實驗室列表</a>
            </section>
        `;
    }
}
customElements.define('page-lab-service-pattern', ServicePatternPage);
