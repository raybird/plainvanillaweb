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
    this._cameraStream = null;
    this._isStartingScan = false;
    this._isStoppingScan = false;
    this._isRecoveringScan = false;
    this._resumeScanTimer = null;
    this._onVisibilityChange = () => this._handleVisibilityChange();
    this._onCameraTrackEnded = () => {
      if (this._isStoppingScan || this._isStartingScan) return;
      void this._recoverScannerStream();
    };
  }

  async connectedCallback() {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._onVisibilityChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this.stopScan();
  }

  update() {
    super.update();
    if (this.state.isScanning && this._cameraStream) {
      this._syncScannerVideo();
    }
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
    if (this.state.isScanning || this._isStartingScan) return;
    this._isStartingScan = true;

    try {
      const video = this.querySelector("#scannerVideo");
      if (!video) throw new Error("找不到預覽視窗");

      this.stopScan();
      const stream = await this._requestCameraStream();
      this._cameraStream = stream;
      this._bindCameraTrackLifecycle();
      await this._syncScannerVideo();

      this.state.isScanning = true;
      this._syncScannerVideo();
      this._runDetection();
      notificationService.success("掃描器已啟動");
    } catch (err) {
      this.stopScan();
      notificationService.error(
        "無法啟動攝像頭: " + (err.message || "未知錯誤"),
      );
    } finally {
      this._isStartingScan = false;
    }
  }

  stopScan() {
    this._isStoppingScan = true;

    if (this._resumeScanTimer) {
      clearTimeout(this._resumeScanTimer);
      this._resumeScanTimer = null;
    }

    if (this._scanLoop) {
      cancelAnimationFrame(this._scanLoop);
      this._scanLoop = null;
    }

    if (this._cameraStream) {
      this._unbindCameraTrackLifecycle();
      this._cameraStream.getTracks().forEach((t) => t.stop());
      this._cameraStream = null;
    }

    const video = this.querySelector("#scannerVideo");
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    this.state.isScanning = false;
    this._isStoppingScan = false;
  }

  _hasLiveCameraTrack() {
    const track = this._cameraStream?.getVideoTracks?.()[0];
    return !!track && track.readyState === "live" && track.enabled;
  }

  _bindCameraTrackLifecycle() {
    const track = this._cameraStream?.getVideoTracks?.()[0];
    if (!track) return;
    track.removeEventListener("ended", this._onCameraTrackEnded);
    track.addEventListener("ended", this._onCameraTrackEnded);
  }

  _unbindCameraTrackLifecycle() {
    const track = this._cameraStream?.getVideoTracks?.()[0];
    track?.removeEventListener("ended", this._onCameraTrackEnded);
  }

  async _recoverScannerStream() {
    if (!this.state.isScanning) return;
    if (this._isRecoveringScan || this._isStartingScan) return;
    this._isRecoveringScan = true;

    try {
      this.stopScan();
      await this.startScan();
    } finally {
      this._isRecoveringScan = false;
    }
  }

  _handleVisibilityChange() {
    if (!this.state.isScanning) return;
    if (document.visibilityState !== "visible") return;

    if (this._resumeScanTimer) {
      clearTimeout(this._resumeScanTimer);
    }

    this._resumeScanTimer = setTimeout(async () => {
      this._resumeScanTimer = null;
      if (!this.state.isScanning) return;

      if (!this._hasLiveCameraTrack()) {
        await this._recoverScannerStream();
        return;
      }

      await this._syncScannerVideo();
    }, 120);
  }

  async _runDetection() {
    if (!this.state.isScanning) return;
    if (!barcodeService.isSupported) return;
    const video = this.querySelector("#scannerVideo");
    if (!video) {
      this._scanLoop = requestAnimationFrame(() => this._runDetection());
      return;
    }

    try {
      const barcodes = await barcodeService.detect(video);
      if (barcodes.length > 0) {
        const nextResults = barcodes.map((b) => ({
          rawValue: b.rawValue,
          format: b.format,
          timestamp: new Date().toLocaleTimeString(),
        }));

        const currentFingerprint = this.state.results
          .map((r) => `${r.format}:${r.rawValue}`)
          .join("|");
        const nextFingerprint = nextResults
          .map((r) => `${r.format}:${r.rawValue}`)
          .join("|");

        if (currentFingerprint !== nextFingerprint) {
          this.state.results = nextResults;
          this._syncScannerVideo();
        }
      }
    } catch (e) {
      // 忽略檢測過程中的暫時性錯誤
    }

    this._scanLoop = requestAnimationFrame(() => this._runDetection());
  }

  async _syncScannerVideo() {
    if (!this._cameraStream) return;
    const video = this.querySelector("#scannerVideo");
    if (!video) return;

    video.setAttribute("playsinline", "");
    video.setAttribute("autoplay", "");
    video.muted = true;

    if (video.srcObject !== this._cameraStream) {
      video.srcObject = this._cameraStream;
    }

    try {
      await video.play();
    } catch (e) {
      // 忽略短暫中斷，讓下一次 user gesture 或重新渲染再嘗試
    }
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
          border-bottom: 1px solid var(--border-color);
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
                  style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted);"
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
                      style="color: var(--text-subtle); font-size: 0.7rem; margin-top: 4px;"
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
