import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { streamProcessorService } from "../../../lib/stream-processor-service.js";
import { notificationService } from "../../../lib/notification-service.js";

export class MediaPage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      isRecordingScreen: false,
      recordedVideoUrl: null,
      isProcessingStream: false,
      currentFilter: "none",
    });
    this._inputStream = null;
    this._processedStream = null;
    this._cameraRequest = null;
    this._isStoppingStream = false;
    this._isRecoveringStream = false;
    this._resumeStreamTimer = null;
    this._onVisibilityChange = () => this._handleVisibilityChange();
    this._onInputTrackEnded = () => {
      if (this._isStoppingStream || this._cameraRequest) return;
      void this._recoverLiveStream();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._onVisibilityChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this.stopLiveStream();
  }

  update() {
    super.update();
    if (this.state.isProcessingStream && this._processedStream) {
      this._syncProcessedVideo();
    }
  }

  async _requestCameraStream(signal) {
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
      signal.throwIfAborted();
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("無法啟動鏡頭");
  }

  async toggleLiveFilter() {
    if (this.state.isProcessingStream) {
      this.stopLiveStream();
      return;
    }

    if (this._cameraRequest) return;
    const request = new AbortController();
    this._cameraRequest = request;

    try {
      const stream = await this._requestCameraStream(request.signal);
      if (request.signal.aborted) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this._inputStream = stream;
      this._bindInputTrackLifecycle();

      let outputStream = stream;
      try {
        if (streamProcessorService.isSupported) {
          const videoTrack = stream.getVideoTracks()[0];
          const transformer = streamProcessorService.createCanvasTransformer(
            this.state.currentFilter,
          );
          outputStream = streamProcessorService.process(
            videoTrack,
            transformer,
          );
        } else {
          notificationService.warn("目前瀏覽器不支援即時濾鏡，已切換原始預覽");
        }
      } catch (processErr) {
        outputStream = stream;
        notificationService.warn("即時濾鏡初始化失敗，已切換原始預覽");
      }

      this._processedStream = outputStream;

      this.state.isProcessingStream = true;
      await this._syncProcessedVideo();
    } catch (err) {
      if (request.signal.aborted) return;
      this.stopLiveStream();
      notificationService.error(err.message || "啟動鏡頭失敗");
    } finally {
      if (this._cameraRequest === request) this._cameraRequest = null;
    }
  }

  stopLiveStream() {
    this._isStoppingStream = true;
    this._cameraRequest?.abort();
    this._cameraRequest = null;

    if (this._resumeStreamTimer) {
      clearTimeout(this._resumeStreamTimer);
      this._resumeStreamTimer = null;
    }

    if (this._processedStream && this._processedStream !== this._inputStream) {
      void streamProcessorService.stop();
    }
    this._unbindInputTrackLifecycle();
    new Set([this._processedStream, this._inputStream]).forEach((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
    });
    this._processedStream = null;
    this._inputStream = null;

    const videoEl = this.querySelector("#processedVideo");
    if (videoEl) {
      videoEl.pause();
      videoEl.srcObject = null;
    }

    this.state.isProcessingStream = false;
    this._isStoppingStream = false;
  }

  _hasLiveInputTrack() {
    const track = this._inputStream?.getVideoTracks?.()[0];
    return !!track && track.readyState === "live" && track.enabled;
  }

  _bindInputTrackLifecycle() {
    const track = this._inputStream?.getVideoTracks?.()[0];
    if (!track) return;
    track.removeEventListener("ended", this._onInputTrackEnded);
    track.addEventListener("ended", this._onInputTrackEnded);
  }

  _unbindInputTrackLifecycle() {
    const track = this._inputStream?.getVideoTracks?.()[0];
    track?.removeEventListener("ended", this._onInputTrackEnded);
  }

  async _recoverLiveStream() {
    if (!this.state.isProcessingStream) return;
    if (this._isRecoveringStream || this._cameraRequest) return;
    this._isRecoveringStream = true;

    try {
      this.stopLiveStream();
      await this.toggleLiveFilter();
    } finally {
      this._isRecoveringStream = false;
    }
  }

  _handleVisibilityChange() {
    if (!this.state.isProcessingStream) return;
    if (document.visibilityState !== "visible") return;

    if (this._resumeStreamTimer) {
      clearTimeout(this._resumeStreamTimer);
    }

    this._resumeStreamTimer = setTimeout(async () => {
      this._resumeStreamTimer = null;
      if (!this.state.isProcessingStream) return;

      if (!this._hasLiveInputTrack()) {
        await this._recoverLiveStream();
        return;
      }

      await this._syncProcessedVideo();
    }, 120);
  }

  async _syncProcessedVideo() {
    if (!this._processedStream) return;
    const videoEl = this.querySelector("#processedVideo");
    if (!videoEl) return;

    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("autoplay", "");
    videoEl.muted = true;

    if (videoEl.srcObject !== this._processedStream) {
      videoEl.srcObject = this._processedStream;
    }

    try {
      await videoEl.play();
    } catch (e) {
      // 忽略瞬時中斷，避免中斷整體流程
    }
  }

  render() {
    return html`
      <div class="lab-card">
        <h3>📹 即時串流與濾鏡</h3>
        <div class="btn-group">
          <button
            class="btn btn-primary"
            onclick="this.closest('page-lab-media').toggleLiveFilter()"
          >
            ${this.state.isProcessingStream ? "⏹️ 停止" : "📹 啟動處理器"}
          </button>
        </div>
        <video
          id="processedVideo"
          autoplay
          playsinline
          muted
          style="width: 100%; margin-top: 1rem; border-radius: 8px; background: #000;"
        ></video>
      </div>
      <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;"
        >⬅️ 回實驗室首頁</a
      >
    `;
  }
}
customElements.define("page-lab-media", MediaPage);
