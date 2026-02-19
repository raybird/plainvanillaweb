import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { mediaService } from "../../../lib/media-service.js";
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
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopLiveStream();
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

  async toggleLiveFilter() {
    if (this.state.isProcessingStream) {
      this.stopLiveStream();
      return;
    }

    try {
      const stream = await this._requestCameraStream();
      this._inputStream = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const transformer = streamProcessorService.createCanvasTransformer(
        this.state.currentFilter,
      );
      const processedStream = streamProcessorService.process(
        videoTrack,
        transformer,
      );
      this._processedStream = processedStream;

      const videoEl = this.querySelector("#processedVideo");
      if (videoEl) {
        videoEl.setAttribute("playsinline", "");
        videoEl.setAttribute("autoplay", "");
        videoEl.muted = true;
        videoEl.srcObject = processedStream;
        await videoEl.play();
      }

      this.state.isProcessingStream = true;
    } catch (err) {
      this.stopLiveStream();
      notificationService.error(err.message || "啟動鏡頭失敗");
    }
  }

  stopLiveStream() {
    streamProcessorService.stop();
    [this._processedStream, this._inputStream].forEach((stream) => {
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
