import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { notificationService } from "../../../lib/notification-service.js";

export class ViewTransitionsPage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      supported:
        typeof document !== "undefined" &&
        typeof document.startViewTransition === "function",
      compact: false,
      paletteIndex: 0,
      lastAction: "尚未操作",
    });
  }

  runWithTransition(work) {
    if (this.state.supported) {
      const transition = document.startViewTransition(work);
      transition.finished.catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[ViewTransition] Demo transition failed:', err);
        }
      });
      return;
    }
    work();
  }

  toggleLayout() {
    this.runWithTransition(() => {
      this.state.compact = !this.state.compact;
      this.state.lastAction = this.state.compact
        ? "切換為緊湊版面"
        : "切換為展開版面";
    });
  }

  cyclePalette() {
    this.runWithTransition(() => {
      this.state.paletteIndex = (this.state.paletteIndex + 1) % 3;
      this.state.lastAction = "切換色盤";
    });
  }

  go(path) {
    window.location.hash = path;
  }

  copySnippet() {
    const code = `document.startViewTransition(() => updateUI())`;
    navigator.clipboard
      ?.writeText(code)
      .then(() => notificationService.success("已複製 View Transition 範例"))
      .catch(() => notificationService.warn("複製失敗，請手動複製"));
  }

  getPalette() {
    return [
      ["#0f172a", "#38bdf8", "#e2e8f0"],
      ["#1f2937", "#f59e0b", "#fde68a"],
      ["#0b3d2e", "#34d399", "#a7f3d0"],
    ][this.state.paletteIndex];
  }

  render() {
    const [bg, accent, soft] = this.getPalette();

    return html`
      <style>
        .demo-wrap {
          --vt-bg: ${bg};
          --vt-accent: ${accent};
          --vt-soft: ${soft};
          margin-top: 1rem;
          padding: 1rem;
          border-radius: 14px;
          border: 1px solid var(--border-color);
          background: linear-gradient(140deg, var(--card-bg) 0%, var(--surface-color) 100%);
        }
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .grid {
          margin-top: 1rem;
          display: grid;
          gap: 0.8rem;
          grid-template-columns: ${this.state.compact
            ? "repeat(3, minmax(0, 1fr))"
            : "repeat(2, minmax(0, 1fr))"};
        }
        .card {
          border-radius: 12px;
          padding: ${this.state.compact ? "0.8rem" : "1rem"};
          background: var(--vt-bg);
          color: white;
          min-height: ${this.state.compact ? "88px" : "120px"};
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: box-shadow 0.2s ease;
        }
        .card small {
          color: var(--vt-soft);
        }
        .card:hover {
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
        }
        .badge {
          align-self: flex-start;
          border-radius: 999px;
          padding: 0.2rem 0.55rem;
          background: var(--vt-accent);
          color: var(--text-color);
          font-weight: 700;
          font-size: 0.75rem;
        }
        .meta {
          margin-top: 1rem;
          padding: 0.7rem;
          border-radius: 8px;
          background: var(--surface-color);
          border: 1px solid var(--border-color);
        }
        .actions {
          margin-top: 1rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        @media (max-width: 768px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <h2>🪄 View Transitions API</h2>
      <div class="lab-card">
        <p>
          <small>
            示範路由切換與元件狀態切換如何透過
            <code>document.startViewTransition()</code> 保持視覺連續性。
          </small>
        </p>

        <div class="demo-wrap">
          <div class="toolbar">
            <button
              class="btn btn-primary"
              onclick="this.closest('page-lab-view-transitions').toggleLayout()"
            >
              切換版面
            </button>
            <button
              class="btn btn-secondary"
              onclick="this.closest('page-lab-view-transitions').cyclePalette()"
            >
              切換色盤
            </button>
            <button
              class="btn btn-secondary"
              onclick="this.closest('page-lab-view-transitions').copySnippet()"
            >
              複製程式片段
            </button>
          </div>

          <div class="grid">
            <article class="card">
              <span class="badge">Route</span>
              <strong>跨頁過渡</strong>
              <small>切換到其他 Lab 頁面觀察過渡</small>
            </article>
            <article class="card">
              <span class="badge">State</span>
              <strong>同頁過渡</strong>
              <small>切換版面與色盤觸發過渡</small>
            </article>
            <article class="card">
              <span class="badge">Fallback</span>
              <strong>漸進增強</strong>
              <small>不支援時自動退回一般更新</small>
            </article>
          </div>

          <div class="meta">
            <div>
              <strong>API 支援：</strong>${this.state.supported ? "是" : "否"}
            </div>
            <div><strong>最後操作：</strong>${this.state.lastAction}</div>
          </div>

          <div class="actions">
            <button
              class="btn btn-secondary"
              onclick="this.closest('page-lab-view-transitions').go('/lab/webcodecs')"
            >
              前往 WebCodecs（觀察路由過渡）
            </button>
            <button
              class="btn btn-secondary"
              onclick="this.closest('page-lab-view-transitions').go('/docs')"
            >
              前往技術手冊
            </button>
          </div>
        </div>
      </div>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}

customElements.define("page-lab-view-transitions", ViewTransitionsPage);
