import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { cryptoService } from '../../../lib/crypto-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class CryptoPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            cryptoInput: '這是一段敏感內容',
            cryptoPass: 'password123',
            encryptedData: null,
            decryptedResult: '',
            hashResult: ''
        });
    }

    async runEncrypt() {
        try {
            this.state.encryptedData = await cryptoService.encrypt(this.state.cryptoInput, this.state.cryptoPass);
            notificationService.success('加密成功');
        } catch (err) {
            notificationService.error('加密失敗');
        }
    }

    async runDecrypt() {
        if (!this.state.encryptedData) return;
        try {
            this.state.decryptedResult = await cryptoService.decrypt(this.state.encryptedData, this.state.cryptoPass);
            notificationService.success('解密成功');
        } catch (err) {
            notificationService.error('解密失敗，請檢查密碼');
        }
    }

    async runHash() {
        this.state.hashResult = await cryptoService.hash(this.state.cryptoInput);
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>🔐 原生加密 (SubtleCrypto)</h3>
                <p><small>基於瀏覽器標準的高強度加解密。</small></p>
                <input type="text" placeholder="輸入要加密的內容" oninput="this.closest('page-lab-crypto').state.cryptoInput = this.value" value="${this.state.cryptoInput}">
                <input type="password" placeholder="設定密碼" oninput="this.closest('page-lab-crypto').state.cryptoPass = this.value" value="${this.state.cryptoPass}">
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="this.closest('page-lab-crypto').runEncrypt()">🔒 加密</button>
                    <button class="btn btn-success" ?disabled="${!this.state.encryptedData}" onclick="this.closest('page-lab-crypto').runDecrypt()">🔓 解密</button>
                    <button class="btn btn-secondary" onclick="this.closest('page-lab-crypto').runHash()">#️⃣ Hash</button>
                </div>
                ${this.state.decryptedResult ? html`<div style="margin-top:1rem; font-size:0.8rem;">解密結果: <br><code>${this.state.decryptedResult}</code></div>` : ''}
                ${this.state.hashResult ? html`<div style="margin-top:1rem; font-size:0.7rem; color:#666; word-break:break-all;">SHA-256: ${this.state.hashResult}</div>` : ''}
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-crypto', CryptoPage);
