import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";

export class LabIndex extends BaseComponent {
  render() {
    const experiments = [
      {
        id: "speech",
        docId: "native-speech",
        title: "🗣️ 原生語音",
        desc: "文字轉語音與語音辨識實驗",
      },
      {
        id: "webrtc",
        docId: "webrtc-p2p",
        title: "📡 P2P 通訊",
        desc: "WebRTC 無伺服器數據交換",
      },
      { id: "crypto", title: "🔐 原生加密", desc: "SubtleCrypto 高強度加解密" },
      {
        id: "wasm",
        docId: "webassembly",
        title: "⚡ WebAssembly",
        desc: "高效能 C/Rust模組運算",
      },
      {
        id: "serial",
        docId: "web-serial",
        title: "🔌 序列通訊",
        desc: "Web Serial 硬體存取實驗",
      },
      {
        id: "forms",
        docId: "reactive-forms",
        title: "📝 響應式表單",
        desc: "專業級表單驗證引擎展示",
      },
      {
        id: "collab",
        docId: "crdt-sync",
        title: "🤝 CRDT 協作",
        desc: "零衝突即時協作數據同步",
      },
      {
        id: "media",
        docId: "media-capture",
        title: "🎥 媒體擷取",
        desc: "螢幕錄製與即時影像處理",
      },
      {
        id: "nfc",
        docId: "web-nfc",
        title: "📡 近場通訊",
        desc: "Web NFC 標籤讀寫實驗",
      },
      {
        id: "barcode",
        docId: "barcode-detection",
        title: "🔍 條碼辨識",
        desc: "原生 Barcode Detection 實驗",
      },
      {
        id: "webauthn",
        docId: "webauthn",
        title: "🔐 生物辨識",
        desc: "FaceID / TouchID 驗證實驗",
      },
      {
        id: "popover",
        docId: "popover-api",
        title: "🪟 Popover API",
        desc: "原生彈出層與宣告式互動",
      },
      {
        id: "eyedropper",
        docId: "eye-dropper",
        title: "🎨 EyeDropper API",
        desc: "從畫面取色並建立主題色票",
      },
      {
        id: "weblocks",
        docId: "web-locks",
        title: "🔐 Web Locks API",
        desc: "跨流程互斥與非阻塞併發協調",
      },
      {
        id: "wakelock",
        docId: "screen-wake-lock",
        title: "💡 Wake Lock API",
        desc: "保持螢幕常亮與前景恢復策略",
      },
      {
        id: "badging",
        docId: "badging-api",
        title: "🔔 Badging API",
        desc: "設定未讀徽章與降級顯示策略",
      },
      {
        id: "webcodecs",
        docId: "webcodecs",
        title: "🎞️ WebCodecs",
        desc: "低延遲影格編碼與效能指標觀察",
      },
      {
        id: "view-transitions",
        docId: "view-transitions",
        title: "🪄 View Transitions",
        desc: "原生頁面與狀態過渡動畫示範",
      },
      {
        id: "web-share",
        docId: "web-share",
        title: "📤 Web Share API",
        desc: "系統分享與 Share Target 接收流程示範",
      },
      {
        id: "permissions",
        docId: "permissions-preflight",
        title: "🛡️ 權限預檢",
        desc: "先預檢再請求權限，降低手機鏡頭黑畫面風險",
      },
      {
        id: "webgpu",
        docId: "webgpu",
        title: "⚡ 次世代運算",
        desc: "WebGPU 硬體加速運算實作示範",
      },
      {
        id: "file-system",
        docId: "file-system-access",
        title: "📁 檔案系統存取",
        desc: "原生目錄讀取與本地檔案編輯",
      },
      {
        id: "compression",
        docId: "compression",
        title: "🗜️ 數據壓縮流",
        desc: "原生 Gzip 即時壓縮與解壓實作",
      },
      {
        id: "pwa-advanced",
        docId: "background-fetch",
        title: "📦 PWA 進階功能",
        desc: "背景同步、定期更新與大型抓取實驗",
      },
      {
        id: "image-studio",
        docId: "native-image-processing",
        title: "🎨 影像工作室",
        desc: "零套件的圖片濾鏡、縮放與 WebP 壓縮實作",
      },
      {
        id: "network",
        docId: "connectivity",
        title: "🌐 網路資訊",
        desc: "即時頻寬監控與 Beacon 可靠傳輸實驗",
      },
      {
        id: "performance",
        docId: "web-performance",
        title: "⏱️ 效能監控",
        desc: "Web Vitals 與加載流程即時觀測儀表板",
      },
      {
        id: "midi",
        docId: "web-midi",
        title: "🎹 MIDI 互動",
        desc: "原生 Web MIDI 設備偵測與訊號解析實驗",
      },
      {
        id: "audio",
        docId: "web-audio",
        title: "🔊 音訊合成",
        desc: "原生 Web Audio 合成器與 MIDI 聯動演奏",
      },
      {
        id: "bluetooth",
        docId: "web-bluetooth",
        title: "📱 藍牙通訊",
        desc: "原生 Web Bluetooth 設備搜尋與 GATT 連線實驗",
      },
      {
        id: "layout",
        docId: "layout-guide",
        title: "🎨 佈局與主題",
        desc: "CSS 變數驅動的主題引擎與流體佈局實驗",
      },
      {
        id: "service-pattern",
        docId: "service-patterns",
        title: "🔌 服務交互模式",
        desc: "組件與 Service 單例間的事件驅動通訊規範實驗",
      },
      {
        id: "payment",
        docId: "payment-request",
        title: "💳 原生支付",
        desc: "原生 Apple/Google Pay 結帳對話框展示",
      },
      {
        id: "broadcast",
        docId: "broadcast-channel",
        title: "📢 跨分頁同源廣播",
        desc: "免伺服器的多重分頁狀態即時同步",
      },
      {
        id: "modal",
        docId: "dialog-modal",
        title: "🪟 原生對話框 (Dialog)",
        desc: "宣告式 A11y 彈出層與 Focus Trap",
      },
      {
        id: "chart",
        docId: "canvas-chart",
        title: "📊 高效圖表 (Canvas)",
        desc: "極致輕量的純 Canvas 數據資料流畫布",
      },
      {
        id: "history",
        docId: "", // History 尚未有獨立文件
        title: "⏪ 狀態回溯器",
        desc: "原生 Undo/Redo 快照歷史管理實作",
      },
    ];

    if (!experiments || !Array.isArray(experiments)) return "";

    return html`
      <style>
        .lab-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }
        .lab-item {
          padding: 1.5rem;
          border: 1px solid var(--card-border);
          border-radius: 12px;
          background: var(--card-bg);
          text-decoration: none;
          color: var(--text-color);
          transition: all 0.2s;
          cursor: pointer;
          box-shadow: var(--card-shadow);
        }
        .lab-item .actions {
          margin-top: 0.8rem;
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .lab-item .actions a {
          text-decoration: none;
        }
        .lab-item .btn-link {
          display: inline-block;
          padding: 0.35rem 0.6rem;
          border-radius: 999px;
          font-size: 0.78rem;
          border: 1px solid var(--border-color);
          color: var(--text-muted);
          background: var(--surface-color);
        }
        .lab-item .btn-link.primary {
          background: var(--primary-color);
          color: #fff;
          border-color: var(--primary-color);
        }
        .lab-item:hover {
          transform: translateY(-5px);
          box-shadow: var(--card-shadow-hover);
          border-color: var(--primary-color);
        }
        .lab-item h3 {
          margin-top: 0;
          color: var(--primary-color);
        }
      </style>

      <div class="lab-grid">
        ${experiments.map(
      (exp) => html`
            <article class="lab-item">
              <h3>${exp.title}</h3>
              <p><small>${exp.desc}</small></p>
              <div class="actions">
                <a href="#/lab/${exp.id}" class="btn-link primary">開啟實驗</a>
                ${exp.docId
          ? html`
                      <a href="#/docs/${exp.docId}" class="btn-link"
                        >技術手冊</a
                      >
                    `
          : ""}
              </div>
            </article>
          `,
    )}
      </div>
    `;
  }
}
customElements.define("page-lab-index", LabIndex);
