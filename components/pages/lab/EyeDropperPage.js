import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { notificationService } from "../../../lib/notification-service.js";

export class EyeDropperPage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      supported: this.checkSupport(),
      pickedHex: "#1d4ed8",
      palette: ["#1d4ed8", "#ea580c", "#047857"],
      isPicking: false,
    });
  }

  checkSupport() {
    return typeof window !== "undefined" && "EyeDropper" in window;
  }

  async pickColor() {
    if (!this.state.supported || this.state.isPicking) {
      if (!this.state.supported) {
        notificationService.warn("目前瀏覽器不支援 EyeDropper API。");
      }
      return;
    }

    this.state.isPicking = true;
    try {
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();
      const nextHex = (result && result.sRGBHex) || this.state.pickedHex;

      this.state.pickedHex = nextHex;
      this.state.palette = [
        nextHex,
        ...this.state.palette.filter((color) => color !== nextHex),
      ].slice(0, 6);

      notificationService.success(`已擷取色彩 ${nextHex}`);
    } catch (error) {
      if (error && error.name !== "AbortError") {
        console.error("[EyeDropper] pick failed", error);
        notificationService.error("取色失敗，請稍後再試。");
      }
    } finally {
      this.state.isPicking = false;
    }
  }

  applySampleColor(hex) {
    this.state.pickedHex = hex;
    notificationService.info(`已套用示範色 ${hex}`);
  }

  render() {
    return html`
      <style>
        .eyedropper-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1rem;
        }
        .card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 1rem;
          background: #ffffff;
        }
        .preview {
          border-radius: 12px;
          border: 1px solid #d1d5db;
          min-height: 170px;
          background: linear-gradient(
            125deg,
            ${this.state.pickedHex} 0%,
            #ffffff 55%,
            #0f172a 100%
          );
          display: flex;
          align-items: end;
          padding: 1rem;
          color: #0f172a;
          font-weight: 700;
          box-sizing: border-box;
        }
        .palette {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
          margin-top: 0.8rem;
        }
        .swatch {
          width: 44px;
          height: 44px;
          border: 2px solid #ffffff;
          border-radius: 999px;
          box-shadow: 0 0 0 1px #d1d5db;
          cursor: pointer;
        }
        .support-note {
          margin-top: 1rem;
          padding: 0.7rem;
          border-radius: 8px;
          background: #fff8e7;
          border: 1px solid #f1d8a8;
          color: #7c4a03;
        }
        .color-chip {
          margin-top: 0.7rem;
          display: inline-block;
          border-radius: 999px;
          border: 1px solid #d1d5db;
          padding: 0.3rem 0.7rem;
          font-size: 0.88rem;
          background: #f8fafc;
        }
      </style>

      <h2>🎨 EyeDropper API 原生取色器</h2>
      <div class="lab-card">
        <p>
          <small
            >使用瀏覽器原生 <code>EyeDropper</code> 從畫面擷取色彩，並即時生成
            Vanilla 主題色票。</small
          >
        </p>

        <div class="eyedropper-grid">
          <section class="card">
            <h3>互動取色</h3>
            <p><small>點擊按鈕後，從目前畫面任意像素擷取色彩。</small></p>
            <button
              class="btn btn-primary"
              onclick="this.closest('page-lab-eyedropper').pickColor()"
              ${this.state.isPicking ? "disabled" : ""}
            >
              ${this.state.isPicking ? "擷取中..." : "🖌️ 開始取色"}
            </button>
            <div class="color-chip">目前色票：${this.state.pickedHex}</div>
            <div class="palette">
              ${this.state.palette.map(
                (hex) => html`
                  <button
                    class="swatch"
                    title="套用 ${hex}"
                    style="background:${hex};"
                    onclick="this.closest('page-lab-eyedropper').applySampleColor('${hex}')"
                  ></button>
                `,
              )}
            </div>
          </section>

          <section class="card">
            <h3>預覽面板</h3>
            <p><small>可將擷取色用於主題卡片、品牌色或設計 token。</small></p>
            <div class="preview">${this.state.pickedHex}</div>
          </section>
        </div>

        ${this.state.supported
          ? ""
          : html`
              <div class="support-note">
                目前環境不支援 EyeDropper API。建議使用 Chromium
                系列瀏覽器測試。
              </div>
            `}
      </div>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}

customElements.define("page-lab-eyedropper", EyeDropperPage);
