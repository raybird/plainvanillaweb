import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { notificationService } from "../../../lib/notification-service.js";

export class WebCodecsPage extends BaseComponent {
  constructor() {
    super();
    this._encoder = null;
    this._running = false;
    this._chunks = [];
    this._startTime = 0;
    this._canvas = null;
    this._ctx = null;
    this._raf = 0;
    this._frameIndex = 0;

    this.initReactiveState({
      supported: this.checkSupport(),
      status: "待命中",
      codec: "vp8",
      width: 640,
      height: 360,
      fps: 30,
      frameCount: 90,
      encodedChunks: 0,
      totalBytes: 0,
      elapsedMs: 0,
      avgChunkBytes: 0,
      lastError: "",
    });
  }

  checkSupport() {
    return (
      typeof window !== "undefined" && typeof window.VideoEncoder === "function"
    );
  }

  disconnectedCallback() {
    this.stopRun();
    super.disconnectedCallback();
  }

  ensureCanvas() {
    if (this._canvas) return;
    this._canvas = document.createElement("canvas");
    this._canvas.width = this.state.width;
    this._canvas.height = this.state.height;
    this._ctx = this._canvas.getContext("2d", { alpha: false });
  }

  updateCanvasSize() {
    this.ensureCanvas();
    if (
      this._canvas.width !== this.state.width ||
      this._canvas.height !== this.state.height
    ) {
      this._canvas.width = this.state.width;
      this._canvas.height = this.state.height;
    }
  }

  drawFrame(tick) {
    const { width, height } = this.state;
    const ctx = this._ctx;
    if (!ctx) return;

    const hue = (tick * 5) % 360;
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, `hsl(${hue}, 80%, 52%)`);
    grad.addColorStop(1, `hsl(${(hue + 70) % 360}, 75%, 45%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const radius = Math.max(20, Math.min(width, height) * 0.08);
    const x = ((tick * 11) % (width + radius * 2)) - radius;
    const y = height * (0.25 + 0.35 * Math.sin(tick / 6));
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
    ctx.fillRect(16, height - 64, 230, 48);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 20px sans-serif";
    ctx.fillText(`WebCodecs frame #${tick + 1}`, 28, height - 34);
  }

  setCodec(codec) {
    this.state.codec = codec;
  }

  setFrameCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.state.frameCount = Math.max(30, Math.min(240, Math.round(n)));
  }

  stopRun() {
    this._running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    if (this._encoder) {
      try {
        this._encoder.close();
      } catch (_err) {
        // ignore
      }
      this._encoder = null;
    }
  }

  async startRun() {
    if (!this.state.supported) {
      notificationService.warn("此環境不支援 WebCodecs");
      return;
    }
    if (this._running) return;

    this.updateCanvasSize();
    this.state.lastError = "";
    this.state.status = "初始化編碼器...";
    this.state.encodedChunks = 0;
    this.state.totalBytes = 0;
    this.state.avgChunkBytes = 0;
    this.state.elapsedMs = 0;
    this._chunks = [];
    this._frameIndex = 0;

    const config = {
      codec: this.state.codec,
      width: this.state.width,
      height: this.state.height,
      bitrate: 800_000,
      framerate: this.state.fps,
      latencyMode: "realtime",
    };

    try {
      await VideoEncoder.isConfigSupported(config);
    } catch (_err) {
      this.state.status = "不支援此編碼設定";
      this.state.lastError = `Codec ${config.codec} 在此瀏覽器不可用`;
      notificationService.error(this.state.lastError);
      return;
    }

    this._running = true;
    this._startTime = performance.now();

    this._encoder = new VideoEncoder({
      output: (chunk) => {
        this._chunks.push(chunk.byteLength);
        this.state.encodedChunks = this._chunks.length;
        this.state.totalBytes += chunk.byteLength;
      },
      error: (err) => {
        this.state.lastError = String(err);
        this.state.status = "編碼錯誤";
        this.stopRun();
      },
    });

    this._encoder.configure(config);
    this.state.status = "編碼中...";

    const runFrame = () => {
      if (!this._running || !this._encoder) return;

      const done = this._frameIndex >= this.state.frameCount;
      if (done) {
        this.finishRun();
        return;
      }

      this.drawFrame(this._frameIndex);
      const frame = new VideoFrame(this._canvas, {
        timestamp: Math.round((this._frameIndex * 1_000_000) / this.state.fps),
      });
      this._encoder.encode(frame, {
        keyFrame: this._frameIndex % this.state.fps === 0,
      });
      frame.close();
      this._frameIndex += 1;
      this._raf = requestAnimationFrame(runFrame);
    };

    this._raf = requestAnimationFrame(runFrame);
  }

  async finishRun() {
    if (!this._encoder) {
      this.stopRun();
      return;
    }

    try {
      await this._encoder.flush();
      const elapsed = performance.now() - this._startTime;
      this.state.elapsedMs = Math.round(elapsed);
      this.state.avgChunkBytes = this.state.encodedChunks
        ? Math.round(this.state.totalBytes / this.state.encodedChunks)
        : 0;
      this.state.status = "完成";
      notificationService.success("WebCodecs 編碼完成");
    } catch (err) {
      this.state.status = "flush 失敗";
      this.state.lastError = String(err);
      notificationService.error("WebCodecs flush 失敗");
    } finally {
      this.stopRun();
    }
  }

  render() {
    const { supported, status, codec } = this.state;

    return html`
      <style>
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
        }
        .card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 1rem;
          background: #fff;
        }
        .stats {
          margin-top: 0.75rem;
          display: grid;
          gap: 0.45rem;
        }
        .status {
          margin-top: 0.75rem;
          padding: 0.7rem;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .actions {
          margin-top: 0.9rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .seg {
          display: inline-flex;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          overflow: hidden;
          margin-top: 0.6rem;
        }
        .seg button {
          border: none;
          background: #fff;
          padding: 0.4rem 0.8rem;
          cursor: pointer;
        }
        .seg button.active {
          background: #0f172a;
          color: #fff;
        }
        .hint {
          margin-top: 1rem;
          padding: 0.8rem;
          border-radius: 8px;
          background: #fff8e7;
          border: 1px solid #f1d8a8;
          color: #7c4a03;
        }
      </style>

      <h2>🎞️ WebCodecs 低延遲編碼</h2>
      <div class="lab-card">
        <p>
          <small>
            使用
            <code>VideoEncoder</code> 將合成影格即時編碼，觀察低延遲模式下的
            chunk 數量、位元組與耗時。
          </small>
        </p>

        <div class="grid">
          <section class="card">
            <h3>編碼控制</h3>
            <label for="codec"><small>Codec</small></label>
            <div class="seg" id="codec">
              <button
                class="${codec === "vp8" ? "active" : ""}"
                onclick="this.closest('page-lab-webcodecs').setCodec('vp8')"
              >
                VP8
              </button>
              <button
                class="${codec === "vp09.00.10.08" ? "active" : ""}"
                onclick="this.closest('page-lab-webcodecs').setCodec('vp09.00.10.08')"
              >
                VP9
              </button>
              <button
                class="${codec === "avc1.42001E" ? "active" : ""}"
                onclick="this.closest('page-lab-webcodecs').setCodec('avc1.42001E')"
              >
                H.264
              </button>
            </div>

            <div style="margin-top: 0.8rem;">
              <label for="frames"><small>Frame 數量（30 ~ 240）</small></label>
              <input
                id="frames"
                type="range"
                min="30"
                max="240"
                step="30"
                value="${this.state.frameCount}"
                oninput="this.closest('page-lab-webcodecs').setFrameCount(this.value)"
                style="width: 100%;"
              />
              <div><small>目前：${this.state.frameCount} frames</small></div>
            </div>

            <div class="actions">
              <button
                class="btn btn-primary"
                onclick="this.closest('page-lab-webcodecs').startRun()"
                ${!supported ? "disabled" : ""}
              >
                開始編碼
              </button>
              <button
                class="btn btn-secondary"
                onclick="this.closest('page-lab-webcodecs').stopRun()"
              >
                停止
              </button>
            </div>
          </section>

          <section class="card">
            <h3>結果指標</h3>
            <div class="status">
              <div><strong>狀態：</strong>${status}</div>
              <div><strong>支援：</strong>${supported ? "是" : "否"}</div>
              <div><strong>Codec：</strong>${this.state.codec}</div>
            </div>
            <div class="stats">
              <div><strong>Chunks：</strong>${this.state.encodedChunks}</div>
              <div><strong>Total Bytes：</strong>${this.state.totalBytes}</div>
              <div>
                <strong>平均 Chunk：</strong>${this.state.avgChunkBytes}
              </div>
              <div><strong>耗時：</strong>${this.state.elapsedMs} ms</div>
            </div>
            ${this.state.lastError
              ? html`<div class="hint">
                  <strong>錯誤：</strong>${this.state.lastError}
                </div>`
              : ""}
          </section>
        </div>

        ${supported
          ? ""
          : html`
              <div class="hint">
                此瀏覽器不支援 WebCodecs。建議使用新版 Chromium
                於安全內容環境測試。
              </div>
            `}
      </div>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}

customElements.define("page-lab-webcodecs", WebCodecsPage);
