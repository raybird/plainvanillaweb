import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

/**
 * UI Card - 插槽系統範例組件
 * 展示如何分發內容到不同區域。
 */
export class UICard extends BaseComponent {
    render() {
        return html`
            <style>
                .vanilla-card {
                    border: 1px solid #ddd;
                    border-radius: 12px;
                    overflow: hidden;
                    background: var(--bg-color);
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                    margin-bottom: 1.5rem;
                    display: flex;
                    flex-direction: column;
                }
                .card-header {
                    padding: 1rem 1.5rem;
                    background: #f8f9fa;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                [data-theme="dark"] .card-header {
                    background: #333;
                    border-color: #444;
                }
                .card-body {
                    padding: 1.5rem;
                    flex: 1;
                }
                .card-footer {
                    padding: 1rem 1.5rem;
                    background: #fdfdfd;
                    border-top: 1px solid #eee;
                    font-size: 0.9rem;
                    color: #666;
                }
                [data-theme="dark"] .card-footer {
                    background: #2a2a2a;
                    border-color: #444;
                }
                .card-title {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: bold;
                }
            </style>

            <div class="vanilla-card">
                <div class="card-header">
                    <div class="card-title">${this.$slot('title') || 'Default Title'}</div>
                    <div class="card-actions">${this.$slot('actions')}</div>
                </div>
                <div class="card-body">
                    ${this.$slot()}
                </div>
                <div class="card-footer">
                    ${this.$slot('footer') || html`<em>Vanilla Component 2.2</em>`}
                </div>
            </div>
        `;
    }
}

customElements.define('ui-card', UICard);
