import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { authService } from '../../lib/auth-service.js';
import { router } from '../../lib/router.js';
import { notificationService } from '../../lib/notification-service.js';

export class LoginPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({ loading: false, error: null });
    }

    async handleLogin(e) {
        e.preventDefault();
        const form = e.target;
        const username = form.username.value;
        const password = form.password.value;

        this.state.loading = true;
        this.state.error = null;

        try {
            await authService.login(username, password);
            notificationService.success('登入成功！歡迎回來。');
            
            // 跳轉至首頁或先前想去的頁面
            router.push('/');
        } catch (err) {
            this.state.error = err.message;
            notificationService.error(err.message);
        } finally {
            this.state.loading = false;
        }
    }

    render() {
        const { loading, error } = this.state;

        return html`
            <style>
                .login-container { max-width: 400px; margin: 4rem auto; padding: 2.5rem; border: 1px solid #ddd; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); background: white; }
                [data-theme="dark"] .login-container { background: #2d2d2d; border-color: #444; }
                .input-group { margin-bottom: 1.5rem; }
                .input-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
                .input-group input { width: 100%; padding: 0.8rem; border: 1px solid #ccc; border-radius: 8px; font-size: 1rem; }
                button.btn-login { width: 100%; padding: 1rem; background: var(--primary-color); color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; transition: opacity 0.2s; }
                button.btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
                .error-box { color: #dc3545; background: #fff5f5; padding: 0.8rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.9rem; border: 1px solid #feb2b2; }
            </style>

            <div class="login-container">
                <h2 style="text-align:center; margin-top:0;">🔐 系統登入</h2>
                <p style="text-align:center; color:#666; font-size:0.9rem; margin-bottom:2rem;">請輸入您的憑證以存取受保護資源</p>

                ${error ? html`<div class="error-box">${error}</div>` : ''}

                <form id="login-form">
                    <div class="input-group">
                        <label>帳號 (Username)</label>
                        <input name="username" type="text" placeholder="請輸入 admin" required autofocus>
                    </div>
                    <div class="input-group">
                        <label>密碼 (Password)</label>
                        <input name="password" type="password" placeholder="請輸入 1234" required>
                    </div>
                    <button type="submit" class="btn-login" ${loading ? 'disabled' : ''}>
                        ${loading ? '正在驗證...' : '登入系統'}
                    </button>
                </form>
                
                <p style="text-align:center; margin-top:1.5rem; font-size:0.85rem; color:#888;">
                    這是 Vanilla Web 的受保護路由展示。<br>
                    提示：嘗試進入「個人資料」或「性能分析」將會觸發此頁面。
                </p>
            </div>
        `;
    }

    afterFirstRender() {
        this.querySelector('#login-form')?.addEventListener('submit', (e) => this.handleLogin(e));
    }
}

customElements.define('page-login', LoginPage);
