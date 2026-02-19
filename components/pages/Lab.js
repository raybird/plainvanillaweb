import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

// 匯入子頁面組件
import './lab/LabIndex.js';
import './lab/SpeechPage.js';
import './lab/WebRTCPage.js';
import './lab/CryptoPage.js';
import './lab/WasmPage.js';
import './lab/SerialPage.js';
import './lab/FormsPage.js';
import './lab/CollabPage.js';
import './lab/MediaPage.js';

/**
 * LabPage - 實驗室佈局容器
 * 負責處理 /lab/* 巢狀路由
 */
export class LabPage extends BaseComponent {
    afterFirstRender() {
        // 強制觸發內部的 x-switch 更新，確保子路由被正確渲染
        const sw = this.querySelector('x-switch');
        if (sw && typeof sw.update === 'function') {
            sw.update();
        }
    }

    render() {
        return html`
            <style>
                .lab-header { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
                .lab-content { min-height: 400px; }
            </style>

            <div class="lab-header">
                <h1>🧪 Vanilla 實驗室 (Modern Web Lab)</h1>
                <p>探索最前沿的原生 Web 技術與工業級 API 實作。</p>
            </div>

            <div class="lab-content">
                <x-switch>
                    <!-- 預設首頁：支援 /lab 與 /lab/ -->
                    <x-route path="/lab" exact><page-lab-index></page-lab-index></x-route>
                    <x-route path="/lab/" exact><page-lab-index></page-lab-index></x-route>
                    
                    <!-- 功能隔離子路由 -->
                    <x-route path="/lab/speech"><page-lab-speech></page-lab-speech></x-route>
                    <x-route path="/lab/webrtc"><page-lab-webrtc></page-lab-webrtc></x-route>
                    <x-route path="/lab/crypto"><page-lab-crypto></page-lab-crypto></x-route>
                    <x-route path="/lab/wasm"><page-lab-wasm></page-lab-wasm></x-route>
                    <x-route path="/lab/serial"><page-lab-serial></page-lab-serial></x-route>
                    <x-route path="/lab/forms"><page-lab-forms></page-lab-forms></x-route>
                    <x-route path="/lab/collab"><page-lab-collab></page-lab-collab></x-route>
                    <x-route path="/lab/media"><page-lab-media></page-lab-media></x-route>
                </x-switch>
            </div>

            <section style="margin-top: 4rem; padding: 2rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 架構升級說明</h3>
                <p>實驗室現已採用<strong>巢狀路由 (Nested Routing)</strong> 設計：</p>
                <ul>
                    <li><strong>狀態隔離</strong>：每個子頁面擁有獨立的反應式狀態，互不干擾。</li>
                    <li><strong>按需載入</strong>：邏輯模組化，提升大型應用程式的穩定性。</li>
                    <li><strong>深度連結</strong>：支援直接訪問特定實驗頁面。</li>
                </ul>
            </section>
        `;
    }
}

customElements.define('page-lab', LabPage);
