import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { playgroundService } from '../../lib/playground-service.js';
import { notificationService } from '../../lib/notification-service.js';
import { fileSystemService } from '../../lib/file-system-service.js'; // 引入檔案系統服務

export class PlaygroundPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            html: `<h1>Hello Vanilla!</h1>\n<button id="btn">Click Me</button>`,
            css: `body { font-family: system-ui; padding: 20px; }\nbutton { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }`,
            js: `document.getElementById("btn").addEventListener("click", () => {\n  alert("Native power!");\n});`,
            runnerUrl: '',
            isLocalMode: false,
            localDirName: ''
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

    async openLocalProject() {
        try {
            const handle = await fileSystemService.openDirectory();
            this.state.localDirName = handle.name;
            this.state.isLocalMode = true;

            // 嘗試載入標準檔案
            const files = await fileSystemService.listFiles();
            for (const f of files) {
                if (f.name.toLowerCase() === 'index.html') {
                    this.state.html = await fileSystemService.readFile(f.handle);
                } else if (f.name.toLowerCase() === 'style.css' || f.name.toLowerCase() === 'index.css') {
                    this.state.css = await fileSystemService.readFile(f.handle);
                } else if (f.name.toLowerCase() === 'app.js' || f.name.toLowerCase() === 'index.js') {
                    this.state.js = await fileSystemService.readFile(f.handle);
                }
            }
            notificationService.success(`已載入專案: ${handle.name}`);
            this.run();
        } catch (err) {
            if (err.name !== 'AbortError') {
                notificationService.error('無法開啟目錄');
            }
        }
    }

    async saveToLocal() {
        if (!this.state.isLocalMode) return;
        try {
            // 儲存 HTML
            const hHandle = await fileSystemService.getFileHandle('index.html', true);
            await fileSystemService.writeFile(hHandle, this.state.html);

            // 儲存 CSS
            const cHandle = await fileSystemService.getFileHandle('style.css', true);
            await fileSystemService.writeFile(cHandle, this.state.css);

            // 儲存 JS
            const jHandle = await fileSystemService.getFileHandle('app.js', true);
            await fileSystemService.writeFile(jHandle, this.state.js);

            notificationService.success('本地檔案已儲存！');
        } catch (err) {
            notificationService.error('儲存失敗: ' + err.message);
        }
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
                    height: calc(100vh - 280px);
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
                    color: var(--text-muted);
                    padding: 2px 5px;
                    background: var(--surface-color);
                    border-radius: 4px 4px 0 0;
                }
                textarea {
                    flex: 1;
                    width: 100%;
                    background: #1e1e2e;
                    color: #cdd6f4;
                    font-family: 'Fira Code', monospace;
                    font-size: 0.9rem;
                    padding: 10px;
                    border: none;
                    border-radius: 0 0 4px 4px;
                    resize: none;
                    tab-size: 2;
                }
                .preview-pane {
                    border: 1px solid var(--card-border);
                    border-radius: 8px;
                    background: var(--card-bg);
                    display: flex;
                    flex-direction: column;
                }
                .preview-header {
                    padding: 5px 10px;
                    background: var(--surface-color);
                    border-bottom: 1px solid var(--border-color);
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
                    flex-wrap: wrap;
                }
                .mode-badge {
                    font-size: 0.7rem;
                    padding: 2px 8px;
                    border-radius: 10px;
                    background: var(--surface-color);
                    color: var(--text-muted);
                    border: 1px solid var(--border-color);
                }
                .mode-badge.local {
                    background: #ecfdf5;
                    color: #065f46;
                    border: 1px solid #6ee7b7;
                }
                [data-theme="dark"] .mode-badge.local {
                    background: #052e16;
                    color: #6ee7b7;
                    border-color: #166534;
                }
            </style>

            <h1>🎮 Vanilla 遊樂場 (Playground)</h1>
            <p>在這裡直接撰寫原生代碼並即時預覽執行結果。</p>

            <div class="toolbar">
                <button class="btn btn-primary" onclick="this.closest('page-playground').run()">🚀 執行 (Run)</button>
                <button class="btn btn-secondary" onclick="this.closest('page-playground').openLocalProject()">📂 開啟本地目錄</button>
                <button class="btn btn-success" 
                        ${!this.state.isLocalMode ? 'disabled' : ''}
                        onclick="this.closest('page-playground').saveToLocal()">💾 儲存至本地</button>
                
                ${this.state.isLocalMode
                ? html`<span class="mode-badge local">💻 本地模式: ${this.state.localDirName}</span>`
                : html`<span class="mode-badge">☁️ 雲端暫存模式</span>`
            }
            </div>

            <div class="playground-container">
                <!-- 編輯區 -->
                <div class="editor-pane">
                    <div class="editor-block">
                        <label>HTML (index.html)</label>
                        <textarea oninput="this.closest('page-playground').handleInput('html', this.value)">${this.state.html}</textarea>
                    </div>
                    <div class="editor-block">
                        <label>CSS (style.css)</label>
                        <textarea oninput="this.closest('page-playground').handleInput('css', this.value)">${this.state.css}</textarea>
                    </div>
                    <div class="editor-block">
                        <label>JavaScript (app.js)</label>
                        <textarea oninput="this.closest('page-playground').handleInput('js', this.value)">${this.state.js}</textarea>
                    </div>
                </div>

                <!-- 預覽區 -->
                <div class="preview-pane">
                    <div class="preview-header">
                        <span>預覽視窗 (Live Preview)</span>
                        <span style="color:#22c55e;">● Running</span>
                    </div>
                    <iframe src="${this.state.runnerUrl}"></iframe>
                </div>
            </div>

            <section style="margin-top: 2rem; padding: 1.5rem; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px;">
                <h3>🎓 技術解析：如何實作「原生開發環境」？</h3>
                <ul>
                    <li><strong>File System Access API</strong>：讓網頁具備請求存取使用者指定目錄的權限。</li>
                    <li><strong>FileSystemHandle</strong>：保留對檔案或目錄的引用，支援非同步讀寫。</li>
                    <li><strong>無工具鏈工作流</strong>：無需編譯器，瀏覽器直接將代碼寫入硬碟，實踐真正的 Vanilla 開發。</li>
                </ul>
            </section>
        `;
    }
}

customElements.define('page-playground', PlaygroundPage);
