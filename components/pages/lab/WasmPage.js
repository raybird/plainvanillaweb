import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { wasmService } from '../../../lib/wasm-service.js';

export class WasmPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            wasmLoaded: false,
            wasmResult: null,
            wasmInputA: 10,
            wasmInputB: 20
        });
    }

    async runWasmDemo() {
        if (!this.state.wasmLoaded) {
            await wasmService.loadDemoAdd();
            this.state.wasmLoaded = true;
        }
        const exports = wasmService.get('demo-add');
        if (exports && exports.add) {
            this.state.wasmResult = exports.add(this.state.wasmInputA, this.state.wasmInputB);
        }
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>⚡ 高效能運算 (WebAssembly)</h3>
                <p><small>呼叫編譯自 C/Rust 的 WASM 模組。</small></p>
                <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                    <input type="number" placeholder="A" oninput="this.closest('page-lab-wasm').state.wasmInputA = Number(this.value)" value="${this.state.wasmInputA}">
                    <span>+</span>
                    <input type="number" placeholder="B" oninput="this.closest('page-lab-wasm').state.wasmInputB = Number(this.value)" value="${this.state.wasmInputB}">
                </div>
                <button class="btn btn-primary" onclick="this.closest('page-lab-wasm').runWasmDemo()">執行 WASM 加法</button>
                ${this.state.wasmResult !== null ? html`<div style="margin-top:1rem;">結果: <strong>${this.state.wasmResult}</strong></div>` : ''}
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-wasm', WasmPage);
