import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { notificationService } from "../../../lib/notification-service.js";

export class BadgingPage extends BaseComponent {
  constructor() {
    super();
    this._originalTitle = "";
    this.initReactiveState({
      supported: this.checkSupport(),
      count: 0,
      useTitleFallback: true,
      lastAction: "尚未操作",
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this._originalTitle = document.title;
  }

  disconnectedCallback() {
    this.resetTitle();
    super.disconnectedCallback();
  }

  checkSupport() {
    return (
      typeof window !== "undefined" &&
      navigator &&
      typeof navigator.setAppBadge === "function" &&
      typeof navigator.clearAppBadge === "function"
    );
  }

  setTitleBadge(count) {
    if (!this.state.useTitleFallback) return;
    document.title =
      count > 0 ? `(${count}) ${this._originalTitle}` : this._originalTitle;
  }

  resetTitle() {
    if (this._originalTitle) {
      document.title = this._originalTitle;
    }
  }

  async applyBadge(count) {
    const safeCount = Math.max(0, Number(count) || 0);
    this.state.count = safeCount;

    if (this.state.supported) {
      try {
        if (safeCount === 0) {
          await navigator.clearAppBadge();
          this.state.lastAction = "已清除 App Badge";
        } else {
          await navigator.setAppBadge(safeCount);
          this.state.lastAction = `已設定 App Badge：${safeCount}`;
        }
      } catch (error) {
        console.error("[Badging] set badge failed", error);
        this.state.lastAction = "Badging API 呼叫失敗，已改走標題降級";
      }
    } else {
      this.state.lastAction = "此環境不支援 Badging API，使用標題降級";
    }

    this.setTitleBadge(safeCount);
  }

  increase() {
    this.applyBadge(this.state.count + 1);
  }

  decrease() {
    this.applyBadge(this.state.count - 1);
  }

  mockNotifications() {
    const next = 1 + Math.floor(Math.random() * 12);
    this.applyBadge(next);
    notificationService.info(`模擬收到 ${next} 筆未讀通知`);
  }

  clearBadge() {
    this.applyBadge(0);
    notificationService.success("已清除未讀徽章");
  }

  toggleTitleFallback() {
    this.state.useTitleFallback = !this.state.useTitleFallback;
    if (!this.state.useTitleFallback) {
      this.resetTitle();
    } else {
      this.setTitleBadge(this.state.count);
    }
  }

  render() {
    return html`
      <style>
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
          gap: 1rem;
        }
        .card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 1rem;
          background: #fff;
        }
        .count {
          margin-top: 0.8rem;
          font-size: 2rem;
          font-weight: 700;
          color: #0f172a;
        }
        .actions {
          margin-top: 1rem;
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .state {
          margin-top: 0.8rem;
          padding: 0.7rem;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .support-note {
          margin-top: 1rem;
          padding: 0.7rem;
          border-radius: 8px;
          background: #fff8e7;
          border: 1px solid #f1d8a8;
          color: #7c4a03;
        }
      </style>

      <h2>🔔 Badging API 應用徽章</h2>
      <div class="lab-card">
        <p>
          <small>
            使用 <code>navigator.setAppBadge()</code> 與
            <code>navigator.clearAppBadge()</code>
            設定未讀徽章，並示範不支援時以標題文字降級。
          </small>
        </p>

        <div class="grid">
          <section class="card">
            <h3>未讀計數</h3>
            <div class="count">${this.state.count}</div>
            <div class="actions">
              <button
                class="btn btn-primary"
                onclick="this.closest('page-lab-badging').increase()"
              >
                +1
              </button>
              <button
                class="btn btn-secondary"
                onclick="this.closest('page-lab-badging').decrease()"
              >
                -1
              </button>
              <button
                class="btn btn-secondary"
                onclick="this.closest('page-lab-badging').mockNotifications()"
              >
                模擬未讀
              </button>
              <button
                class="btn btn-danger"
                onclick="this.closest('page-lab-badging').clearBadge()"
              >
                清除徽章
              </button>
            </div>
          </section>

          <section class="card">
            <h3>執行狀態</h3>
            <div class="state">
              <div>
                <strong>API 支援：</strong>${this.state.supported ? "是" : "否"}
              </div>
              <div><strong>最後操作：</strong>${this.state.lastAction}</div>
              <div>
                <strong>標題降級：</strong>${this.state.useTitleFallback
                  ? "開啟"
                  : "關閉"}
              </div>
            </div>
            <div class="actions">
              <button
                class="btn btn-secondary"
                onclick="this.closest('page-lab-badging').toggleTitleFallback()"
              >
                切換標題降級
              </button>
            </div>
          </section>
        </div>

        ${this.state.supported
          ? ""
          : html`
              <div class="support-note">
                目前環境不支援 Badging API。建議在支援的 Chromium PWA 環境測試。
              </div>
            `}
      </div>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}

customElements.define("page-lab-badging", BadgingPage);
