import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";

export class LabIndex extends BaseComponent {
  render() {
    const experiments = [
      { id: "speech", title: "🗣️ 原生語音", desc: "文字轉語音與語音辨識實驗" },
      { id: "webrtc", title: "📡 P2P 通訊", desc: "WebRTC 無伺服器數據交換" },
      { id: "crypto", title: "🔐 原生加密", desc: "SubtleCrypto 高強度加解密" },
      { id: "wasm", title: "⚡ WebAssembly", desc: "高效能 C/Rust模組運算" },
      { id: "serial", title: "🔌 序列通訊", desc: "Web Serial 硬體存取實驗" },
      { id: "forms", title: "📝 響應式表單", desc: "專業級表單驗證引擎展示" },
      { id: "collab", title: "🤝 CRDT 協作", desc: "零衝突即時協作數據同步" },
      { id: "media", title: "🎥 媒體擷取", desc: "螢幕錄製與即時影像處理" },
      { id: "nfc", title: "📡 近場通訊", desc: "Web NFC 標籤讀寫實驗" },
      {
        id: "barcode",
        title: "🔍 條碼辨識",
        desc: "原生 Barcode Detection 實驗",
      },
      {
        id: "webauthn",
        title: "🔐 生物辨識",
        desc: "FaceID / TouchID 驗證實驗",
      },
      {
        id: "popover",
        title: "🪟 Popover API",
        desc: "原生彈出層與宣告式互動",
      },
      {
        id: "eyedropper",
        title: "🎨 EyeDropper API",
        desc: "從畫面取色並建立主題色票",
      },
      {
        id: "weblocks",
        title: "🔐 Web Locks API",
        desc: "跨流程互斥與非阻塞併發協調",
      },
      {
        id: "wakelock",
        title: "💡 Wake Lock API",
        desc: "保持螢幕常亮與前景恢復策略",
      },
      {
        id: "badging",
        title: "🔔 Badging API",
        desc: "設定未讀徽章與降級顯示策略",
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
          border: 1px solid #ddd;
          border-radius: 12px;
          background: #fff;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
          cursor: pointer;
        }
        .lab-item:hover {
          transform: translateY(-5px);
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
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
            <a href="#/lab/${exp.id}" class="lab-item">
              <h3>${exp.title}</h3>
              <p><small>${exp.desc}</small></p>
            </a>
          `,
        )}
      </div>
    `;
  }
}
customElements.define("page-lab-index", LabIndex);
