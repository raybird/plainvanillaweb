import { html } from "../../lib/html.js";
import { BaseComponent } from "../../lib/base-component.js";
import { router } from "../../lib/router.js";

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

  connectedCallback() {
    super.connectedCallback();
    // 子頁面由各自 <x-route> 的 module 屬性在進入時延遲載入（ADR 0102）。
    // <page-lab> 在 /lab/* 之間換頁時不會重建，標頭顯示的路徑要自己更新；
    // 重繪時 <x-switch data-persistent> 原樣保留，不會重建子頁面。
    this._offRoute = router.on("route-change", () => this.scheduleUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._offRoute?.();
  }

  render() {
    return html`
      <style>
        .lab-header {
          margin-bottom: 2rem;
          border-bottom: 1px solid var(--border-color);
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
        <x-switch data-persistent="lab-routes">
          <!-- 支援多種進入路徑，防止空白 -->
          <x-route path="/lab" exact module="./components/pages/lab/LabIndex.js"><template><page-lab-index></page-lab-index></template></x-route>
          <x-route path="/lab/" exact module="./components/pages/lab/LabIndex.js"
            ><template><page-lab-index></page-lab-index
          ></template></x-route>

          <x-route path="/lab/speech" exact module="./components/pages/lab/SpeechPage.js"
            ><template><page-lab-speech></page-lab-speech
          ></template></x-route>
          <x-route path="/lab/webrtc" exact module="./components/pages/lab/WebRTCPage.js"
            ><template><page-lab-webrtc></page-lab-webrtc
          ></template></x-route>
          <x-route path="/lab/crypto" exact module="./components/pages/lab/CryptoPage.js"
            ><template><page-lab-crypto></page-lab-crypto
          ></template></x-route>
          <x-route path="/lab/wasm" exact module="./components/pages/lab/WasmPage.js"
            ><template><page-lab-wasm></page-lab-wasm
          ></template></x-route>
          <x-route path="/lab/serial" exact module="./components/pages/lab/SerialPage.js"
            ><template><page-lab-serial></page-lab-serial
          ></template></x-route>
          <x-route path="/lab/forms" exact module="./components/pages/lab/FormsPage.js"
            ><template><page-lab-forms></page-lab-forms
          ></template></x-route>
          <x-route path="/lab/collab" exact module="./components/pages/lab/CollabPage.js"
            ><template><page-lab-collab></page-lab-collab
          ></template></x-route>
          <x-route path="/lab/media" exact module="./components/pages/lab/MediaPage.js"
            ><template><page-lab-media></page-lab-media
          ></template></x-route>
          <x-route path="/lab/nfc" exact module="./components/pages/lab/NFCPage.js"><template><page-lab-nfc></page-lab-nfc></template></x-route>
          <x-route path="/lab/barcode" exact module="./components/pages/lab/BarcodePage.js"
            ><template><page-lab-barcode></page-lab-barcode
          ></template></x-route>
          <x-route path="/lab/webauthn" exact module="./components/pages/lab/WebAuthnPage.js"
            ><template><page-lab-webauthn></page-lab-webauthn
          ></template></x-route>
          <x-route path="/lab/popover" exact module="./components/pages/lab/PopoverPage.js"
            ><template><page-lab-popover></page-lab-popover
          ></template></x-route>
          <x-route path="/lab/eyedropper" exact module="./components/pages/lab/EyeDropperPage.js"
            ><template><page-lab-eyedropper></page-lab-eyedropper
          ></template></x-route>
          <x-route path="/lab/weblocks" exact module="./components/pages/lab/WebLocksPage.js"
            ><template><page-lab-weblocks></page-lab-weblocks
          ></template></x-route>
          <x-route path="/lab/wakelock" exact module="./components/pages/lab/WakeLockPage.js"
            ><template><page-lab-wakelock></page-lab-wakelock
          ></template></x-route>
          <x-route path="/lab/badging" exact module="./components/pages/lab/BadgingPage.js"
            ><template><page-lab-badging></page-lab-badging
          ></template></x-route>
          <x-route path="/lab/webcodecs" exact module="./components/pages/lab/WebCodecsPage.js"
            ><template><page-lab-webcodecs></page-lab-webcodecs
          ></template></x-route>
          <x-route path="/lab/view-transitions" exact module="./components/pages/lab/ViewTransitionsPage.js"
            ><template><page-lab-view-transitions></page-lab-view-transitions
          ></template></x-route>
          <x-route path="/lab/permissions" exact module="./components/pages/lab/PermissionsPreflightPage.js"
            ><template><page-lab-permissions-preflight></page-lab-permissions-preflight
          ></template></x-route>
                              <x-route path="/lab/web-share" exact module="./components/pages/lab/WebSharePage.js"><template><page-lab-web-share></page-lab-web-share></template></x-route>
                                                  <x-route path="/lab/webgpu" exact module="./components/pages/lab/WebGPUPage.js"
                                                    ><template><page-lab-webgpu></page-lab-webgpu
                                                  ></template></x-route>
                                                            <x-route path="/lab/image-studio" exact module="./components/pages/lab/ImageStudioPage.js"
                                                              ><template><page-lab-image-studio></page-lab-image-studio
                                                            ></template></x-route>
                                                                      <x-route path="/lab/network" exact module="./components/pages/lab/NetworkPage.js"
                                                                        ><template><page-lab-network></page-lab-network
                                                                      ></template></x-route>
                                                                                <x-route path="/lab/performance" exact module="./components/pages/lab/PerformancePage.js"
                                                                                  ><template><page-lab-performance></page-lab-performance
                                                                                ></template></x-route>
                                                                                          <x-route path="/lab/midi" exact module="./components/pages/lab/MIDIPage.js"
                                                                                            ><template><page-lab-midi></page-lab-midi
                                                                                          ></template></x-route>
                                                                                                    <x-route path="/lab/audio" exact module="./components/pages/lab/AudioPage.js"
                                                                                                      ><template><page-lab-audio></page-lab-audio
                                                                                                    ></template></x-route>
                                                                                                              <x-route path="/lab/bluetooth" exact module="./components/pages/lab/BluetoothPage.js"
                                                                                                                ><template><page-lab-bluetooth></page-lab-bluetooth
                                                                                                              ></template></x-route>
                                                                                                                        <x-route path="/lab/layout" exact module="./components/pages/lab/LayoutPage.js"
                                                                                                                          ><template><page-lab-layout></page-lab-layout
                                                                                                                        ></template></x-route>
                                                                                                                        <x-route path="/lab/service-pattern" exact module="./components/pages/lab/ServicePatternPage.js"
                                                                                                                          ><template><page-lab-service-pattern></page-lab-service-pattern
                                                                                                                        ></template></x-route>
                                                                                                                        <x-route path="/lab/payment" exact module="./components/pages/lab/PaymentPage.js"><template><page-lab-payment></page-lab-payment></template></x-route>
                                                                                                                        <x-route path="/lab/broadcast" exact module="./components/pages/lab/BroadcastPage.js"><template><page-lab-broadcast></page-lab-broadcast></template></x-route>
                                                                                                                        <x-route path="/lab/modal" exact module="./components/pages/lab/ModalPage.js"><template><page-lab-modal></page-lab-modal></template></x-route>
                                                                                                                        <x-route path="/lab/chart" exact module="./components/pages/lab/ChartPage.js"><template><page-lab-chart></page-lab-chart></template></x-route>
                                                                                                                        <x-route path="/lab/history" exact module="./components/pages/lab/HistoryPage.js"><template><page-lab-history></page-lab-history></template></x-route>
                                                                                                                                                                                                                                                                                                                                                                                  <x-route path="/lab/file-system" exact module="./components/pages/lab/FileSystemPage.js"
                                                    ><template><page-lab-file-system></page-lab-file-system
                                                  ></template></x-route>
                                                  <x-route path="/lab/compression" exact module="./components/pages/lab/CompressionPage.js"
                                                    ><template><page-lab-compression></page-lab-compression
                                                  ></template></x-route>
                                                  <x-route path="/lab/pwa-advanced" exact module="./components/pages/lab/PWAAdvancedPage.js"
                                                    ><template><page-pwa-advanced></page-pwa-advanced
                                                  ></template></x-route>
                                                  <x-route path="/lab/indexeddb-backup" exact module="./components/pages/lab/IndexedDBBackupPage.js"
                                                    ><template><indexeddb-backup-page></indexeddb-backup-page
                                                  ></template></x-route>
                                                  
                              <!-- 通配符 fallback -->
          
          <x-route path="/lab/*" module="./components/pages/lab/LabIndex.js"><template><page-lab-index></page-lab-index></template></x-route>
        </x-switch>
      </div>
    `;
  }
}

customElements.define("page-lab", LabPage);
