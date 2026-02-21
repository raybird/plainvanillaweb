import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

export class ManifestoPage extends BaseComponent {
    render() {
        return html`
            <style>
                .manifesto-container { max-width: 800px; margin: 0 auto; padding: 4rem 1rem; line-height: 1.8; }
                .manifesto-header { text-align: center; margin-bottom: 4rem; }
                .manifesto-header h1 { font-size: 3rem; letter-spacing: -1px; margin-bottom: 1rem; }
                .principle { margin-bottom: 3rem; border-left: 4px solid var(--primary-color); padding-left: 1.5rem; }
                .principle h3 { font-size: 1.5rem; color: var(--primary-color); margin-top: 0; }
                .quote { font-style: italic; font-size: 1.2rem; color: #666; text-align: center; margin: 4rem 0; padding: 2rem; border-top: 1px solid #eee; border-bottom: 1px solid #eee; }
            </style>

            <div class="manifesto-container">
                <header class="manifesto-header">
                    <h1>🍦 Vanilla Manifesto</h1>
                    <p class="lead">追求長青代碼 (Evergreen Code) 的原生網頁開發宣言</p>
                </header>

                <div class="principle">
                    <h3>1. 標準優於框架 (Standards over Frameworks)</h3>
                    <p>框架會凋零，但 Web 標準永存。我們優先使用 Custom Elements、CSS Variables 與原生 Web APIs，確保代碼在十年後依然能無需編譯地在瀏覽器中運行。</p>
                </div>

                <div class="principle">
                    <h3>2. 零建置成本 (Zero Build)</h3>
                    <p>最好的建置步驟就是沒有建置步驟。利用原生 ESM 模組，我們讓開發回歸「存檔即重新整理」的直覺體驗，消滅複雜的工具鏈負擔。</p>
                </div>

                <div class="principle">
                    <h3>3. 最小抽象 (Minimal Abstraction)</h3>
                    <p>每一層抽象都是一種債務。我們僅在必要時建立輕量基底類別（如 BaseComponent），其目的在於輔助而非遮蔽原生 API 的本質。</p>
                </div>

                <div class="quote">
                    "Frameworks come and go, but the platform is forever."
                </div>

                <div class="principle">
                    <h3>4. 透明性與可觀測性 (Transparency)</h3>
                    <p>代碼應當易於理解與除錯。不使用黑盒魔法，所有的狀態流向與 DOM 更新都應清晰可見，這才是真正的生產力。</p>
                </div>

                <div style="text-align: center; margin-top: 5rem;">
                    <a href="#/" class="btn btn-primary">🚀 實踐原生精神</a>
                </div>
            </div>
        `;
    }
}
customElements.define('page-manifesto', ManifestoPage);
