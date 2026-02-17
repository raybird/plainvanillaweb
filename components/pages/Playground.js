import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { playgroundService } from '../../lib/playground-service.js';
import { notificationService } from '../../lib/notification-service.js';

export class PlaygroundPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            html: `<h1>Hello Vanilla!</h1>\n<button id="btn">Click Me</button>`,
            css: `body { font-family: system-ui; padding: 20px; }\nbutton { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }`,
            js: `document.getElementById("btn").addEventListener("click", () => {\n  alert("Native power!");\n});`,
            runnerUrl: ''
        });
        this._currentUrl = '';
    }

    connectedCallback() {
        super.connectedCallback();
        this.run();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        playgroundService.revokeUrl(this._currentUrl);
    }

    run() {
        playgroundService.revokeUrl(this._currentUrl);
        this._currentUrl = playgroundService.createRunnerUrl(
            this.state.html,
            this.state.css,
            this.state.js
        );
        this.state.runnerUrl = this._currentUrl;
        notificationService.success('程式碼已更新！');
    }

    handleInput(key, val) {
        this.state[key] = val;
    }

    render() {
        return html`
            <style>
                .playground-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                    height: calc(100vh - 250px);
                    min-height: 500px;
                }
                .editor-pane {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .editor-block {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .editor-block label {
                    font-size: 0.8rem;
                    font-weight: bold;
                    color: #666;
                    padding: 2px 5px;
                    background: #eee;
                    border-radius: 4px 4px 0 0;
                }
                textarea {
                    flex: 1;
                    width: 100%;
                    background: #272822;
                    color: #f8f8f2;
                    font-family: 'Fira Code', monospace;
                    font-size: 0.9rem;
                    padding: 10px;
                    border: none;
                    border-radius: 0 0 4px 4px;
                    resize: none;
                    tab-size: 2;
                }
                .preview-pane {
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    background: white;
                    display: flex;
                    flex-direction: column;
                }
                .preview-header {
                    padding: 5px 10px;
                    background: #f8f9fa;
                    border-bottom: 1px solid #ddd;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 0.8rem;
                }
                iframe {
                    flex: 1;
                    width: 100%;
                    border: none;
                }
                .toolbar {
                    margin-bottom: 1rem;
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                }
            </style>

            <h1>🎮 Vanilla 遊樂場 (Playground)</h1>
            <p>在這裡直接撰寫原生代碼並即時預覽執行結果。</p>

            <div class="toolbar">
                <button class="btn btn-primary" onclick="this.closest('page-playground').run()">🚀 執行程式碼 (Run)</button>
                <small style="color:#666;">提示：程式碼完全在您的瀏覽器中透過 Blob URL 執行，保證安全且極速。</small>
            </div>

            <div class="playground-container">
                <!-- 編輯區 -->
                <div class="editor-pane">
                    <div class="editor-block">
                        <label>HTML</label>
                        <textarea oninput="this.closest('page-playground').handleInput('html', this.value)">${this.state.html}</textarea>
                    </div>
                    <div class="editor-block">
                        <label>CSS</label>
                        <textarea oninput="this.closest('page-playground').handleInput('css', this.value)">${this.state.css}</textarea>
                    </div>
                    <div class="editor-block">
                        <label>JavaScript</label>
                        <textarea oninput="this.closest('page-playground').handleInput('js', this.value)">${this.state.js}</textarea>
                    </div>
                </div>

                <!-- 預覽區 -->
                <div class="preview-pane">
                    <div class="preview-header">
                        <span>預覽視窗 (Live Preview)</span>
                        <span style="color:#28a745;">● Running</span>
                    </div>
                    <iframe src="${this.state.runnerUrl}"></iframe>
                </div>
            </div>

            <section style="margin-top: 2rem; padding: 1.5rem; background: var(--nav-bg); border-radius: 12px;">
                <h3>🎓 技術解析：如何實作「遊樂場」？</h3>
                <ul>
                    <li><strong>Blob API</strong>：將字串程式碼封裝為二進位物件。</li>
                    <li><strong>URL.createObjectURL</strong>：為 Blob 建立一個指向本地記憶體的臨時 URL。</li>
                    <li><strong>Iframe 沙箱</strong>：透過 Iframe 隔離執行環境，避免腳本衝突。</li>
                </ul>
            </section>
        `;
    }
}

customElements.define('page-playground', PlaygroundPage);
