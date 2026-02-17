import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

export class HomePage extends BaseComponent {
    render() {
        const t = (k) => this.$t(k);
        
        return html`
            <style>
                .hero { padding: 3rem 0; text-align: center; background: linear-gradient(135deg, var(--primary-color), #0056b3); color: white; border-radius: 16px; margin-bottom: 3rem; }
                .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; }
                .feature-card { padding: 1.5rem; border: 1px solid #eee; border-radius: 12px; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; text-decoration: none; color: inherit; display: block; }
                .feature-card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.1); border-color: var(--primary-color); }
                .feature-card h3 { color: var(--primary-color); margin-top: 0; }
                .tag { font-size: 0.75rem; background: #e7f3ff; color: var(--primary-color); padding: 0.2rem 0.5rem; border-radius: 4px; margin-right: 0.5rem; font-weight: bold; }
            </style>

            <section class="hero">
                <h1>🍦 ${t('home.welcome')}</h1>
                <p style="font-size: 1.2rem; opacity: 0.9; max-width: 700px; margin: 1rem auto;">
                    ${t('home.desc')}
                </p>
                <div style="margin-top: 2rem;">
                    <a href="#/dashboard" style="background: white; color: var(--primary-color); padding: 0.8rem 2rem; border-radius: 30px; font-weight: bold; text-decoration: none;">
                        🚀 進入教學儀表板
                    </a>
                </div>
            </section>

            <h2>📘 核心教學單元 (Learning Modules)</h2>
            <div class="grid">
                <a href="#/search" class="feature-card">
                    <span class="tag">API</span><span class="tag">Fetching</span>
                    <h3>非同步數據處理</h3>
                    <p>學習如何在 Custom Elements 中優雅地處理 Fetch API、Loading 狀態與錯誤邊界。</p>
                </a>

                <a href="#/worker" class="feature-card">
                    <span class="tag">Performance</span><span class="tag">Multi-thread</span>
                    <h3>Web Workers 運算</h3>
                    <p>展示如何將耗時的演算法移至背景執行緒，確保瀏覽器 UI 始終流暢不卡頓。</p>
                </a>

                <a href="#/profile" class="feature-card">
                    <span class="tag">State</span><span class="tag">Assets</span>
                    <h3>狀態管理與資源</h3>
                    <p>深入理解 Proxy-based 狀態機、LocalStorage 持久化以及純前端的圖片資源管理。</p>
                </a>

                <a href="#/dashboard" class="feature-card">
                    <span class="tag">Tools</span><span class="tag">Monitoring</span>
                    <h3>開發者偵錯工具</h3>
                    <p>探索內建的網路監控器、IndexedDB 統計與記憶體觀察，這就是你的迷你 DevTools。</p>
                </a>
            </div>

            <section style="margin-top: 4rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>📜 為什麼選擇 Vanilla (原生)？</h3>
                <p>在框架齊放的年代，回歸原生標準能讓你擁有：</p>
                <ul>
                    <li><strong>長期穩定性</strong>：瀏覽器 API 幾乎永遠向下相容，代碼十年不壞。</li>
                    <li><strong>零建置成本</strong>：無需 Webpack/Vite，打開瀏覽器就能跑。</li>
                    <li><strong>極致效能</strong>：沒有框架的抽象層開銷，每一行代碼都直接服務於用戶。</li>
                </ul>
                <p>本專案透過 <strong>20 份架構決策紀錄 (ADR)</strong> 完整還原了從零到一構建複雜應用的思維過程。</p>
                <a href="https://github.com/raybird/plainvanillaweb/tree/master/docs/decisions" target="_blank">閱讀技術決策 (ADR) &rarr;</a>
            </section>
        `;
    }
}
customElements.define('page-home', HomePage);
