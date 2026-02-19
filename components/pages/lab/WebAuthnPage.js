import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { webauthnService } from '../../../lib/webauthn-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class WebAuthnPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            credentials: webauthnService.getCredentials(),
            isSupported: webauthnService.isSupported
        });
    }

    async runRegister() {
        const username = prompt('請輸入要綁定的名稱 (例如: 我的 iPhone):', 'Vanilla User');
        if (!username) return;

        try {
            await webauthnService.register(username);
            this.state.credentials = webauthnService.getCredentials();
            notificationService.success('生物辨識綁定成功！');
        } catch (err) {
            notificationService.error('註冊失敗: ' + err.message);
        }
    }

    async runAuth() {
        try {
            const success = await webauthnService.authenticate();
            if (success) {
                notificationService.success('生物辨識驗證成功！');
            }
        } catch (err) {
            notificationService.error('驗證失敗: ' + err.message);
        }
    }

    clearAll() {
        if (confirm('確定要移除所有已儲存的憑證嗎？')) {
            webauthnService.clearCredentials();
            this.state.credentials = [];
            notificationService.info('憑證已清除');
        }
    }

    render() {
        return html`
            <style>
                .cred-list { margin-top: 1.5rem; text-align: left; }
                .cred-item { 
                    padding: 1rem; border: 1px solid #eee; border-radius: 8px; margin-bottom: 0.5rem;
                    display: flex; justify-content: space-between; align-items: center; background: #fff;
                }
                .cred-info h4 { margin: 0; color: var(--primary-color); }
                .cred-info small { color: #999; }
            </style>

            <h2>🔐 生物辨識驗證 (WebAuthn)</h2>
            <div class="lab-card">
                <div style="margin-bottom: 1rem;">
                    狀態: <span class="status-badge ${this.state.isSupported ? 'success' : ''}">
                        ${this.state.isSupported ? '支援' : '不支援 (需 HTTPS)'}
                    </span>
                </div>
                <p><small>使用裝置原生的 FaceID, TouchID 或 Windows Hello 進行身分驗證。這代表了現代網頁的最高安全標準。</small></p>
                
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="this.closest('page-lab-webauthn').runRegister()">➕ 註冊新憑證</button>
                    <button class="btn btn-success" ?disabled="${this.state.credentials.length === 0}" onclick="this.closest('page-lab-webauthn').runAuth()">🔑 執行驗證</button>
                    <button class="btn btn-secondary" onclick="this.closest('page-lab-webauthn').clearAll()">🧹 清除憑證</button>
                </div>

                <div class="cred-list">
                    <h3>已註冊憑證 (${this.state.credentials.length})</h3>
                    ${this.state.credentials.length === 0 ? html`<p style="color:#999; text-align:center;">尚未註冊憑證</p>` : this.state.credentials.map(c => html`
                        <div class="cred-item">
                            <div class="cred-info">
                                <h4>👤 ${c.username}</h4>
                                <small>ID: ${c.id.substring(0, 15)}...</small><br>
                                <small>建立時間: ${new Date(c.createdAt).toLocaleString()}</small>
                            </div>
                            <span class="status-badge success">已啟動</span>
                        </div>
                    `)}
                </div>
            </div>
            
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-webauthn', WebAuthnPage);
