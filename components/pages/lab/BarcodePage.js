import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { barcodeService } from "../../../lib/barcode-service.js";
import { notificationService } from "../../../lib/notification-service.js";

export class BarcodePage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      isScanning: false,
      results: [],
      barcodeStatus: barcodeService.isSupported
        ? "支援"
        : "不支援 (限 Chrome/Edge)",
    });
    this._scanLoop = null;
  }

  async connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopScan();
  }

  async _requestCameraStream() {
    if (!window.isSecureContext) {
      throw new Error("鏡頭功能需要在 HTTPS 或 localhost 環境使用");
    }
    if (document.visibilityState !== "visible") {
      throw new Error("請切回前景分頁後再啟動鏡頭");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("此瀏覽器不支援 getUserMedia");
    }

    const candidates = [
      { video: { facingMode: { exact: "environment" } }, audio: false },
      { video: { facingMode: "environment" }, audio: false },
      { video: true, audio: false },
    ];

    let lastError;
    for (const constraints of candidates) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("無法啟動鏡頭");
  }

  async startScan() {
    if (this.state.isScanning) return;

    try {
      const video = this.querySelector("#scannerVideo");
      if (!video) throw new Error("找不到預覽視窗");

      this.stopScan();
      const stream = await this._requestCameraStream();
      video.setAttribute("playsinline", "");
      video.setAttribute("autoplay", "");
      video.muted = true;
      video.srcObject = stream;
      await video.play();

      this.state.isScanning = true;
      this._runDetection(video);
      notificationService.success("掃描器已啟動");
    } catch (err) {
      this.stopScan();
      notificationService.error(
        "無法啟動攝像頭: " + (err.message || "未知錯誤"),
      );
    }
  }

  stopScan() {
    if (this._scanLoop) {
      cancelAnimationFrame(this._scanLoop);
      this._scanLoop = null;
    }

    const video = this.querySelector("#scannerVideo");
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.pause();
      video.srcObject = null;
    }

    this.state.isScanning = false;
  }

  async _runDetection(video) {
    if (!this.state.isScanning) return;

    try {
      const barcodes = await barcodeService.detect(video);
      if (barcodes.length > 0) {
        this.state.results = barcodes.map((b) => ({
          rawValue: b.rawValue,
          format: b.format,
          timestamp: new Date().toLocaleTimeString(),
        }));
      }
    } catch (e) {
      // 忽略檢測過程中的暫時性錯誤
    }

    this._scanLoop = requestAnimationFrame(() => this._runDetection(video));
  }

  render() {
    return html`
      <style>
        .scanner-container {
          position: relative;
          max-width: 500px;
          margin: 0 auto;
          border-radius: 12px;
          overflow: hidden;
          background: #000;
        }
        video {
          width: 100%;
          aspect-ratio: 4/3;
          object-fit: cover;
        }
        .results-list {
          margin-top: 1.5rem;
        }
        .result-item {
          padding: 0.8rem;
          border-bottom: 1px solid #eee;
          font-family: monospace;
          font-size: 0.9rem;
        }
        .format-badge {
          font-size: 0.7rem;
          padding: 2px 6px;
          background: #eee;
          border-radius: 4px;
          margin-right: 10px;
        }
      </style>

      <h2>🔍 原生掃碼辨識 (Web Barcode)</h2>
      <div class="lab-card">
        <div style="margin-bottom: 1rem;">
          狀態:
          <span
            class="status-badge ${barcodeService.isSupported ? "success" : ""}"
            >${this.state.barcodeStatus}</span
          >
        </div>

        <div class="btn-group" style="margin-bottom: 1.5rem;">
          ${!this.state.isScanning
            ? html`
                <button
                  class="btn btn-primary"
                  onclick="this.closest('page-lab-barcode').startScan()"
                >
                  📹 啟動掃描器
                </button>
              `
            : html`
                <button
                  class="btn btn-danger"
                  onclick="this.closest('page-lab-barcode').stopScan()"
                >
                  ⏹️ 停止掃描
                </button>
              `}
        </div>

        <div class="scanner-container">
          <video id="scannerVideo" autoplay playsinline muted></video>
          ${!this.state.isScanning
            ? html`
                <div
                  style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #666;"
                >
                  等待啟動...
                </div>
              `
            : ""}
        </div>

        <div class="results-list">
          <h3>辨識結果</h3>
          ${this.state.results.length === 0
            ? html`<p><small>尚未偵測到條碼</small></p>`
            : this.state.results.map(
                (r) => html`
                  <div class="result-item">
                    <span class="format-badge">${r.format}</span>
                    <strong>${r.rawValue}</strong>
                    <div
                      style="color: #999; font-size: 0.7rem; margin-top: 4px;"
                    >
                      辨識時間: ${r.timestamp}
                    </div>
                  </div>
                `,
              )}
        </div>
      </div>

      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}
customElements.define("page-lab-barcode", BarcodePage);
