# 🏗️ 原生架構決策 (ADR) 索引

本文檔彙整了本專案演進過程中的關鍵技術決策紀錄 (Architecture Decision Records)。

## 索引表

| ID | 標題 | 狀態 |
|----|------|------|
| 0001 | [採用 Service 導向的原生架構](./0001-service-based-architecture.md) | [已實作] |
| 0002 | [極簡組件模式 (BaseComponent Pattern)](./0002-base-component-pattern.md) | [已實作] |
| 0003 | [CSS 封裝策略 (Scoped CSS Strategy)](./0003-scoped-css-strategy.md) | [已實作] |
| 0004 | [AI 專用維護工具 (AI Maintenance Tooling)](./0004-ai-maintenance-tooling.md) | [已實作] |
| 0005 | [CSS 變數封裝規範 (CSS Variables Encapsulation)](./0005-css-variables-encapsulation.md) | [已實作] |
| 0006 | [動態腳手架工具 (Scaffolding CLI)](./0006-scaffolding-cli.md) | [已實作] |
| 0007 | [Web Workers 服務化整合 (Web Workers Service)](./0007-web-workers-integration.md) | [已實作] |
| 0008 | [智能快取策略 (Caching Strategy)](./0008-caching-strategy.md) | [已實作] |
| 0009 | [錯誤邊界與全域復原策略 (Error Boundary Strategy)](./0009-error-boundary-strategy.md) | [已實作] |
| 0010 | [整合範例策略 (Integrated Demo Strategy)](./0010-integrated-demo-strategy.md) | [已實作] |
| 0011 | [到達頁面策略 (Landing Page Strategy)](./0011-landing-page-strategy.md) | [已實作] |
| 0012 | [基於 IndexedDB 的進階快取策略 (IndexedDB-based Advanced Caching)](./0012-indexeddb-caching.md) | [已實作] |
| 0013 | [整合開發者儀表板 (Unified Developer Dashboard)](./0013-unified-dashboard.md) | [已實作] |
| 0014 | [GitHub Pages SPA 路由修復 (SPA 404 Hack)](./0014-spa-routing-hack.md) | [已實作] |
| 0015 | [使用者個人資料與靜態資源管理 (User Profile & Asset Management)](./0015-user-profile-assets.md) | [已實作] |
| 0016 | [漸進式網頁應用支援 (Progressive Web App Support)](./0016-pwa-support.md) | [已實作] |
| 0017 | [原生輕量級國際化系統 (Native Lightweight i18n System)](./0017-native-i18n.md) | [已實作] |
| 0018 | [SEO 與無障礙優化 (SEO & A11y Enhancement)](./0018-seo-a11y.md) | [已實作] |
| 0019 | [進階主題系統 (Advanced Theming System)](./0019-advanced-theming.md) | [已實作] |
| 0020 | [網路請求監控器 (Network Monitor)](./0020-network-monitor.md) | [已實作] |
| 0021 | [內建教學文件中心 (Built-in Documentation Hub)](./0021-documentation-hub.md) | [已實作] |
| 0022 | [自動轉義與受信任 HTML 策略 (Auto-escaping & Trusted HTML Strategy)](./0022-safe-html-strategy.md) | [已實作] |
| 0023 | [原生表單驗證引擎 (Native Form Validation Engine)](./0023-form-validation.md) | [已實作] |
| 0024 | [非同步請求生命週期管理 (Fetch Lifecycle Management)](./0024-fetch-lifecycle.md) | [已實作] |
| 0025 | [連線狀態與 PWA 更新管理 (Connectivity & SW Update Management)](./0025-connectivity-pwa-updates.md) | [已實作] |
| 0026 | [組件反應式本地狀態 (Reactive Local State for Components)](./0026-reactive-local-state.md) | [已實作] |
| 0027 | [原生性能監控服務 (Native Performance Monitoring Service)](./0027-performance-monitoring.md) | [已實作] |
| 0028 | [原生頁面過渡動畫 (Native Page Transitions)](./0028-page-transitions.md) | [已實作] |
| 0029 | [路由驅動的組件動態載入與預載 (Route-based Dynamic Loading & Prefetching)](./0029-lazy-loading-prefetching.md) | [已實作] |
| 0030 | [通知機制抽象化 (Notification Service Abstraction)](./0030-notification-service.md) | [已實作] |
| 0031 | [跨分頁狀態同步機制 (Cross-tab State Synchronization)](./0031-cross-tab-sync.md) | [已實作] |
| 0032 | [原生對話框系統 (Native Modal/Dialog System)](./0032-native-modal-system.md) | [已實作] |
| 0033 | [原生 Canvas 高效能圖表系統 (Native High-Performance Charting)](./0033-native-charts-canvas.md) | [已實作] |
| 0034 | [離線動作同步機制 (Offline Action Sync Mechanism)](./0034-offline-sync.md) | [已實作] |
| 0035 | [原生身分驗證與路由保護 (Native Auth System & Route Guards)](./0035-native-auth-system.md) | [已實作] |
| 0036 | [原生撤銷/重做歷史服務 (Native Undo/Redo History Service)](./0036-undo-redo-history.md) | [已實作] |
| 0037 | [原生虛擬列表組件 (Native Virtual List Component)](./0037-virtual-list.md) | [已實作] |
| 0038 | [原生影像處理服務 (Native Image Processing Service)](./0038-image-processing.md) | [已實作] |
| 0039 | [原生語音服務與實驗室 (Native Speech Service & Lab)](./0039-native-speech-service.md) | [已實作] |
| 0040 | [原生組件組合與插槽模擬 (Native Component Composition & Slot Simulation)](./0040-native-slots-system.md) | [已實作] |
| 0041 | [原生程式碼遊樂場 (Native Live Code Playground)](./0041-native-playground.md) | [已實作] |
| 0042 | [原生儲存管理服務 (Native Storage Management Service)](./0042-native-storage-management.md) | [已實作] |
| 0043 | [原生 Web Crypto 服務整合 (Native Web Crypto Integration)](./0043-native-web-crypto.md) | [已實作] |
| 0044 | [WebAssembly (Wasm) 整合策略](./0044-wasm-integration.md) | [已實作] |
| 0045 | [次世代 WebGPU 運算與渲染架構](./0045-webgpu-integration.md) | [已實作] |
| 0046 | [File System Access API 本地開發環境整合](./0046-file-system-access.md) | [已實作] |
| 0047 | [原生 Compression Streams 數據優化](./0047-compression-streams.md) | [已實作] |
| 0048 | [WebRTC P2P 無伺服器通訊架構](./0048-webrtc-p2p-sync.md) | [已實作] |
| 0049 | [原生 Web Share 與 Web Share Target 整合](./0049-web-share-integration.md) | [已實作] |
| 0050 | [原生 PWA 安裝引導與進階同步機制](./0050-pwa-advanced-features.md) | [已實作] |
| 0051 | [SDK 導向的分發策略 (SDK-Oriented Distribution)](./0051-sdk-oriented-distribution.md) | [已實作] |
| 0052 | [原生 Web Bluetooth 與裝置通訊整合](./0052-web-bluetooth-integration.md) | [已實作] |
| 0053 | [響應式設計與行動體驗優化策略](./0053-mobile-readability.md) | [已實作] |
| 0054 | [響應式設計與行動體驗優化策略](./0054-mobile-responsiveness-strategy.md) | [已實作] |
| 0055 | [原生螢幕錄製與串流整合](./0055-screen-capture-integration.md) | [已實作] |
| 0056 | [原生 Payment Request API 整合](./0056-payment-request-integration.md) | [已實作] |
| 0056 | [引入 Shadow DOM 支援與元件隔離策略](./0056-shadow-dom-encapsulation.md) | [已實作] |
| 0057 | [原生背景抓取 (Background Fetch) 整合](./0057-background-fetch-integration.md) | [已實作] |
| 0057 | [SDK 型別與介面標準化 (Industrial SDK Design)](./0057-industrial-sdk-design.md) | [已實作] |
| 0058 | [解決 Service Worker 更新通知在多分頁環境下的重複顯示問題](./0058-sw-notification-debounce.md) | [已實作] |
| 0059 | [實作原生 SVG 圖表引擎](./0059-native-data-visualization.md) | [已實作] |
| 0060 | [實作原生即時串流處理機制](./0060-live-stream-processing.md) | [已實作] |
| 0061 | [引入原生 Web Serial API 支援](./0061-web-serial-integration.md) | [已實作] |
| 0062 | [實作原生響應式表單引擎](./0062-native-reactive-form-engine.md) | [已實作] |
| 0063 | [實作基於 CRDT 的數據一致性策略](./0063-crdt-data-sync.md) | [已實作] |
| 0065 | [實驗室模組化與巢狀路由架構](./0065-modular-lab-routing.md) | [已實作] |
| 0066 | [引入原生 Web NFC API 支援](./0066-web-nfc-integration.md) | [已實作] |
| 0067 | [引入原生 Barcode Detection API 支援](./0067-barcode-detection-integration.md) | [已實作] |
| 0068 | [引入原生 WebAuthn 生物辨識支援](./0068-webauthn-integration.md) | [已實作] |
| 0069 | [引入原生 Popover API 互動層](./0069-popover-api-integration.md) | [已實作] |
| 0070 | [引入原生 EyeDropper API 取色體驗](./0070-eye-dropper-integration.md) | [已實作] |
| 0071 | [引入原生 Web Locks API 併發協調](./0071-web-locks-integration.md) | [已實作] |
| 0072 | [引入原生 Screen Wake Lock API 保持喚醒](./0072-screen-wake-lock-integration.md) | [已實作] |
| 0073 | [引入原生 Badging API 應用徽章](./0073-badging-api-integration.md) | [已實作] |
| 0074 | [引入原生 WebCodecs 低延遲編碼教學](./0074-webcodecs-integration.md) | [已實作] |
| 0075 | [強化 View Transitions 教學頁整合](./0075-view-transitions-lab-integration.md) | [已實作] |
| 0076 | [建立 Docs 與 Lab 雙向快參照](./0076-docs-lab-cross-reference.md) | [已實作] |
| 0077 | [權限預檢教學頁與鏡頭啟動策略](./0077-permission-preflight-lab.md) | [已實作] |
| 0078 | [Web Share 教學頁與 Query-Aware Hash Routing](./0078-web-share-lab-routing.md) | [已實作] |
| 0079 | [WebGPU 運算實驗室整合](./0079-webgpu-lab-integration.md) | [已實作] |
| 0080 | [檔案系統存取實驗室整合](./0080-file-system-lab-integration.md) | [已實作] |
| 0081 | [數據壓縮流實驗室整合](./0081-compression-lab-integration.md) | [已實作] |
| 0082 | [原生影像工作室 (Native Image Studio) 整合](./0082-native-image-studio.md) | [已實作] |
| 0083 | [原生網路資訊與連線性實驗室整合](./0083-network-connectivity-lab.md) | [已實作] |
| 0084 | [WebRTC 手動連線流程優化](./0084-webrtc-manual-connection.md) | [已實作] |
| 0086 | [原生效能儀表板 (Performance Dashboard) 整合](./0086-performance-dashboard-lab.md) | [已實作] |
| 0087 | [原生 Web MIDI API 整合](./0087-web-midi-integration.md) | [已實作] |
| 0088 | [原生 Web Audio 合成器 (Oscillator) 實驗室整合](./0088-web-audio-oscillator.md) | [已實作] |
| 0092 | [實作 BaseComponent 反應式深度觀察與效能優化](./0092-reactive-state-optimization.md) | [已實作] |
| 0093 | [原生 Web Bluetooth 整合與硬體通訊規範](./0093-web-bluetooth-lab.md) | [已實作] |
| 0094 | [原生 CSS 變數主題引擎與佈局教學實作](./0094-layout-theme-lab.md) | [已實作] |
| 0095 | [原生 Service 交互模式與注入規範 (Standardized Patterns)](./0095-service-interaction-patterns.md) | [已實作] |
| 0096 | [原生 Vanilla 宣言與長青代碼準則實作](./0096-vanilla-manifesto.md) | [已實作] |

---
*詳細內容請參閱 `docs/decisions/*.md`。*
*此檔案由 `scripts/update-adr-index.js` 自動生成。*
