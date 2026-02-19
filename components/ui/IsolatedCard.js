import { BaseComponent } from '../../lib/base-component.js';
import { html } from '../../lib/html.js';

export class IsolatedCard extends BaseComponent {
    static useShadow = true;

    render() {
        return html`
            ${BaseComponent.css`
                :host {
                    display: block;
                    border: 2px solid var(--primary-color, #007bff);
                    border-radius: 12px;
                    padding: 1.5rem;
                    background: #fff;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    margin: 1rem 0;
                    color: #333;
                }
                
                /* 故意使用一個常見的 class 名稱，展示它不會受到外部影響 */
                .title {
                    font-size: 1.25rem;
                    font-weight: bold;
                    color: #d63384; /* 粉紅色，與全域標題區隔 */
                    margin-bottom: 0.5rem;
                    border-bottom: 2px solid #eee;
                }
                
                .content {
                    font-size: 1rem;
                    line-height: 1.5;
                }

                ::slotted([slot="footer"]) {
                    margin-top: 1rem;
                    padding-top: 0.5rem;
                    border-top: 1px solid #ddd;
                    font-size: 0.8rem;
                    color: #666;
                }
            `}
            <div class="title">
                ${this.getAttribute('title') || '隔離組件 (Shadow DOM)'}
            </div>
            <div class="content">
                ${this.$slot()}
            </div>
            <div class="footer">
                ${this.$slot('footer')}
            </div>
        `;
    }
}

customElements.define('x-isolated-card', IsolatedCard);
