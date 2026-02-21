import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { appStore } from '../../../lib/store.js';

export class LayoutPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            primary: '#007bff',
            spacing: 16,
            radius: 8
        });
    }

    updateVariable(key, value) {
        this.state[key] = value;
        const container = this.querySelector('.layout-demo-container');
        if (container) {
            container.style.setProperty(`--demo-${key}`, key === 'spacing' || key === 'radius' ? `${value}px` : value);
        }
    }

    render() {
        return html`
            <style>
                .layout-demo-container {
                    --demo-primary: ${this.state.primary};
                    --demo-spacing: ${this.state.spacing}px;
                    --demo-radius: ${this.state.radius}px;
                    padding: 2rem;
                    border: 2px dashed #ccc;
                    border-radius: 12px;
                    margin-top: 1rem;
                }
                .demo-card {
                    background: white;
                    padding: var(--demo-spacing);
                    border-radius: var(--demo-radius);
                    border-left: 5px solid var(--demo-primary);
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    margin-bottom: 1rem;
                }
                .control-panel {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                    background: #f8f9fa;
                    padding: 1.5rem;
                    border-radius: 8px;
                }
            </style>

            <div class="lab-header">
                <h2>🎨 原生佈局與主題 (CSS Variables)</h2>
                <p>探索如何利用現代 CSS 變數實作無框架、高性能的主題引擎。</p>
            </div>

            <div class="control-panel">
                <div>
                    <label>主題色 (Primary)</label>
                    <input type="color" .value="${this.state.primary}" 
                           oninput="this.closest('page-lab-layout').updateVariable('primary', this.value)">
                </div>
                <div>
                    <label>間距 (Spacing): ${this.state.spacing}px</label>
                    <input type="range" min="8" max="40" .value="${this.state.spacing}"
                           oninput="this.closest('page-lab-layout').updateVariable('spacing', this.value)">
                </div>
                <div>
                    <label>圓角 (Radius): ${this.state.radius}px</label>
                    <input type="range" min="0" max="30" .value="${this.state.radius}"
                           oninput="this.closest('page-lab-layout').updateVariable('radius', this.value)">
                </div>
            </div>

            <div class="layout-demo-container">
                <div class="demo-card">
                    <h4 style="margin:0; color: var(--demo-primary)">響應式卡片 A</h4>
                    <p>觀察當您調整左側滑桿時，間距與圓角的即時變化。</p>
                </div>
                <div class="demo-card">
                    <h4 style="margin:0; color: var(--demo-primary)">響應式卡片 B</h4>
                    <p>這完全不依賴 JavaScript 重新計算樣式，僅透過 CSS 變數繼承。</p>
                </div>
            </div>

            <section class="info-section">
                <h3>🎓 佈局核心模式</h3>
                <ul>
                    <li><strong>CSS Variables</strong>：實作系統級風格統一的標準。</li>
                    <li><strong>Fluid Typography</strong>：利用 <code>clamp()</code> 達成無斷點縮放。</li>
                    <li><strong>Zero Framework</strong>：不使用 Tailwind 也能擁有極高的開發效率。</li>
                </ul>
                <a href="#/lab" class="btn btn-secondary btn-sm" style="margin-top: 1.5rem;">⬅️ 回實驗室列表</a>
            </section>
        `;
    }
}
customElements.define('page-lab-layout', LayoutPage);
