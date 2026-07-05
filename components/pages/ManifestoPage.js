import { html, unsafe } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { docService } from '../../lib/doc-service.js';

export class ManifestoPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            content: '努力載入宣言中...'
        });
    }

    async connectedCallback() {
        super.connectedCallback();
        // 動態抓取 docs/manifesto.md 教學文件並轉為 HTML
        const htmlContent = await docService.getDoc('manifesto');
        this.state.content = htmlContent;
    }

    render() {
        return html`
            <style>
                .manifesto-container { 
                    max-width: 800px; 
                    margin: 0 auto; 
                    padding: 4rem 1rem; 
                    line-height: 1.8; 
                }
                /* 提供給 Markdown 生成的標籤基礎樣式 */
                .manifesto-container h1 { font-size: 2.5rem; text-align: center; margin-bottom: 1rem; }
                .manifesto-container h2 { font-size: 1.5rem; color: var(--primary-color); margin-top: 3rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }
                .manifesto-container blockquote { 
                    font-style: italic; 
                    font-size: 1.1rem; 
                    color: var(--text-muted); 
                    margin: 2rem 0; 
                    padding: 1rem 2rem; 
                    border-left: 4px solid var(--primary-color);
                    background: var(--primary-subtle);
                }
            </style>

            <div class="manifesto-container">
                <div style="text-align: center; margin-bottom: 2rem;">
                    <span style="font-size: 4rem;">🍦</span>
                </div>
                
                ${unsafe(this.state.content)}

                <div style="text-align: center; margin-top: 5rem;">
                    <a href="#/" class="btn btn-primary">🚀 實踐原生精神</a>
                </div>
            </div>
        `;
    }
}
customElements.define('page-manifesto', ManifestoPage);
