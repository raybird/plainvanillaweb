import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { notificationService } from "../../../lib/notification-service.js";

export class PermissionsPreflightPage extends BaseComponent {
  constructor() {
    super();
    this.stream = null;
    this.initReactiveState({
      secureContext:
        typeof window !== "undefined" ? window.isSecureContext : false,
      hasPermissionsApi:
        typeof navigator !== "undefined" && !!navigator.permissions,
      cameraState: "unknown",
      microphoneState: "unknown",
      geolocationState: "unknown",
      previewActive: false,
      statusText: "尚未檢查權限狀態",
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopPreview();
  }

  async queryPermission(name) {
    if (!navigator.permissions || !navigator.permissions.query) {
      return "unsupported";
    }

    try {
      const status = await navigator.permissions.query({ name });
      return status.state;
    } catch {
      return "unsupported";
    }
  }

  async runPreflight() {
    const camera = await this.queryPermission("camera");
    const microphone = await this.queryPermission("microphone");
    const geolocation = await this.queryPermission("geolocation");

    this.state.cameraState = camera;
    this.state.microphoneState = microphone;
    this.state.geolocationState = geolocation;
    this.state.statusText = "已完成預檢，可依需求逐步請求權限。";
  }

  async startPreview() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notificationService.warn("此裝置或瀏覽器不支援 camera API");
      this.state.statusText = "此環境不支援 camera API";
      return;
    }

    this.stopPreview();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      const video = this.querySelector("#permission-camera-preview");
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => null);
      }

      this.stream = stream;
      this.state.previewActive = true;
      this.state.statusText = "鏡頭預覽啟動中，可觀察是否穩定輸出。";
      notificationService.success("鏡頭預覽已啟動");
    } catch (error) {
      this.state.previewActive = false;
      this.state.statusText = `鏡頭啟動失敗：${error?.name || "UnknownError"}`;
      notificationService.error("鏡頭啟動失敗，請確認權限與 HTTPS 環境");
    }
  }

  stopPreview() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    const video = this.querySelector("#permission-camera-preview");
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    this.state.previewActive = false;
  }

  renderPermissionBadge(label, state) {
    return html`<li>
      <strong>${label}：</strong>
      <span class="perm-badge perm-${state}">${state}</span>
    </li>`;
  }

  render() {
    return html`
      <style>
        .preflight-wrap {
          border: 1px solid var(--border-color);
          border-radius: 14px;
          padding: 1rem;
          background: linear-gradient(140deg, var(--card-bg) 0%, var(--surface-color) 100%);
        }
        .preflight-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-bottom: 1rem;
        }
        .preflight-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 1rem;
        }
        .panel {
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 0.8rem;
          background: var(--card-bg);
        }
        .perm-list {
          margin: 0;
          padding-left: 1.2rem;
        }
        .perm-list li {
          margin-bottom: 0.45rem;
        }
        .perm-badge {
          display: inline-block;
          padding: 0.1rem 0.45rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 700;
          border: 1px solid #cbd5e1;
          background: var(--surface-color);
        }
        .perm-granted {
          background: #dcfce7;
          border-color: #86efac;
          color: #166534;
        }
        .perm-denied {
          background: var(--danger-subtle);
          border-color: #fca5a5;
          color: var(--danger);
        }
        .perm-prompt {
          background: var(--warning-subtle);
          border-color: #fcd34d;
          color: var(--warning);
        }
        .camera-preview {
          width: 100%;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background: #0f172a;
          aspect-ratio: 16 / 9;
          object-fit: cover;
        }
        .tips {
          margin: 0;
          padding-left: 1.2rem;
        }
        .tips li {
          margin-bottom: 0.4rem;
        }
        @media (max-width: 768px) {
          .preflight-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <h2>🛡️ 權限預檢與鏡頭啟動教學</h2>
      <div class="lab-card">
        <p>
          <small>
            先做權限預檢，再按需請求裝置能力，可降低手機「畫面閃一下就黑」的風險。
          </small>
        </p>

        <div class="preflight-wrap">
          <div class="preflight-actions">
            <button
              class="btn btn-primary"
              onclick="this.closest('page-lab-permissions-preflight').runPreflight()"
            >
              執行預檢
            </button>
            <button
              class="btn btn-secondary"
              onclick="this.closest('page-lab-permissions-preflight').startPreview()"
            >
              啟動鏡頭預覽
            </button>
            <button
              class="btn btn-secondary"
              onclick="this.closest('page-lab-permissions-preflight').stopPreview()"
            >
              停止鏡頭
            </button>
          </div>

          <div class="preflight-grid">
            <section class="panel">
              <h3>預檢結果</h3>
              <ul class="perm-list">
                <li>
                  <strong>Secure Context：</strong>
                  <span
                    class="perm-badge ${this.state.secureContext
                      ? "perm-granted"
                      : "perm-denied"}"
                    >${this.state.secureContext ? "true" : "false"}</span
                  >
                </li>
                <li>
                  <strong>Permissions API：</strong>
                  <span
                    class="perm-badge ${this.state.hasPermissionsApi
                      ? "perm-granted"
                      : "perm-prompt"}"
                    >${this.state.hasPermissionsApi
                      ? "supported"
                      : "fallback"}</span
                  >
                </li>
                ${this.renderPermissionBadge("camera", this.state.cameraState)}
                ${this.renderPermissionBadge(
                  "microphone",
                  this.state.microphoneState,
                )}
                ${this.renderPermissionBadge(
                  "geolocation",
                  this.state.geolocationState,
                )}
              </ul>
              <p><small>狀態：${this.state.statusText}</small></p>
            </section>

            <section class="panel">
              <h3>鏡頭預覽</h3>
              <video
                id="permission-camera-preview"
                class="camera-preview"
                playsinline
                muted
                autoplay
              ></video>
              <p>
                <small>
                  目前狀態：${this.state.previewActive ? "預覽中" : "未啟動"}
                </small>
              </p>
            </section>
          </div>

          <section class="panel" style="margin-top: 1rem;">
            <h3>建議流程</h3>
            <ol class="tips">
              <li>先確認 <code>HTTPS + Secure Context</code>。</li>
              <li>先跑預檢，避免直接重複請求裝置權限。</li>
              <li>
                進入頁面僅在使用者互動後再呼叫 <code>getUserMedia()</code>。
              </li>
              <li>離開頁面時務必 <code>track.stop()</code> 釋放鏡頭。</li>
            </ol>
          </section>
        </div>
      </div>

      <div
        style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;"
      >
        <a href="#/docs/permissions-preflight" class="btn btn-secondary"
          >📘 讀技術手冊</a
        >
        <a href="#/lab/media" class="btn btn-secondary">🎥 前往 Media Lab</a>
        <a href="#/lab" class="btn btn-secondary">⬅️ 回實驗室首頁</a>
      </div>
    `;
  }
}

customElements.define(
  "page-lab-permissions-preflight",
  PermissionsPreflightPage,
);
