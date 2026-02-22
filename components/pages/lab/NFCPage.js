import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { nfcService } from '../../../lib/nfc-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class NFCPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isScanning: false,
            lastTagId: '尚未掃描',
            readContent: '無數據',
            writeInput: 'Hello NFC!',
            nfcStatus: nfcService.isSupported ? '可用' : '不支援 (限 Android Chrome)'
        });
    }

    connectedCallback() {
        super.connectedCallback();

        this._onReading = ({ serialNumber }) => {
            this.state.lastTagId = serialNumber;
            notificationService.success('成功感應 NFC 標籤！');
        };

        this._onTextFound = (text) => {
            this.state.readContent = text;
        };

        nfcService.on('reading', this._onReading);
        nfcService.on('text-found', this._onTextFound);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        nfcService.off('reading', this._onReading);
        nfcService.off('text-found', this._onTextFound);
    }

    async runScan() {
        try {
            await nfcService.scan();
            this.state.isScanning = true;
            notificationService.info('請將設備靠近 NFC 標籤...');
        } catch (err) {
            notificationService.error(err.message);
        }
    }

    async runWrite() {
        try {
            await nfcService.write(this.state.writeInput);
            notificationService.success('資料已寫入標籤！');
        } catch (err) {
            notificationService.error('寫入失敗: ' + err.message);
        }
    }

    render() {
        return html`
            <style>
                .nfc-console { 
                    background: #1a1a1a; color: #00ff00; padding: 1rem; 
                    border-radius: 8px; font-family: monospace; font-size: 0.9rem;
                    margin: 1rem 0;
                }
            </style>
            <h2>📡 近場通訊 (Web NFC)</h2>
            <div class="lab-card">
                <div style="margin-bottom: 1rem;">
                    狀態: <span class="status-badge ${nfcService.isSupported ? 'success' : ''}">${this.state.nfcStatus}</span>
                </div>
                <p><small>讀取與寫入 NDEF 標籤。注意：目前僅 Android 上的 Chrome 支援此 API。</small></p>
                
                <div class="btn-group">
                    <button class="btn ${this.state.isScanning ? 'btn-success' : 'btn-primary'}" 
                            ${!nfcService.isSupported ? 'disabled' : ''}
                            onclick="this.closest('page-lab-nfc').runScan()">
                        ${this.state.isScanning ? '📶 正在掃描...' : '🔍 開始掃描'}
                    </button>
                </div>

                <div class="nfc-console">
                    <div>> ID: ${this.state.lastTagId}</div>
                    <div>> 內容: ${this.state.readContent}</div>
                </div>

                <hr>

                <h3>✍️ 寫入標籤</h3>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" placeholder="要寫入的文字..." 
                           value="${this.state.writeInput}"
                           oninput="this.closest('page-lab-nfc').state.writeInput = this.value"
                           style="margin-bottom: 0;">
                    <button class="btn btn-secondary" onclick="this.closest('page-lab-nfc').runWrite()">寫入</button>
                </div>
            </div>
            
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-nfc', NFCPage);
