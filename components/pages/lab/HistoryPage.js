import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { HistoryService } from "../../../lib/history-service.js";

// 用建立自己的 HistoryService 實例，避免與其他頁面汙染
const localHistory = new HistoryService(10);

export class HistoryPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            documentText: '在這邊隨便打些字吧！\n每打兩個字或是停頓一下我就會幫你做個快照。',
            canUndo: false,
            canRedo: false,
            undoCount: 0,
            redoCount: 0
        });

        // 綁定歷史紀錄狀態變更
        this._handleHistoryChange = (e) => {
            this.state.canUndo = e.detail.canUndo;
            this.state.canRedo = e.detail.canRedo;
            this.state.undoCount = e.detail.undoCount;
            this.state.redoCount = e.detail.redoCount;
        };

        this._saveTimeout = null;
    }

    connectedCallback() {
        super.connectedCallback();
        localHistory.addEventListener('change', this._handleHistoryChange);
        // 推入初始狀態
        localHistory.push(this.state.documentText);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        localHistory.removeEventListener('change', this._handleHistoryChange);
        localHistory.clear();
    }

    handleInput(e) {
        this.state.documentText = e.target.value;

        // 使用防抖(Debounce)進行存檔，避免每個字元都算一步
        if (this._saveTimeout) clearTimeout(this._saveTimeout);

        this._saveTimeout = setTimeout(() => {
            localHistory.push(this.state.documentText);
        }, 500); // 停頓 500ms 後算作完成一次關鍵輸入
    }

    handleUndo() {
        const previousState = localHistory.undo(this.state.documentText);
        if (previousState !== null) {
            this.state.documentText = previousState;
        }
    }

    handleRedo() {
        const nextState = localHistory.redo(this.state.documentText);
        if (nextState !== null) {
            this.state.documentText = nextState;
        }
    }

    render() {
        return html`
            <style>
                .history-container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 2rem;
                }
                .card {
                    background: var(--surface-color, #fff);
                    border-radius: 12px;
                    padding: 2rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }
                .editor-area {
                    margin: 1.5rem 0;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                textarea {
                    width: 100%;
                    height: 200px;
                    padding: 1rem;
                    font-size: 1rem;
                    line-height: 1.5;
                    border: 2px solid #e2e8f0;
                    border-radius: 8px;
                    resize: vertical;
                    font-family: inherit;
                }
                textarea:focus {
                    outline: none;
                    border-color: #8b5cf6;
                    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
                }
                .toolbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem;
                    background: #f8fafc;
                    border-radius: 8px;
                }
                .btn-group {
                    display: flex;
                    gap: 0.5rem;
                }
                button {
                    padding: 0.6rem 1.2rem;
                    border: 1px solid #cbd5e1;
                    background: #fff;
                    color: #334155;
                    border-radius: 6px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                button:hover:not(:disabled) {
                    background: #f1f5f9;
                    border-color: #94a3b8;
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .stacks {
                    display: flex;
                    gap: 2rem;
                    font-size: 0.9rem;
                    color: #64748b;
                }
                .stack-badge {
                    background: #e0e7ff;
                    color: #4338ca;
                    padding: 0.2rem 0.6rem;
                    border-radius: 999px;
                    font-weight: bold;
                    margin-left: 0.4rem;
                }
            </style>

            <div class="history-container">
                <div class="card">
                    <h2>⏪ 狀態回溯器 (Undo / Redo)</h2>
                    <p>
                        展示純原生開發下的<b>狀態快照模式 (Snapshot)</b>。透過防抖機制擷取文件斷點推入 <code>undoStack</code>，實現與主流編輯器一致的上一步/下一步功能，完全不倚靠 Redux 這些重型狀態庫。
                    </p>

                    <div class="editor-area">
                        <textarea 
                            oninput="this.closest('page-lab-history').handleInput(event)"
                            placeholder="開始輸入文字..."
                        >${this.state.documentText}</textarea>
                    </div>

                    <div class="toolbar">
                        <div class="btn-group">
                            <button 
                                onclick="this.closest('page-lab-history').handleUndo()" 
                                ${!this.state.canUndo ? 'disabled' : ''}>
                                ↩️ 復原 (Undo)
                            </button>
                            <button 
                                onclick="this.closest('page-lab-history').handleRedo()" 
                                ${!this.state.canRedo ? 'disabled' : ''}>
                                ↪️ 重做 (Redo)
                            </button>
                        </div>
                        
                        <div class="stacks">
                            <div>💾 復原堆疊 <span class="stack-badge">${this.state.undoCount}</span></div>
                            <div>⏳ 重做堆疊 <span class="stack-badge">${this.state.redoCount}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define("page-lab-history", HistoryPage);
