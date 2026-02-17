import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

export class HomePage extends BaseComponent {
    render() {
        return html`
            <div style="text-align: center; padding: 2rem 0;">
                <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">🍦 Plain Vanilla Web</h1>
                <p style="color: #666; font-size: 1.2rem;">現代、極簡、零相依的原生網頁開發範本</p>
                
                <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem;">
                    <a href="#/dashboard" style="background: var(--primary-color); color: white; padding: 0.8rem 1.5rem; border-radius: 6px; text-decoration: none; font-weight: bold;">
                        🚀 進入儀表板 (Live Demo)
                    </a>
                    <a href="https://github.com/raybird/plainvanillaweb" target="_blank" style="background: #e0e0e0; color: #333; padding: 0.8rem 1.5rem; border-radius: 6px; text-decoration: none;">
                        📂 查看原始碼
                    </a>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-top: 3rem;">
                <div style="padding: 1.5rem; background: var(--nav-bg); border-radius: 8px;">
                    <h3>⚡ 極致效能</h3>
                    <p>無 VDOM 開銷，內建 Web Worker 多線程運算支援。</p>
                </div>
                <div style="padding: 1.5rem; background: var(--nav-bg); border-radius: 8px;">
                    <h3>🛡️ 穩健架構</h3>
                    <p>整合 Error Boundary、Store 狀態管理與路由系統。</p>
                </div>
                <div style="padding: 1.5rem; background: var(--nav-bg); border-radius: 8px;">
                    <h3>📦 零相依性</h3>
                    <p>不需 npm install，直接由瀏覽器原生標準驅動。</p>
                </div>
            </div>
        `;
    }
}
customElements.define('page-home', HomePage);
