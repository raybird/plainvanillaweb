import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { crdtService } from "../../../lib/crdt-service.js";

export class CollabPage extends BaseComponent {
  constructor() {
    super();
    this.collabNote = crdtService.getValue("lab-note") || "";
    this.initReactiveState({
      crdtStatus: "Active (Node: " + crdtService.nodeId + ")",
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this._onChange = (data) => {
      if (data.id !== "lab-note") return;

      this.collabNote = data.value;
      const textarea = this.querySelector("#collab-note");
      if (!textarea) return;

      if (
        document.activeElement === textarea &&
        data.state?.nodeId === crdtService.nodeId
      ) {
        return;
      }

      textarea.value = data.value;
    };
    crdtService.on("change", this._onChange);

    const textarea = this.querySelector("#collab-note");
    if (textarea) {
      textarea.value = this.collabNote;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    crdtService.off("change", this._onChange);
  }

  handleCollabInput(value) {
    this.collabNote = value;
    crdtService.update("lab-note", value);
  }

  render() {
    return html`
      <div class="lab-card">
        <h3>🤝 CRDT 協作數據</h3>
        <p><small>試著開啟多個分頁並同時編輯下方區域。</small></p>
        <textarea
          id="collab-note"
          rows="5"
          oninput="this.closest('page-lab-collab').handleCollabInput(this.value)"
        >
${this.collabNote}</textarea
        >
      </div>
      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}
customElements.define("page-lab-collab", CollabPage);
