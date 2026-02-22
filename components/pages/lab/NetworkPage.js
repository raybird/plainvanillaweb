import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { connectivityService } from '../../../lib/connectivity-service.js';
import { notificationService } from '../../../lib/notification-service.js';

/**
 * NetworkPage - 原生網路資訊與連線實驗室
 */
export class NetworkPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isOnline: connectivityService.isOnline,
            networkInfo: connectivityService.networkInfo,
            beaconStatus: 'waiting'
        });
    }

    connectedCallback() {
        super.connectedCallback();
        connectivityService.on('status-change', ({ online }) => {
            this.state.isOnline = online;
            if (online) notificationService.success('網路已恢復連線');
            else notificationService.warn('目前處於離線狀態');
        });

        connectivityService.on('network-change', (info) => {
            this.state.networkInfo = info;
        });
    }

    testBeacon() {
        const testData = { event: 'lab_test', timestamp: Date.now() };
        const success = connectivityService.sendBeacon('https://httpbin.org/post', testData);
        this.state.beaconStatus = success ? 'sent' : 'failed';
        if (success) notificationService.info('Beacon 請求已發送至排程');
    }

    render() {
        return html`
            <style>
                .net-card { background: var(--card-bg); padding: 1.5rem; border-radius: 12px; border: 1px solid #eee; margin-bottom: 1rem; }
                .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
                .online { background: #28a745; box-shadow: 0 0 8px #28a745; }
                .offline { background: #dc3545; }
                .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem; }
                .info-item { padding: 1rem; background: #f8f9fa; border-radius: 8px; border: 1px solid #ddd; text-align: center; }
                .info-label { font-size: 0.75rem; color: #666; display: block; }
                .info-value { font-size: 1.1rem; font-weight: bold; color: var(--primary-color); }
            </style>

            <h2>🌐 網路資訊與連線性 (Network Information)</h2>
            <p>監控即時網路狀態、頻寬資訊，並示範可靠的數據背景傳輸技術。</p>

            <div class="net-card">
                <h3>連線狀態</h3>
                <div>
                    <span class="status-indicator ${this.state.isOnline ? 'online' : 'offline'}"></span>
                    <strong>${this.state.isOnline ? '在線 (Online)' : '離線 (Offline)'}</strong>
                </div>

                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">連線類型</span>
                        <span class="info-value">${this.state.networkInfo?.effectiveType || '不支援'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">預估頻寬</span>
                        <span class="info-value">${this.state.networkInfo?.downlink ? `${this.state.networkInfo.downlink} Mbps` : '不支援'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">延遲 (RTT)</span>
                        <span class="info-value">${this.state.networkInfo?.rtt ? `${this.state.networkInfo.rtt} ms` : '不支援'}</span>
                    </div>
                </div>
            </div>

            <div class="net-card">
                <h3>Beacon API (可靠傳輸)</h3>
                <p><small>Beacon API 確保數據在頁面關閉或導覽離開時仍能成功傳送，且不阻塞主執行緒。</small></p>
                <button class="btn btn-primary" onclick="this.closest('page-lab-network').testBeacon()">
                    🚀 測試發送 Beacon
                </button>
                <span style="margin-left: 1rem; font-size: 0.9rem; color: #666;">
                    狀態: ${this.state.beaconStatus}
                </span>
            </div>

            <section class="info-section">
                <h3>💡 技術要點</h3>
                <ul>
                    <li><strong>Online/Offline Events</strong>：監聽系統級的網路切換。</li>
                    <li><strong>Network Information API</strong>：動態調整資產下載策略（如 4G 下載高清圖，2G 下載縮圖）。</li>
                    <li><strong>Beacon API</strong>：完美的日誌與分析數據發送方案，不會像 Fetch 可能因頁面關閉而被取消。</li>
                </ul>
                <div style="margin-top: 1.5rem;">
                    <a href="#/docs/connectivity" class="btn btn-secondary btn-sm">📚 閱讀技術手冊</a>
                    <a href="#/lab" class="btn btn-secondary btn-sm">⬅️ 回到實驗室列表</a>
                </div>
            </section>
        `;
    }
}

customElements.define('page-lab-network', NetworkPage);
