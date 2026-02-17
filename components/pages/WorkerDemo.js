import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { computeService } from '../../lib/worker-service.js';

export class WorkerDemo extends BaseComponent {
    constructor() {
        super();
        this.state = { result: null, computing: false, counter: 0 };
        this.onResult = this.onResult.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        computeService.addEventListener('done', this.onResult);
        // 主線程動畫計數器，用來證明主線程沒卡住
        this.timer = setInterval(() => {
            this.state.counter++;
            const counterEl = this.querySelector('#main-thread-counter');
            if (counterEl) counterEl.textContent = this.state.counter;
        }, 100);
    }

    disconnectedCallback() {
        computeService.removeEventListener('done', this.onResult);
        clearInterval(this.timer);
    }

    onResult(e) {
        this.state.result = e.detail.result;
        this.state.computing = false;
        this.update();
    }

    startCompute() {
        this.state.computing = true;
        this.state.result = null;
        this.update();
        // 執行費氏數列第 42 項 (相當耗時)
        computeService.run('fibonacci', 42);
    }

    render() {
        return html`
            <h1>Web Worker 高效能運算示範</h1>
            <p>本頁面示範如何將重型運算移至背景線程，保持 UI 流暢。</p>
            
            <div style="padding: 1rem; border: 2px dashed #ccc; margin-bottom: 1rem;">
                <strong>🧵 主線程狀態：</strong>
                <span id="main-thread-counter" style="font-size: 1.5rem; color: #28a745;">${this.state.counter}</span>
                <small>(此數值每 100ms 更新一次，若卡住代表主線程阻塞)</small>
            </div>

            <div style="padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                <button id="run-btn" ${this.state.computing ? 'disabled' : ''}>
                    ${this.state.computing ? '運算中 (背景)...' : '執行 Fib(42) 重型運算'}
                </button>
                <div style="margin-top: 1rem;">
                    <strong>運算結果：</strong> 
                    <span style="font-family: monospace; color: #007bff;">${this.state.result || '尚未開始'}</span>
                </div>
            </div>
        `;
    }

    afterFirstRender() {
        this.querySelector('#run-btn')?.addEventListener('click', () => this.startCompute());
    }
}
customElements.define('page-worker-demo', WorkerDemo);
