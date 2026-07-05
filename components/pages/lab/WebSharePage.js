import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { notificationService } from "../../../lib/notification-service.js";

export class WebSharePage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      supported: this.checkSupport(),
      title: "Plain Vanilla Web",
      text: "這是我用 Vanilla 原生技術打造的 Web 實驗室。",
      url:
        window.location.origin + window.location.pathname + "#/lab/web-share",
      lastResult: "尚未分享",
      inboundTitle: "",
      inboundText: "",
      inboundUrl: "",
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this.readInboundPayload();
  }

  checkSupport() {
    return (
      typeof navigator !== "undefined" && typeof navigator.share === "function"
    );
  }

  parseHashQuery() {
    // 解析 URL Search 參數 (即 # 之前的 query)
    const searchParams = new URLSearchParams(window.location.search);
    
    // 解析 Hash Query 參數 (即 # 之後的 query)
    const hash = window.location.hash || "";
    const queryIndex = hash.indexOf("?");
    const hashParams = queryIndex !== -1 
      ? new URLSearchParams(hash.slice(queryIndex + 1)) 
      : new URLSearchParams();
      
    // 合併兩者
    const merged = new URLSearchParams();
    for (const [key, val] of searchParams.entries()) {
      merged.set(key, val);
    }
    for (const [key, val] of hashParams.entries()) {
      merged.set(key, val);
    }
    return merged;
  }

  readInboundPayload() {
    const params = this.parseHashQuery();
    this.state.inboundTitle = params.get("share_title") || "";
    this.state.inboundText = params.get("share_text") || "";
    this.state.inboundUrl = params.get("share_url") || "";
  }

  updateField(field, value) {
    this.state[field] = value;
  }

  getPayload() {
    return {
      title: this.state.title,
      text: this.state.text,
      url: this.state.url,
    };
  }

  async shareNow() {
    if (!this.state.supported) {
      notificationService.warn(
        "目前環境不支援 Web Share API，請改用複製分享內容。",
      );
      this.state.lastResult = "不支援 Web Share API";
      return;
    }

    try {
      await navigator.share(this.getPayload());
      this.state.lastResult = "分享成功";
      notificationService.success("已開啟系統分享面板並送出內容");
    } catch (error) {
      if (error?.name === "AbortError") {
        this.state.lastResult = "使用者取消分享";
        notificationService.info("你已取消分享");
        return;
      }
      this.state.lastResult = `分享失敗：${error?.name || "UnknownError"}`;
      notificationService.error("分享失敗，請稍後再試");
    }
  }

  async copyPayload() {
    const payload = this.getPayload();
    const text = `title: ${payload.title}\ntext: ${payload.text}\nurl: ${payload.url}`;
    try {
      await navigator.clipboard.writeText(text);
      this.state.lastResult = "已複製分享內容";
      notificationService.success("已複製分享內容到剪貼簿");
    } catch {
      this.state.lastResult = "剪貼簿不可用";
      notificationService.warn("剪貼簿不可用，請手動複製內容");
    }
  }

  fillDemoPayload() {
    this.state.title = "Vanilla WebShare Demo";
    this.state.text = "用原生 API 分享教學頁，零套件、可降級、可追蹤。";
    this.state.url = `${window.location.origin}${window.location.pathname}#/docs/web-share`;
  }

  renderInboundPanel() {
    if (
      !this.state.inboundTitle &&
      !this.state.inboundText &&
      !this.state.inboundUrl
    ) {
      return html` <p><small>目前沒有從 Share Target 帶入的資料。</small></p> `;
    }

    return html`
      <div class="inbound-item">
        <strong>title：</strong>${this.state.inboundTitle}
      </div>
      <div class="inbound-item">
        <strong>text：</strong>${this.state.inboundText}
      </div>
      <div class="inbound-item">
        <strong>url：</strong>${this.state.inboundUrl}
      </div>
    `;
  }

  render() {
    return html`
      <style>
        .share-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
        }
        .panel {
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1rem;
          background: var(--card-bg);
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          margin-bottom: 0.75rem;
        }
        .field input,
        .field textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 0.55rem 0.65rem;
          font: inherit;
        }
        .field textarea {
          min-height: 100px;
          resize: vertical;
        }
        .actions {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
          margin-top: 0.6rem;
        }
        .status {
          margin-top: 0.7rem;
          padding: 0.65rem;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background: var(--surface-color);
        }
        .support-note {
          margin-top: 0.8rem;
          padding: 0.65rem;
          border-radius: 8px;
          background: #fff8e7;
          border: 1px solid #f1d8a8;
          color: #7c4a03;
        }
        .inbound-item {
          margin-bottom: 0.45rem;
          word-break: break-word;
        }
      </style>

      <h2>📤 Web Share API 系統分享</h2>
      <div class="lab-card">
        <p>
          <small>
            示範 <code>navigator.share()</code> 與 Share Target
            接收資料流程，並提供剪貼簿降級策略。
          </small>
        </p>

        <div class="share-grid">
          <section class="panel">
            <h3>發送分享內容</h3>
            <div class="field">
              <label for="share-title">Title</label>
              <input
                id="share-title"
                value="${this.state.title}"
                oninput="this.closest('page-lab-web-share').updateField('title', this.value)"
              />
            </div>
            <div class="field">
              <label for="share-text">Text</label>
              <textarea
                id="share-text"
                oninput="this.closest('page-lab-web-share').updateField('text', this.value)"
              >
${this.state.text}</textarea
              >
            </div>
            <div class="field">
              <label for="share-url">URL</label>
              <input
                id="share-url"
                value="${this.state.url}"
                oninput="this.closest('page-lab-web-share').updateField('url', this.value)"
              />
            </div>

            <div class="actions">
              <button
                class="btn btn-primary"
                onclick="this.closest('page-lab-web-share').shareNow()"
              >
                立即分享
              </button>
              <button
                class="btn btn-secondary"
                onclick="this.closest('page-lab-web-share').copyPayload()"
              >
                複製降級內容
              </button>
              <button
                class="btn btn-secondary"
                onclick="this.closest('page-lab-web-share').fillDemoPayload()"
              >
                套用示例
              </button>
            </div>

            <div class="status">
              <div>
                <strong>API 支援：</strong>${this.state.supported ? "是" : "否"}
              </div>
              <div><strong>結果：</strong>${this.state.lastResult}</div>
            </div>

            ${this.state.supported
              ? ""
              : html`
                  <div class="support-note">
                    此瀏覽器不支援 Web Share API。建議改用手機瀏覽器或 PWA
                    測試。
                  </div>
                `}
          </section>

          <section class="panel">
            <h3>Share Target 接收區</h3>
            <p>
              <small>
                當系統把分享資料導向本頁（<code>#/lab/web-share?share_title=...</code>）時，可在此檢視接收結果。
              </small>
            </p>
            ${this.renderInboundPanel()}
          </section>
        </div>
      </div>

      <div
        style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;"
      >
        <a href="#/docs/web-share" class="btn btn-secondary">📘 讀技術手冊</a>
        <a href="#/lab" class="btn btn-secondary">⬅️ 回實驗室首頁</a>
      </div>
    `;
  }
}

customElements.define("page-lab-web-share", WebSharePage);
