import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { HistoryService } from "../../../lib/history-service.js";

// 獨立實例，避免污染全局 history 服務
const localHistory = new HistoryService(10);

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

        this._saveTimeout = null;
    }

    connectedCallback() {
        super.connectedCallback();
        localHistory.addEventListener('change', this._handleHistoryChange);
        localHistory.push(this.state.documentText);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        localHistory.removeEventListener('change', this._handleHistoryChange);
        localHistory.clear();
    }

    handleInput(e) {
        this.state.documentText = e.target.value;

        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => {
            localHistory.push(this.state.documentText);
        }, 500);
    }

    handleUndo() {
        const prev = localHistory.undo(this.state.documentText);
        if (prev !== null) this.state.documentText = prev;
    }

    handleRedo() {
        const next = localHistory.redo(this.state.documentText);
        if (next !== null) this.state.documentText = next;
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>⏪ 狀態回溯器 (Undo / Redo)</h3>
                <p><small>以純 JS 的快照堆疊實現 Undo/Redo，不依賴 Redux 或任何外部狀態庫。防抖機制確保每次「停頓」才算一個操作步驟。</small></p>

                <textarea 
                    style="width: 100%; height: 180px; margin: 1rem 0; padding: 0.8rem; font-size: 1rem; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 8px; font-family: inherit; resize: vertical; color: #1e293b; background: #fff;"
                    oninput="this.closest('page-lab-history').handleInput(event)"
                    placeholder="開始輸入文字..."
                >${this.state.documentText}</textarea>

                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div class="btn-group">
                        <button 
                            class="btn btn-secondary"
                            onclick="this.closest('page-lab-history').handleUndo()"
                            ${!this.state.canUndo ? 'disabled' : ''}>
                            ↩️ 復原 (Undo)
                        </button>
                        <button 
                            class="btn btn-secondary"
                            onclick="this.closest('page-lab-history').handleRedo()"
                            ${!this.state.canRedo ? 'disabled' : ''}>
                            ↪️ 重做 (Redo)
                        </button>
                    </div>
                    <div style="font-size: 0.85rem; color: #64748b;">
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
