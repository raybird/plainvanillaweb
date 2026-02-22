import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { fileSystemService } from '../../../lib/file-system-service.js';
import { notificationService } from '../../../lib/notification-service.js';

/**
 * FileSystemPage - 原生檔案系統存取實驗室
 */
export class FileSystemPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isSupported: 'showDirectoryPicker' in window,
            directoryHandle: null,
            fileList: [],
            selectedFile: null,
            fileContent: '',
            isSaving: false
        });
    }

    async selectDirectory() {
        try {
            const handle = await fileSystemService.openDirectory();
            this.state.directoryHandle = handle;
            await this.refreshFileList();
            notificationService.success('目錄已開啟');
        } catch (err) {
            if (err.name !== 'AbortError') {
                notificationService.error('無法開啟目錄: ' + err.message);
            }
        }
    }

    async refreshFileList() {
        if (!this.state.directoryHandle) return;
        const files = await fileSystemService.listFiles(this.state.directoryHandle);
        this.state.fileList = files;
    }

    async openFile(fileHandle) {
        try {
            const content = await fileSystemService.readFile(fileHandle);
            this.state.selectedFile = fileHandle;
            this.state.fileContent = content;
            notificationService.info(`已讀取: ${fileHandle.name}`);
        } catch (err) {
            notificationService.error('讀取失敗: ' + err.message);
        }
    }

    async saveFile() {
        if (!this.state.selectedFile) return;
        this.state.isSaving = true;
        try {
            const ta = this.querySelector('#fs-editor');
            const content = ta?.value ?? this.state.fileContent;
            await fileSystemService.writeFile(this.state.selectedFile, content);
            notificationService.success('檔案已儲存至本地！');
        } catch (err) {
            notificationService.error('儲存失敗: ' + err.message);
        } finally {
            this.state.isSaving = false;
        }
    }

    render() {
        return html`
            <style>
                .fs-container { display: grid; grid-template-columns: 250px 1fr; gap: 1.5rem; height: 500px; }
                .file-sidebar { border: 1px solid #ddd; border-radius: 8px; overflow-y: auto; background: #f8f9fa; }
                .editor-main { border: 1px solid #ddd; border-radius: 8px; display: flex; flex-direction: column; }
                .file-item { padding: 0.6rem 1rem; border-bottom: 1px solid #eee; cursor: pointer; font-size: 0.9rem; transition: background 0.2s; }
                .file-item:hover { background: #edf2f7; }
                .file-item.active { background: var(--primary-color); color: white; }
                .editor-area { flex: 1; border: none; padding: 1rem; font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 0.95rem; resize: none; border-radius: 0 0 8px 8px; }
                .editor-header { padding: 0.5rem 1rem; background: #eee; border-bottom: 1px solid #ddd; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; }
                .empty-state { height: 100%; display: flex; align-items: center; justify-content: center; color: #999; text-align: center; }
            </style>

            <div class="lab-header">
                <h2>📁 檔案系統存取 (File System Access)</h2>
                <p>在瀏覽器中直接開啟本地目錄，實現讀取、編輯與儲存檔案的完整工作流。</p>
            </div>

            ${!this.state.isSupported ? html`
                <div class="alert alert-danger">
                    ⚠️ 您的瀏覽器目前不支援 <code>showDirectoryPicker</code> (File System Access API)。
                    建議使用 Chrome, Edge 或 Opera 桌面版體驗此功能。
                </div>
            ` : ''}

            <div class="btn-group" style="margin-bottom: 1rem;">
                <button class="btn btn-primary" ${!this.state.isSupported ? 'disabled' : ''} onclick="this.closest('page-lab-file-system').selectDirectory()">
                    📂 選擇本地目錄
                </button>
            </div>

            <div class="fs-container">
                <!-- 左側：檔案列表 -->
                <div class="file-sidebar">
                    ${this.state.fileList.length === 0 ? html`
                        <div class="empty-state"><small>請先開啟目錄</small></div>
                    ` : this.state.fileList.map(f => html`
                        <div class="file-item ${this.state.selectedFile?.name === f.name ? 'active' : ''}" 
                             onclick="this.closest('page-lab-file-system').openFile(f.handle)">
                            ${f.kind === 'directory' ? '📁' : '📄'} ${f.name}
                        </div>
                    `)}
                </div>

                <!-- 右側：內容編輯器 -->
                <div class="editor-main">
                    <div class="editor-header">
                        <span>${this.state.selectedFile ? `📍 ${this.state.selectedFile.name}` : '未選擇檔案'}</span>
                        <button class="btn btn-success btn-sm" 
                                ${!this.state.selectedFile || this.state.isSaving ? 'disabled' : ''}
                                onclick="this.closest('page-lab-file-system').saveFile()">
                            ${this.state.isSaving ? '💾 儲存中...' : '💾 儲存回本地'}
                        </button>
                    </div>
                    ${this.state.selectedFile ? html`
                        <textarea id="fs-editor" class="editor-area" 
                        >${this.state.fileContent}</textarea>
                    ` : html`
                        <div class="empty-state">點擊左側檔案進行編輯</div>
                    `}
                </div>
            </div>

            <section class="info-section" style="margin-top: 2rem;">
                <h3>🛡️ 安全與隱私說明</h3>
                <ul>
                    <li><strong>使用者授權</strong>：網頁必須在您每次重新整理後重新請求開啟目錄的授權。</li>
                    <li><strong>唯讀與讀寫</strong>：此範例請求 <code>readwrite</code> 權限以支援儲存功能。</li>
                    <li><strong>沙盒外存取</strong>：這不同於 IndexedDB，資料是真實儲存在您的實體硬碟中。</li>
                </ul>
                <div style="margin-top: 1.5rem;">
                    <a href="#/docs/file-system-access" class="btn btn-secondary btn-sm">📚 閱讀技術手冊</a>
                    <a href="#/lab" class="btn btn-secondary btn-sm">⬅️ 回到實驗室列表</a>
                </div>
            </section>
        `;
    }
}

customElements.define('page-lab-file-system', FileSystemPage);
