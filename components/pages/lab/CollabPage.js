import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { crdtService } from "../../../lib/crdt-service.js";

export class CollabPage extends BaseComponent {
  constructor() {
    super();
    this._collabNote = crdtService.getValue("lab-note") || "";
    this._textarea = null; // 持久化引用
    this.initReactiveState({
      crdtStatus: "Active",
      nodeId: crdtService.nodeId
    });
  }

  connectedCallback() {
    super.connectedCallback();
    
    this._onChange = (data) => {
      if (data.id !== "lab-note" || !this._textarea) return;

      const isLocal = data.state?.nodeId === crdtService.nodeId;
      if (isLocal) return;

      const start = this._textarea.selectionStart;
      const end = this._textarea.selectionEnd;
      const isFocused = document.activeElement === this._textarea;

      this._textarea.value = data.value;
      this._collabNote = data.value;

      if (isFocused) {
        this._textarea.setSelectionRange(start, end);
      }
    };

    crdtService.on("change", this._onChange);
  }

  afterFirstRender() {
    // 建立持久化編輯器節點
    this._textarea = document.createElement("textarea");
    this._textarea.id = "collab-note";
    this._textarea.setAttribute('data-persistent', 'editor'); // 標記為持久節點
    this._textarea.rows = 8;
    this._textarea.style.cssText = "width: 100%; font-family: monospace; padding: 1rem; border-radius: 8px; border: 1px solid #ddd; margin-top: 1rem;";
    this._textarea.placeholder = "在此輸入文字，其他分頁會即時同步...";
    this._textarea.value = this._collabNote;

    this._textarea.oninput = (e) => {
      this._collabNote = e.target.value;
      crdtService.update("lab-note", this._collabNote);
    };

    // 首次手動替換佔位符
    const placeholder = this.querySelector('[data-persistent-placeholder="editor"]');
    if (placeholder) {
        placeholder.replaceWith(this._textarea);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    crdtService.off("change", this._onChange);
  }

  render() {
    return html`
      <div class="lab-card">
        <h3>🤝 CRDT 協作數據</h3>
        <p><small>節點 ID: <code>${this.state.nodeId}</code> (試著開啟多個分頁同時編輯)</small></p>
        
        <div id="editor-container">
          <!-- 佔位符：底層引擎會自動在此還原持久節點 -->
          <div data-persistent-placeholder="editor"></div>
        </div>
      </div>
      
      <section class="info-section">
        <h3>💡 渲染優化說明</h3>
        <p><small>本頁面採用了『持久節點策略』。編輯器節點在初始化後即固定，不受全量重繪影響，這解決了 IME 輸入法的失焦與內容遺失問題。</small></p>
      </section>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
    `;
  }
}
customElements.define("page-lab-collab", CollabPage);
