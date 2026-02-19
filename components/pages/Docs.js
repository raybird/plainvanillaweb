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

      { id: "state-management", title: "狀態管理與 IDB" },
      { id: "pwa", title: "PWA 離線技術" },
      { id: "i18n", title: "原生國際化實作" },
      { id: "native-speech", title: "原生語音服務" },
      { id: "api-fetching", title: "API 非同步處理" },
      { id: "storage-persistence", title: "儲存空間與持久化" },
      { id: "testing-strategy", title: "原生單元測試策略" },
      { id: "file-system-access", title: "原生檔案系統存取" },
      { id: "webassembly", title: "WebAssembly 整合" },
      { id: "webgpu", title: "WebGPU 次世代運算" },
      { id: "webrtc-p2p", title: "WebRTC P2P 通訊" },
      { id: "web-share", title: "Web 分享與接收" },
      { id: "pwa-advanced", title: "PWA 進階安裝與同步" },
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
        }
      </style>

      <div class="docs-container">
        <!-- 左側導覽 -->
        <nav class="docs-nav">
          <h3 style="margin-top: 0;">📚 技術手冊</h3>
          <ul style="list-style: none; padding: 0;">
            ${docs.map(
              (d) => html`
                <li style="margin-bottom: 0.5rem;">
                  <button
                    onclick="this.closest('page-docs').loadDoc('${d.id}')"
                    style="width: 100%; text-align: left; background: none; border: none; color: ${this
                      .state.currentDoc === d.id
                      ? "var(--primary-color)"
                      : "inherit"}; font-weight: ${this.state.currentDoc ===
                    d.id
                      ? "bold"
                      : "normal"}; cursor: pointer; padding: 0.5rem; border-radius: 4px;"
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
          <div
            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;"
          >
            <span class="status-badge"
              >${this.state.currentDoc
                ? `ID: ${this.state.currentDoc}`
                : ""}</span
            >
            ${this.state.currentDoc
              ? html`
                  <button
                    class="btn ${this.state.isSpeaking
                      ? "btn-danger"
                      : "btn-secondary"}"
                    style="font-size: 0.8rem; padding: 4px 8px; min-height: 32px;"
                    onclick="this.closest('page-docs').toggleSpeak()"
                  >
                    ${this.state.isSpeaking ? "⏹️ 停止朗讀" : "🔊 語音朗讀"}
                  </button>
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
