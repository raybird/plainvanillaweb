import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { HistoryService } from "../../../lib/history-service.js";

export class HistoryPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            documentText: '在這邊隨便打些字吧！\n停頓 0.5 秒後我會自動做一個快照存進 Undo Stack。',
            canUndo: false,
            canRedo: false,
            undoCount: 0,
            redoCount: 0
        });

        this._handleHistoryChange = (e) => {
            this.state.canUndo = e.detail.canUndo;
            this.state.canRedo = e.detail.canRedo;
            this.state.undoCount = e.detail.undoCount;
            this.state.redoCount = e.detail.redoCount;
        };

        this._history = new HistoryService(10);
        this._committedText = this.state.documentText;
        this._saveTimeout = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._history.addEventListener('change', this._handleHistoryChange);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._history.removeEventListener('change', this._handleHistoryChange);
        clearTimeout(this._saveTimeout);
        this._saveTimeout = null;
    }

    handleInput(e) {
        this.state.documentText = e.target.value;
        clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => this._commitEdit(), 500);
    }

    _commitEdit() {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = null;
        if (this.state.documentText === this._committedText) return;
        this._history.push(this._committedText);
        this._committedText = this.state.documentText;
    }

    handleUndo() {
        this._commitEdit();
        const previous = this._history.undo(this.state.documentText);
        if (previous !== null) {
            this.state.documentText = previous;
            this._committedText = previous;
        }
    }

    handleRedo() {
        this._commitEdit();
        const next = this._history.redo(this.state.documentText);
        if (next !== null) {
            this.state.documentText = next;
            this._committedText = next;
        }
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>⏪ 狀態回溯器 (Undo / Redo)</h3>
                <p><small>以純 JS 的快照堆疊實現 Undo/Redo，不依賴 Redux 或任何外部狀態庫。防抖機制確保每次「停頓」才算一個操作步驟。</small></p>

                <label for="history-editor">編輯文字</label>
                <textarea id="history-editor"
                    style="width: 100%; height: 180px; margin: 1rem 0; padding: 0.8rem; font-size: 1rem; line-height: 1.6; border: 1px solid var(--border-color); border-radius: 8px; font-family: inherit; resize: vertical; color: var(--text-color); background: var(--card-bg);"
                    oninput="this.closest('page-lab-history').handleInput(event)"
                    placeholder="開始輸入文字..."
                >${this.state.documentText}</textarea>

                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div class="btn-group">
                        <button 
                            class="btn btn-secondary"
                            onclick="this.closest('page-lab-history').handleUndo()"
                            ${!this.state.canUndo && this.state.documentText === this._committedText ? 'disabled' : ''}>
                            ↩️ 復原 (Undo)
                        </button>
                        <button 
                            class="btn btn-secondary"
                            onclick="this.closest('page-lab-history').handleRedo()"
                            ${!this.state.canRedo || this.state.documentText !== this._committedText ? 'disabled' : ''}>
                            ↪️ 重做 (Redo)
                        </button>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">
                        復原堆疊：<span style="background: #e0e7ff; color: #4338ca; padding: 0.1rem 0.5rem; border-radius: 999px; font-weight: bold;">${this.state.undoCount}</span>
                        &nbsp;&nbsp;
                        重做堆疊：<span style="background: #e0e7ff; color: #4338ca; padding: 0.1rem 0.5rem; border-radius: 999px; font-weight: bold;">${this.state.redoCount}</span>
                    </div>
                </div>
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}

customElements.define("page-lab-history", HistoryPage);
