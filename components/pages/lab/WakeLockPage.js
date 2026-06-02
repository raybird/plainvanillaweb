import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { notificationService } from "../../../lib/notification-service.js";

export class WakeLockPage extends BaseComponent {
  constructor() {
    super();
    this._wakeLock = null;
    this._timerId = null;
    this._visibleHandler = () => this.handleVisibilityChange();

    this.initReactiveState({
      supported: this.checkSupport(),
      isActive: false,
      startedAt: null,
      heldSeconds: 0,
      autoReacquire: true,
      lastReleaseReason: "尚未啟用",
    });
  }

  checkSupport() {
    return (
      typeof window !== "undefined" &&
      navigator &&
      navigator.wakeLock &&
      typeof navigator.wakeLock.request === "function"
    );
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._visibleHandler);
  }

  disconnectedCallback() {
    document.removeEventListener("visibilitychange", this._visibleHandler);
    this.stopTimer();
    this.releaseWakeLock("離開頁面自動釋放");
    super.disconnectedCallback();
  }

  startTimer() {
    this.stopTimer();
    this._timerId = window.setInterval(() => {
      if (!this.state.startedAt) {
        this.state.heldSeconds = 0;
        return;
      }
      const elapsed = Math.floor((Date.now() - this.state.startedAt) / 1000);
      this.state.heldSeconds = elapsed;
    }, 1000);
  }

  stopTimer() {
    if (this._timerId) {
      window.clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  formatDuration(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    const min = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${min}:${sec}`;
  }

  async acquireWakeLock() {
    if (!this.state.supported) {
      notificationService.warn("目前瀏覽器不支援 Screen Wake Lock API。");
      return;
    }

    if (document.visibilityState !== "visible") {
      notificationService.warn("頁面不可見時無法申請 Wake Lock。");
      return;
    }

    if (this._wakeLock && !this._wakeLock.released) {
      notificationService.info("Wake Lock 已在啟用中。");
      return;
    }

    try {
      const sentinel = await navigator.wakeLock.request("screen");
      this._wakeLock = sentinel;
      this.state.isActive = true;
      this.state.startedAt = Date.now();
      this.state.lastReleaseReason = "-";
      this.startTimer();

      sentinel.addEventListener("release", () => {
        const reason =
          document.visibilityState === "hidden"
            ? "頁面切到背景，系統已釋放"
            : "系統或省電策略已釋放";
        this.state.isActive = false;
        this.state.lastReleaseReason = reason;
        this.stopTimer();
      });

      notificationService.success("已啟用螢幕常亮模式。");
    } catch (error) {
      console.error("[WakeLock] acquire failed", error);
      notificationService.error("啟用 Wake Lock 失敗，請確認權限與裝置狀態。");
    }
  }

  async releaseWakeLock(reason = "手動關閉") {
    if (this._wakeLock) {
      try {
        await this._wakeLock.release();
      } catch (error) {
        console.error("[WakeLock] release failed", error);
      }
    }

    this._wakeLock = null;
    this.state.isActive = false;
    this.state.lastReleaseReason = reason;
    this.stopTimer();
    this.state.startedAt = null;
    this.state.heldSeconds = 0;
  }

  async handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      if (this.state.autoReacquire && !this.state.isActive) {
        await this.acquireWakeLock();
      }
      return;
    }

    if (this.state.isActive) {
      this.state.lastReleaseReason = "切到背景，等待回到前景後自動恢復";
    }
  }

  toggleAutoReacquire() {
    this.state.autoReacquire = !this.state.autoReacquire;
    notificationService.info(
      this.state.autoReacquire
        ? "已開啟回前景自動恢復"
        : "已關閉回前景自動恢復",
    );
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
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1rem;
          background: var(--card-bg);
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 999px;
          padding: 0.3rem 0.7rem;
          font-size: 0.86rem;
          border: 1px solid;
        }
        .status-on {
          color: var(--success);
          border-color: #6ee7b7;
          background: var(--success-subtle);
        }
        .status-off {
          color: var(--warning);
          border-color: #fcd34d;
          background: var(--warning-subtle);
        }
        .actions {
          margin-top: 0.9rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .kv {
          margin-top: 0.8rem;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          overflow: hidden;
        }
        .row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.55rem 0.75rem;
          background: var(--surface-color);
          border-bottom: 1px solid var(--border-color);
          font-size: 0.9rem;
        }
        .row:last-child {
          border-bottom: 0;
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

      <h2>💡 Screen Wake Lock API 常亮模式</h2>
      <div class="lab-card">
        <p>
          <small>
            在閱讀教學、展示流程或長時間掃碼時，避免螢幕自動熄滅；並示範回前景時的自動恢復策略。
          </small>
        </p>

        <div class="grid">
          <section class="card">
            <h3>控制面板</h3>
            <span
              class="status-pill ${this.state.isActive
                ? "status-on"
                : "status-off"}"
            >
              ${this.state.isActive ? "✅ 常亮中" : "🟡 未啟用"}
            </span>

            <div class="actions">
              <button
                class="btn btn-primary"
                onclick="this.closest('page-lab-wakelock').acquireWakeLock()"
                ${this.state.isActive ? "disabled" : ""}
              >
                🔓 啟用常亮
              </button>
              <button
                class="btn btn-danger"
                onclick="this.closest('page-lab-wakelock').releaseWakeLock()"
                ${this.state.isActive ? "" : "disabled"}
              >
                🔒 釋放常亮
              </button>
              <button
                class="btn btn-secondary"
                onclick="this.closest('page-lab-wakelock').toggleAutoReacquire()"
              >
                ${this.state.autoReacquire
                  ? "🟢 自動恢復：開"
                  : "⚪ 自動恢復：關"}
              </button>
            </div>
          </section>

          <section class="card">
            <h3>狀態資訊</h3>
            <div class="kv">
              <div class="row">
                <span>持續時間</span>
                <strong>${this.formatDuration(this.state.heldSeconds)}</strong>
              </div>
              <div class="row">
                <span>頁面可見度</span>
                <strong>${document.visibilityState}</strong>
              </div>
              <div class="row">
                <span>最後釋放原因</span>
                <strong>${this.state.lastReleaseReason}</strong>
              </div>
            </div>
          </section>
        </div>

        ${this.state.supported
          ? ""
          : html`
              <div class="support-note">
                目前環境不支援 Screen Wake Lock API。建議使用 Chromium
                系列瀏覽器，並在 HTTPS 或 localhost 測試。
              </div>
            `}
      </div>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}

customElements.define("page-lab-wakelock", WakeLockPage);
