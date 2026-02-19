import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { notificationService } from "../../../lib/notification-service.js";

export class WebLocksPage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      supported: this.checkSupport(),
      exclusiveInFlight: 0,
      tryInFlight: 0,
      completedExclusive: 0,
      completedTry: 0,
      skippedTry: 0,
      activeOwner: "-",
      logs: [],
    });
  }

  checkSupport() {
    return (
      typeof window !== "undefined" &&
      navigator &&
      navigator.locks &&
      typeof navigator.locks.request === "function"
    );
  }

  pushLog(message) {
    const timestamp = new Date().toLocaleTimeString("zh-TW", {
      hour12: false,
      minute: "2-digit",
      second: "2-digit",
    });
    this.state.logs = [`[${timestamp}] ${message}`, ...this.state.logs].slice(
      0,
      14,
    );
  }

  sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  nextJobId(prefix) {
    return `${prefix}-${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")}`;
  }

  async runExclusiveTask() {
    if (!this.state.supported) {
      notificationService.warn("目前瀏覽器不支援 Web Locks API。");
      return;
    }

    const jobId = this.nextJobId("exclusive");
    this.state.exclusiveInFlight += 1;
    this.pushLog(`${jobId} 請求獨佔鎖 camera-recover`);

    try {
      await navigator.locks.request("camera-recover", async () => {
        this.state.activeOwner = jobId;
        this.pushLog(`${jobId} 已取得鎖，開始恢復流程`);

        const workMs = 900 + Math.floor(Math.random() * 600);
        await this.sleep(workMs);

        this.state.completedExclusive += 1;
        this.pushLog(`${jobId} 完成 (${workMs}ms)`);
      });
    } catch (error) {
      console.error("[WebLocks] exclusive failed", error);
      notificationService.error("獨佔鎖任務執行失敗，請稍後再試。");
    } finally {
      this.state.exclusiveInFlight = Math.max(
        0,
        this.state.exclusiveInFlight - 1,
      );
      if (this.state.exclusiveInFlight === 0 && this.state.tryInFlight === 0) {
        this.state.activeOwner = "-";
      }
    }
  }

  async runIfAvailableTask() {
    if (!this.state.supported) {
      notificationService.warn("目前瀏覽器不支援 Web Locks API。");
      return;
    }

    const jobId = this.nextJobId("try");
    this.state.tryInFlight += 1;
    this.pushLog(`${jobId} 嘗試 ifAvailable 鎖`);

    try {
      const acquired = await navigator.locks.request(
        "camera-recover",
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            return false;
          }

          this.state.activeOwner = jobId;
          this.pushLog(`${jobId} 取得鎖，執行快速健康檢查`);
          const workMs = 300 + Math.floor(Math.random() * 300);
          await this.sleep(workMs);
          this.state.completedTry += 1;
          this.pushLog(`${jobId} 完成快速檢查 (${workMs}ms)`);
          return true;
        },
      );

      if (!acquired) {
        this.state.skippedTry += 1;
        this.pushLog(`${jobId} 未取得鎖，直接略過避免阻塞`);
      }
    } catch (error) {
      console.error("[WebLocks] ifAvailable failed", error);
      notificationService.error("非阻塞鎖任務執行失敗，請稍後再試。");
    } finally {
      this.state.tryInFlight = Math.max(0, this.state.tryInFlight - 1);
      if (this.state.exclusiveInFlight === 0 && this.state.tryInFlight === 0) {
        this.state.activeOwner = "-";
      }
    }
  }

  async runMixedDemo() {
    if (!this.state.supported) {
      notificationService.warn("目前瀏覽器不支援 Web Locks API。");
      return;
    }

    this.pushLog(
      "開始混合情境：先排入 2 個 exclusive，再嘗試 3 個 ifAvailable",
    );

    const tasks = [
      this.runExclusiveTask(),
      this.runExclusiveTask(),
      this.runIfAvailableTask(),
      this.runIfAvailableTask(),
      this.runIfAvailableTask(),
    ];

    await Promise.all(tasks);
    notificationService.success("混合情境完成，可查看執行順序與略過次數。");
  }

  clearLogs() {
    this.state.logs = [];
    this.pushLog("已清空歷程紀錄");
  }

  render() {
    return html`
      <style>
        .locks-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
        }
        .panel {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 1rem;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.6rem;
          margin-top: 0.8rem;
        }
        .stat-item {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #f8fafc;
          padding: 0.7rem;
        }
        .stat-label {
          font-size: 0.8rem;
          color: #475569;
        }
        .stat-value {
          font-size: 1rem;
          margin-top: 0.2rem;
          font-weight: 700;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-top: 0.9rem;
        }
        .logs {
          max-height: 320px;
          overflow: auto;
          border-radius: 10px;
          border: 1px solid #dbeafe;
          background: #eff6ff;
          padding: 0.8rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.86rem;
          line-height: 1.45;
        }
        .logs ul {
          margin: 0;
          padding-left: 1.2rem;
        }
        .support-note {
          margin-top: 1rem;
          padding: 0.7rem;
          border-radius: 8px;
          border: 1px solid #f1d8a8;
          background: #fff8e7;
          color: #7c4a03;
        }
      </style>

      <h2>🔐 Web Locks API 併發協調實驗</h2>
      <div class="lab-card">
        <p>
          <small>
            用
            <code>navigator.locks.request()</code> 控制同一資源的進入順序，避免
            start/stop/recover 互相打架。
          </small>
        </p>

        <div class="locks-grid">
          <section class="panel">
            <h3>任務控制</h3>
            <p>
              <small>
                <strong>exclusive</strong> 會排隊等待；<strong
                  >ifAvailable</strong
                >
                只在可立即取得鎖時執行，否則略過。
              </small>
            </p>

            <div class="actions">
              <button
                class="btn btn-primary"
                onclick="this.closest('page-lab-weblocks').runExclusiveTask()"
              >
                🧱 建立 1 個 exclusive
              </button>
              <button
                class="btn btn-secondary"
                onclick="this.closest('page-lab-weblocks').runIfAvailableTask()"
              >
                ⚡ 建立 1 個 ifAvailable
              </button>
              <button
                class="btn btn-secondary"
                onclick="this.closest('page-lab-weblocks').runMixedDemo()"
              >
                ▶️ 混合壓力測試
              </button>
              <button
                class="btn btn-danger"
                onclick="this.closest('page-lab-weblocks').clearLogs()"
              >
                🧹 清空紀錄
              </button>
            </div>

            <div class="stats">
              <div class="stat-item">
                <div class="stat-label">目前持鎖任務</div>
                <div class="stat-value">${this.state.activeOwner}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">排隊任務數</div>
                <div class="stat-value">${this.state.exclusiveInFlight}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">完成 (exclusive)</div>
                <div class="stat-value">${this.state.completedExclusive}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">完成 (ifAvailable)</div>
                <div class="stat-value">${this.state.completedTry}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">略過 (ifAvailable)</div>
                <div class="stat-value">${this.state.skippedTry}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">進行中 (ifAvailable)</div>
                <div class="stat-value">${this.state.tryInFlight}</div>
              </div>
            </div>
          </section>

          <section class="panel">
            <h3>執行歷程</h3>
            <p><small>觀察鎖取得順序、略過事件與完成時間。</small></p>
            <div class="logs">
              <ul>
                ${(this.state.logs.length
                  ? this.state.logs
                  : ["(尚無紀錄)"]
                ).map((line) => html`<li>${line}</li>`)}
              </ul>
            </div>
          </section>
        </div>

        ${this.state.supported
          ? ""
          : html`
              <div class="support-note">
                目前環境不支援 Web Locks API。建議在 Chromium 系列瀏覽器測試。
              </div>
            `}
      </div>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}

customElements.define("page-lab-weblocks", WebLocksPage);
