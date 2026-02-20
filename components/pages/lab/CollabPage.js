import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { crdtService } from "../../../lib/crdt-service.js";

export class CollabPage extends BaseComponent {
  constructor() {
    super();
    // 使用內部變數而非 reactive state 儲存大型文字，避免每次變動觸發 innerHTML 重繪導致失焦
    this._collabNote = crdtService.getValue("lab-note") || "";
    this.initReactiveState({
      crdtStatus: "Active",
      nodeId: crdtService.nodeId
    });
  }

  connectedCallback() {
    super.connectedCallback();
    
    // 關鍵優化：手動管理 DOM 更新，避開 BaseComponent 的 innerHTML 刷新
    this._onChange = (data) => {
      if (data.id !== "lab-note") return;

      const textarea = this.querySelector("#collab-note");
      if (!textarea) return;

      // 檢查是否是本地輸入觸發的事件 (nodeId 相同)
      const isLocal = data.state?.nodeId === crdtService.nodeId;
      if (isLocal) return;

      // 遠端更新邏輯
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const isFocused = document.activeElement === textarea;

      // 局部更新內容
      textarea.value = data.value;
      this._collabNote = data.value;

      // 如果有焦點，恢復游標位置 (防止遠端同步導致游標跳到結尾)
      if (isFocused) {
        textarea.setSelectionRange(start, end);
      }
    };

    crdtService.on("change", this._onChange);

    // 初始同步
    const textarea = this.querySelector("#collab-note");
    if (textarea) {
      textarea.value = this._collabNote;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    crdtService.off("change", this._onChange);
  }

  handleCollabInput(value) {
    this._collabNote = value;
    crdtService.update("lab-note", value);
  }

  render() {
    return html`
      <div class="lab-card">
        <h3>🤝 CRDT 協作數據</h3>
        <p><small>節點 ID: <code>${this.state.nodeId}</code> (試著開啟多個分頁同時編輯)</small></p>
        
        <textarea
          id="collab-note"
          rows="8"
          style="width: 100%; font-family: monospace; padding: 1rem; border-radius: 8px; border: 1px solid #ddd;"
          oninput="this.closest('page-lab-collab').handleCollabInput(this.value)"
          placeholder="在此輸入文字，其他分頁會即時同步..."
        ></textarea>
      </div>
      
      <section class="info-section">
        <h3>💡 渲染優化說明</h3>
        <p><small>為了保證輸入流暢，此組件採用了「局部 DOM 更新」策略。來自遠端的同步僅會修改 <code>textarea.value</code>，而不會觸發組件重繪，從而完整保留您的打字焦點與游標位置。</small></p>
      </section>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
    `;
  }
}
customElements.define("page-lab-collab", CollabPage);
