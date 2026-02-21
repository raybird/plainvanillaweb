import { html, unsafe } from "../../lib/html.js";
import { BaseComponent } from "../../lib/base-component.js";
import { docService } from "../../lib/doc-service.js";
import { speechService } from "../../lib/speech-service.js";
import { notificationService } from "../../lib/notification-service.js";

export class Documentation extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      content: "請選擇一個教學單元",
      currentDoc: null,
      isSpeaking: false,
    });
  }

  async connectedCallback() {
    super.connectedCallback();
    const docFromPath = this.getDocIdFromHash();
    if (docFromPath) {
      await this.loadDoc(docFromPath);
    }
  }

  getDocIdFromHash() {
    const hashPath = window.location.hash.slice(1);
    const match = hashPath.match(/^\/docs\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  getLabRouteByDoc(docId) {
    const map = {
      "native-speech": "/lab/speech",
      "webrtc-p2p": "/lab/webrtc",
      webassembly: "/lab/wasm",
      "web-serial": "/lab/serial",
      "reactive-forms": "/lab/forms",
      "crdt-sync": "/lab/collab",
      "media-capture": "/lab/media",
      "web-nfc": "/lab/nfc",
      "barcode-detection": "/lab/barcode",
      webauthn: "/lab/webauthn",
      "popover-api": "/lab/popover",
      "eye-dropper": "/lab/eyedropper",
      "web-locks": "/lab/weblocks",
      "screen-wake-lock": "/lab/wakelock",
      "badging-api": "/lab/badging",
      webcodecs: "/lab/webcodecs",
      "view-transitions": "/lab/view-transitions",
      "web-share": "/lab/web-share",
      "permissions-preflight": "/lab/permissions",
      webgpu: "/lab/webgpu",
      "file-system-access": "/lab/file-system",
      compression: "/lab/compression",
      "native-image-processing": "/lab/image-studio",
      connectivity: "/lab/network",
      "web-performance": "/lab/performance",
    };
    return map[docId] || null;
  }

  async loadDoc(docName) {
    if (this.state.isSpeaking) {
      speechService.speak(""); // 停止目前說話
      this.state.isSpeaking = false;
    }
    this.state.content = "正在載入文件...";
    const htmlContent = await docService.getDoc(docName);
    this.state.content = htmlContent;
    this.state.currentDoc = docName;
  }

  toggleSpeak() {
    if (this.state.isSpeaking) {
      speechService.speak("");
      this.state.isSpeaking = false;
      notificationService.info("已停止朗讀");
    } else {
      // 提取純文字進行朗讀 (移除 HTML 標籤)
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = this.state.content;
      const text = tempDiv.innerText;

      if (!text || text === "請選擇一個教學單元") {
        notificationService.warn("沒有可朗讀的內容");
        return;
      }

      speechService.speak(text);
      this.state.isSpeaking = true;
      notificationService.success("開始朗讀文件");

      // 監聽結束事件 (如果 speechService 支援)
      // 這裡簡單處理，或者可以擴充 speechService
    }
  }

  render() {
    const docs = [
      { id: "router", title: "原生路由與 SEO" },
      { id: "MANIFESTO", title: "🍦 Vanilla 開發宣言" },
      { id: "component-architecture", title: "🏗️ 組件開發指南" },
      { id: "service-patterns", title: "🔌 服務模式規範" },
      { id: "layout-guide", title: "🎨 原生佈局範式" },
      { id: "state-management", title: "狀態管理與 IDB" },
      { id: "pwa", title: "PWA 離線技術" },
      { id: "i18n", title: "原生國際化實作" },
      { id: "native-speech", title: "原生語音服務" },
      { id: "api-fetching", title: "API 非同步處理" },
      { id: "connectivity", title: "網路連線性與 Beacon" },
      { id: "storage-persistence", title: "儲存空間與持久化" },
      { id: "testing-strategy", title: "原生單元測試策略" },
      { id: "file-system-access", title: "原生檔案系統存取" },
      { id: "webassembly", title: "WebAssembly 整合" },
      { id: "webgpu", title: "WebGPU 次世代運算" },
      { id: "webrtc-p2p", title: "WebRTC P2P 通訊" },
      { id: "web-share", title: "Web 分享與接收" },
      { id: "pwa-advanced", title: "PWA 進階安裝與同步" },
      { id: "background-fetch", title: "原生背景抓取 (Fetch)" },
      { id: "sdk-usage", title: "Vanilla SDK 使用指南" },
      { id: "web-bluetooth", title: "Web 藍牙裝置通訊" },
      { id: "payment-request", title: "Web 原生支付整合" },
      { id: "media-capture", title: "螢幕錄製與串流" },
      { id: "native-visualization", title: "原生數據可視化" },
      { id: "live-stream-processing", title: "即時串流處理" },
      { id: "web-serial", title: "Web 序列通訊" },
      { id: "reactive-forms", title: "原生響應式表單" },
      { id: "crdt-sync", title: "CRDT 數據同步" },
      { id: "web-nfc", title: "Web NFC 近場通訊" },
      { id: "barcode-detection", title: "原生掃碼辨識" },
      { id: "webauthn", title: "原生生物辨識驗證" },
      { id: "popover-api", title: "Popover API 原生彈出層" },
      { id: "eye-dropper", title: "EyeDropper API 原生取色" },
      { id: "web-locks", title: "Web Locks API 併發協調" },
      { id: "screen-wake-lock", title: "Screen Wake Lock 保持喚醒" },
      { id: "badging-api", title: "Badging API 應用徽章" },
      { id: "compression", title: "數據壓縮流" },
      { id: "webcodecs", title: "WebCodecs 低延遲編碼" },
      { id: "view-transitions", title: "View Transitions 過渡動畫" },
      { id: "permissions-preflight", title: "權限預檢與鏡頭啟動策略" },
      { id: "docs-lab-cross-reference", title: "技術手冊與 Lab 雙向導覽" },
      { id: "web-performance", title: "原生效能監控 API" },
      { id: "web-midi", title: "原生 Web MIDI 互動" },
      { id: "web-audio", title: "原生 Web Audio 合成" },
      { id: "web-bluetooth", title: "原生 Web 藍牙通訊" },
      { id: "native-image-processing", title: "原生影像處理" },
    ];

    return html`
      <style>
        .docs-container {
          display: flex;
          gap: 2rem;
          align-items: flex-start;
        }
        .docs-nav {
          width: 250px;
          background: var(--nav-bg);
          padding: 1rem;
          border-radius: 8px;
          position: sticky;
          top: 1rem;
        }
        .docs-content {
          flex: 1;
          padding: 2rem;
          border: 1px solid #eee;
          border-radius: 12px;
          background: white;
          min-height: 60vh;
          overflow-x: auto;
        }
        .docs-nav-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .docs-nav-item {
          margin-bottom: 0.5rem;
        }
        .docs-nav-button {
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 4px;
        }
        .docs-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
          border-bottom: 1px solid #eee;
          padding-bottom: 0.5rem;
          flex-wrap: wrap;
        }
        .docs-toolbar-actions {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .docs-toolbar-action {
          font-size: 0.8rem;
          padding: 4px 8px;
          min-height: 36px;
        }

        @media (max-width: 768px) {
          .docs-container {
            flex-direction: column;
            gap: 1rem;
          }
          .docs-nav {
            width: 100%;
            position: static;
          }
          .docs-content {
            padding: 1rem;
            width: 100%;
            box-sizing: border-box;
          }
          .docs-nav ul {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
          }
          .docs-nav li {
            margin-bottom: 0 !important;
          }
          .docs-nav button {
            background: #eee !important;
            font-size: 0.85rem;
            padding: 0.4rem 0.8rem !important;
          }
          .docs-toolbar {
            align-items: stretch;
          }
          .docs-toolbar-actions {
            width: 100%;
          }
          .docs-toolbar-action {
            flex: 1;
            min-height: 44px;
          }
        }
      </style>

      <div class="docs-container">
        <!-- 左側導覽 -->
        <nav class="docs-nav">
          <h3 style="margin-top: 0;">📚 技術手冊</h3>
          <ul class="docs-nav-list">
            ${docs.map(
              (d) => html`
                <li class="docs-nav-item">
                  <button
                    class="docs-nav-button"
                    onclick="this.closest('page-docs').loadDoc('${d.id}')"
                    style="color: ${this.state.currentDoc === d.id
                      ? "var(--primary-color)"
                      : "inherit"}; font-weight: ${this.state.currentDoc ===
                    d.id
                      ? "bold"
                      : "normal"};"
                  >
                    ${d.title}
                  </button>
                </li>
              `,
            )}
          </ul>
        </nav>

        <!-- 右側內容 -->
        <article class="docs-content">
          <div class="docs-toolbar">
            <span class="status-badge"
              >${this.state.currentDoc
                ? `ID: ${this.state.currentDoc}`
                : ""}</span
            >
            ${this.state.currentDoc
              ? html`
                  <div class="docs-toolbar-actions">
                    ${this.getLabRouteByDoc(this.state.currentDoc)
                      ? html`
                          <a
                            href="#${this.getLabRouteByDoc(
                              this.state.currentDoc,
                            )}"
                            class="btn btn-secondary docs-toolbar-action"
                          >
                            🧪 對應實驗室
                          </a>
                        `
                      : ""}

                    <button
                      class="btn docs-toolbar-action ${this.state.isSpeaking
                        ? "btn-danger"
                        : "btn-secondary"}"
                      onclick="this.closest('page-docs').toggleSpeak()"
                    >
                      ${this.state.isSpeaking ? "⏹️ 停止朗讀" : "🔊 語音朗讀"}
                    </button>
                  </div>
                `
              : ""}
          </div>
          ${unsafe(this.state.content)}
        </article>
      </div>
    `;
  }
}
customElements.define("page-docs", Documentation);
