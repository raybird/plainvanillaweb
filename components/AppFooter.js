import { html } from '../lib/html.js';
import { BaseComponent } from '../lib/base-component.js';

export class AppFooter extends BaseComponent {
    render() {
        const year = new Date().getFullYear();
        return html`
            <style>
                footer {
                    margin-top: 3rem;
                    padding: 2rem 0;
                    border-top: 1px solid #eee;
                    text-align: center;
                    color: #666;
                    font-size: 0.9rem;
                }
                [data-theme="dark"] footer {
                    border-top-color: #333;
                    color: #aaa;
                }
                .footer-links {
                    margin-bottom: 0.5rem;
                }
                .footer-links a {
                    margin: 0 0.5rem;
                    color: inherit;
                    text-decoration: none;
                }
                .footer-links a:hover {
                    text-decoration: underline;
                    color: var(--primary-color);
                }
            </style>
            <footer>
                <div class="footer-links">
                    <a href="#/">首頁</a>
                    •
                    <a href="https://github.com/raybird/plainvanillaweb" target="_blank">GitHub 原始碼</a>
                    •
                    <a href="#/dashboard">開發者儀表板</a>
                    •
                    <a href="docs/decisions/" target="_blank">架構決策 (ADR)</a>
                </div>
                <div>
                    &copy; ${year} Plain Vanilla Web. Built with No Frameworks.
                </div>
                <div style="font-size: 0.8em; margin-top: 0.5rem; opacity: 0.7;">
                    Powered by TeleNexus AI Agent
                </div>
            </footer>
        `;
    }
}
customElements.define('app-footer', AppFooter);
