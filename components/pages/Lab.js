import { html } from "../../lib/html.js";
import { BaseComponent } from "../../lib/base-component.js";

/**
 * LabPage - 實驗室佈局容器 (v3.0 - Path Robust)
 * 負責處理 /lab/* 巢狀路由，具備強大的環境適應性。
 */
export class LabPage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      rtcMessages: [],
      cartItems: [
        {
          label: "Vanilla JS 課程",
          amount: { currency: "USD", value: "10.00" },
        },
        { label: "進階 PWA 指南", amount: { currency: "USD", value: "5.00" } },
      ],
      serialLogs: [],
      registrationForm: {
        username: { valid: true, pending: false, touched: false, errors: null },
        email: { valid: true, touched: false, errors: null },
        formValid: false,
      },
    });
  }

  async connectedCallback() {
    super.connectedCallback();
    // 預先載入所有子頁面，確保 Custom Elements 註冊成功
    // 使用相對路徑，瀏覽器會自動相對於目前檔案位置解析
    try {
      await Promise.all([
        import("./lab/LabIndex.js"),
        import("./lab/SpeechPage.js"),
        import("./lab/WebRTCPage.js"),
        import("./lab/CryptoPage.js"),
        import("./lab/WasmPage.js"),
        import("./lab/SerialPage.js"),
        import("./lab/FormsPage.js"),
        import("./lab/CollabPage.js"),
        import("./lab/MediaPage.js"),
        import("./lab/NFCPage.js"),
        import("./lab/BarcodePage.js"),
        import("./lab/WebAuthnPage.js"),
        import("./lab/PopoverPage.js"),
        import("./lab/EyeDropperPage.js"),
        import("./lab/WebLocksPage.js"),
        import("./lab/WakeLockPage.js"),
        import("./lab/BadgingPage.js"),
        import("./lab/WebCodecsPage.js"),
        import("./lab/ViewTransitionsPage.js"),
        import("./lab/PermissionsPreflightPage.js"),
        import("./lab/WebSharePage.js"),
        import("./lab/WebGPUPage.js"),
        import("./lab/FileSystemPage.js"),
        import("./lab/CompressionPage.js"),
        import("./lab/PWAAdvancedPage.js"),
        import("./lab/ImageStudioPage.js"),
        import("./lab/NetworkPage.js"),
        import("./lab/PerformancePage.js"),
        import("./lab/MIDIPage.js"),
        import("./lab/AudioPage.js"),
      ]);

      // 載入完成後手動觸發一次渲染與更新
      this.update();
      this.afterFirstRender();
    } catch (err) {
      console.error("[Lab] Failed to preload sub-pages:", err);
    }
  }

  afterFirstRender() {
    const sw = this.querySelector("x-switch");
    if (sw && typeof sw.update === "function") {
      sw.update();
    }
  }

  render() {
    return html`
      <style>
        .lab-header {
          margin-bottom: 2rem;
          border-bottom: 1px solid #eee;
          padding-bottom: 1rem;
        }
        .lab-content {
          min-height: 400px;
        }
      </style>

      <div class="lab-header">
        <h1>🧪 Vanilla 實驗室</h1>
        <p>
          探索最前沿的原生 Web 技術。路徑：<code>${window.location.hash}</code>
        </p>
      </div>

      <div class="lab-content">
        <x-switch>
          <!-- 支援多種進入路徑，防止空白 -->
          <x-route path="/lab" exact><page-lab-index></page-lab-index></x-route>
          <x-route path="/lab/" exact
            ><page-lab-index></page-lab-index
          ></x-route>

          <x-route path="/lab/speech" exact
            ><page-lab-speech></page-lab-speech
          ></x-route>
          <x-route path="/lab/webrtc" exact
            ><page-lab-webrtc></page-lab-webrtc
          ></x-route>
          <x-route path="/lab/crypto" exact
            ><page-lab-crypto></page-lab-crypto
          ></x-route>
          <x-route path="/lab/wasm" exact
            ><page-lab-wasm></page-lab-wasm
          ></x-route>
          <x-route path="/lab/serial" exact
            ><page-lab-serial></page-lab-serial
          ></x-route>
          <x-route path="/lab/forms" exact
            ><page-lab-forms></page-lab-forms
          ></x-route>
          <x-route path="/lab/collab" exact
            ><page-lab-collab></page-lab-collab
          ></x-route>
          <x-route path="/lab/media" exact
            ><page-lab-media></page-lab-media
          ></x-route>
          <x-route path="/lab/nfc" exact><page-lab-nfc></page-lab-nfc></x-route>
          <x-route path="/lab/barcode" exact
            ><page-lab-barcode></page-lab-barcode
          ></x-route>
          <x-route path="/lab/webauthn" exact
            ><page-lab-webauthn></page-lab-webauthn
          ></x-route>
          <x-route path="/lab/popover" exact
            ><page-lab-popover></page-lab-popover
          ></x-route>
          <x-route path="/lab/eyedropper" exact
            ><page-lab-eyedropper></page-lab-eyedropper
          ></x-route>
          <x-route path="/lab/weblocks" exact
            ><page-lab-weblocks></page-lab-weblocks
          ></x-route>
          <x-route path="/lab/wakelock" exact
            ><page-lab-wakelock></page-lab-wakelock
          ></x-route>
          <x-route path="/lab/badging" exact
            ><page-lab-badging></page-lab-badging
          ></x-route>
          <x-route path="/lab/webcodecs" exact
            ><page-lab-webcodecs></page-lab-webcodecs
          ></x-route>
          <x-route path="/lab/view-transitions" exact
            ><page-lab-view-transitions></page-lab-view-transitions
          ></x-route>
          <x-route path="/lab/permissions" exact
            ><page-lab-permissions-preflight></page-lab-permissions-preflight
          ></x-route>
                              <x-route path="/lab/web-share" exact><page-lab-web-share></page-lab-web-share></x-route>
                                                  <x-route path="/lab/webgpu" exact
                                                    ><page-lab-webgpu></page-lab-webgpu
                                                  ></x-route>
                                                            <x-route path="/lab/image-studio" exact
                                                              ><page-lab-image-studio></page-lab-image-studio
                                                            ></x-route>
                                                                      <x-route path="/lab/network" exact
                                                                        ><page-lab-network></page-lab-network
                                                                      ></x-route>
                                                                                <x-route path="/lab/performance" exact
                                                                                  ><page-lab-performance></page-lab-performance
                                                                                ></x-route>
                                                                                          <x-route path="/lab/midi" exact
                                                                                            ><page-lab-midi></page-lab-midi
                                                                                          ></x-route>
                                                                                          <x-route path="/lab/audio" exact
                                                                                            ><page-lab-audio></page-lab-audio
                                                                                          ></x-route>
                                                                                
                                                                                                                                                                          <x-route path="/lab/file-system" exact
                                                    ><page-lab-file-system></page-lab-file-system
                                                  ></x-route>
                                                  <x-route path="/lab/compression" exact
                                                    ><page-lab-compression></page-lab-compression
                                                  ></x-route>
                                                  <x-route path="/lab/pwa-advanced" exact
                                                    ><page-pwa-advanced></page-pwa-advanced
                                                  ></x-route>
                                                  
                              <!-- 通配符 fallback -->
          
          <x-route path="/lab/*"><page-lab-index></page-lab-index></x-route>
        </x-switch>
      </div>
    `;
  }
}

customElements.define("page-lab", LabPage);
