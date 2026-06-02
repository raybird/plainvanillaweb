import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { notificationService } from "../../../lib/notification-service.js";

export class PopoverPage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      supported: this.checkSupport(),
      selectedTheme: "Vanilla Classic",
    });
  }

  checkSupport() {
    if (typeof HTMLElement === "undefined") return false;
    return "showPopover" in HTMLElement.prototype;
  }

  openManualPopover() {
    if (!this.state.supported) {
      notificationService.warn("目前瀏覽器不支援 Popover API。");
      return;
    }

    const popover = this.querySelector("#manual-popover");
    if (popover && typeof popover.showPopover === "function") {
      popover.showPopover();
    }
  }

  closeManualPopover() {
    const popover = this.querySelector("#manual-popover");
    if (popover && typeof popover.hidePopover === "function") {
      popover.hidePopover();
    }
  }

  applyTheme(themeName) {
    this.state.selectedTheme = themeName;
    this.closeManualPopover();
    notificationService.success(`已切換佈景：${themeName}`);
  }

  render() {
    return html`
      <style>
        .demo-grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }
        .demo-card {
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1rem;
          background: var(--card-bg);
        }
        .theme-chip {
          display: inline-block;
          margin-top: 0.6rem;
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          background: #eef7ff;
          color: #0f4a7a;
          font-size: 0.85rem;
          font-weight: 600;
        }
        [popover] {
          border: 1px solid #d1d5db;
          border-radius: 12px;
          padding: 0.9rem;
          width: min(320px, calc(100vw - 2rem));
          box-shadow: 0 10px 35px rgba(0, 0, 0, 0.18);
        }
        .option-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.6rem;
        }
        .option-list button {
          text-align: left;
        }
        .support-note {
          margin-top: 1rem;
          padding: 0.65rem;
          border-radius: 8px;
          background: #fff8e7;
          border: 1px solid #f1d8a8;
          color: #7c4a03;
        }
      </style>

      <h2>🪟 Popover API 原生彈出層</h2>
      <div class="lab-card">
        <p>
          <small
            >展示兩種模式：宣告式 <code>popovertarget</code> 與程式式
            <code>showPopover()</code>/<code>hidePopover()</code>。</small
          >
        </p>

        <div class="demo-grid">
          <section class="demo-card">
            <h3>宣告式開啟</h3>
            <p>
              <small>按鈕透過 HTML 屬性直接綁定，不需要額外 JavaScript。</small>
            </p>
            <button class="btn btn-primary" popovertarget="quick-help-popover">
              ℹ️ 開啟快速說明
            </button>

            <div id="quick-help-popover" popover>
              <strong>操作提示</strong>
              <ul>
                <li>按 ESC 或點外部可自動關閉</li>
                <li>可用於說明、選單、狀態面板</li>
                <li>不需引入第三方 UI 套件</li>
              </ul>
              <button
                class="btn btn-secondary"
                popovertarget="quick-help-popover"
                popovertargetaction="hide"
              >
                關閉
              </button>
            </div>
          </section>

          <section class="demo-card">
            <h3>程式式控制</h3>
            <p><small>在事件流程中手動開啟，適合與狀態管理結合。</small></p>
            <button
              class="btn btn-success"
              onclick="this.closest('page-lab-popover').openManualPopover()"
            >
              🎨 開啟佈景選單
            </button>
            <div class="theme-chip">目前佈景：${this.state.selectedTheme}</div>

            <div id="manual-popover" popover="manual">
              <strong>選擇佈景</strong>
              <div class="option-list">
                <button
                  class="btn btn-secondary"
                  onclick="this.closest('page-lab-popover').applyTheme('Vanilla Classic')"
                >
                  Vanilla Classic
                </button>
                <button
                  class="btn btn-secondary"
                  onclick="this.closest('page-lab-popover').applyTheme('Citrus Bright')"
                >
                  Citrus Bright
                </button>
                <button
                  class="btn btn-secondary"
                  onclick="this.closest('page-lab-popover').applyTheme('Nordic Slate')"
                >
                  Nordic Slate
                </button>
              </div>
              <button
                class="btn btn-secondary"
                style="margin-top:0.7rem;"
                onclick="this.closest('page-lab-popover').closeManualPopover()"
              >
                取消
              </button>
            </div>
          </section>
        </div>

        ${this.state.supported
          ? ""
          : html`
              <div class="support-note">
                目前瀏覽器不支援 Popover API。建議升級至新版 Chromium 或
                Safari，再重新測試。
              </div>
            `}
      </div>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}

customElements.define("page-lab-popover", PopoverPage);
