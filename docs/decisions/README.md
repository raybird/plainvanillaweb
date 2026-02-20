# 架構決策紀錄 (Architecture Decision Records)

本文檔追蹤專案演進過程中的關鍵技術決策。

## 索引

| ID                                                 | 標題                                         | 狀態                            |
| -------------------------------------------------- | -------------------------------------------- | ------------------------------- |
| [0001](./0001-service-based-architecture.md)       | 採用 Service 導向的原生架構                  | Accepted                        |
| [0002](./0002-base-component-pattern.md)           | BaseComponent 組件模式                       | Accepted                        |
| [0003](./0003-scoped-css-strategy.md)              | CSS 變數封裝規範                             | Deprecated (Superceded by 0005) |
| [0004](./0004-ai-maintenance-tooling.md)           | AI 專用自動化維護工具 (Sync Script)          | Accepted                        |
| [0005](./0005-css-variables-encapsulation.md)      | CSS 變數封裝規範 (Scoped Strategy)           | Accepted                        |
| [0006](./0006-scaffolding-cli.md)                  | 動態腳手架 (Scaffolding CLI)                 | Accepted                        |
| [0007](./0007-web-workers-integration.md)          | Web Workers 服務化整合                       | Accepted                        |
| [0008](./0008-caching-strategy.md)                 | 智能快取策略 (LocalStorage)                  | Accepted                        |
| [0009](./0009-error-boundary-strategy.md)          | 全域錯誤邊界策略                             | Accepted                        |
| [0010](./0010-integrated-demo-strategy.md)         | 整合式 Demo 策略                             | Accepted                        |
| [0011](./0011-landing-page-strategy.md)            | Landing Page 策略                            | Accepted                        |
| [0012](./0012-indexeddb-caching.md)                | 基於 IndexedDB 的進階快取策略                | Accepted                        |
| [0013](./0013-unified-dashboard.md)                | 整合開發者儀表板 (Unified Dashboard)         | Accepted                        |
| [0014](./0014-spa-routing-hack.md)                 | GitHub Pages SPA 路由修復                    | Accepted                        |
| [0015](./0015-user-profile-assets.md)              | 使用者個人資料與資源管理                     | Accepted                        |
| [0016](./0016-pwa-support.md)                      | 漸進式網頁應用 (PWA) 支援                    | Accepted                        |
| [0017](./0017-native-i18n.md)                      | 原生輕量級國際化系統 (i18n)                  | Accepted                        |
| [0018](./0018-seo-a11y.md)                         | SEO 與無障礙優化 (A11y)                      | Accepted                        |
| [0019](./0019-advanced-theming.md)                 | 進階主題系統 (Advanced Theming)              | Accepted                        |
| [0020](./0020-network-monitor.md)                  | 原生網路請求監控 (Network Monitor)           | Accepted                        |
| [0021](./0021-documentation-hub.md)                | 內建技術文件中心 (Doc Hub)                   | Accepted                        |
| [0022](./0022-safe-html-strategy.md)               | 安全 HTML 與 XSS 防護策略                    | Accepted                        |
| [0023](./0023-form-validation.md)                  | 原生表單驗證引擎 (Constraint Validation)     | Accepted                        |
| [0024](./0024-fetch-lifecycle.md)                  | 非同步請求生命週期管理 (AbortController)     | Accepted                        |
| [0025](./0025-connectivity-pwa-updates.md)         | 連線偵測與 PWA 版本更新通知                  | Accepted                        |
| [0026](./0026-reactive-local-state.md)             | 組件反應式本地狀態 (Proxy-based State)       | Accepted                        |
| [0027](./0027-performance-monitoring.md)           | 原生性能監控與 Web Vitals                    | Accepted                        |
| [0028](./0028-page-transitions.md)                 | 原生頁面過渡動畫 (View Transitions API)      | Accepted                        |
| [0029](./0029-lazy-loading-prefetching.md)         | 資源動態載入與智能預載 (Lazy & Prefetch)     | Accepted                        |
| [0030](./0030-notification-service.md)             | 通過服務解耦的通知系統                       | Accepted                        |
| [0031](./0031-cross-tab-sync.md)                   | 跨分頁狀態同步 (BroadcastChannel)            | Accepted                        |
| [0032](./0032-native-modal-system.md)              | 原生對話框系統 (HTML5 <dialog>)              | Accepted                        |
| [0033](./0033-native-charts-canvas.md)             | 高效能原生 Canvas 圖表實作                   | Accepted                        |
| [0034](./0034-offline-sync.md)                     | 離線動作排隊與自動同步機制                   | Accepted                        |
| [0035](./0035-native-auth-system.md)               | 身分驗證系統與路由守衛 (Auth Guard)          | Accepted                        |
| [0036](./0036-undo-redo-history.md)                | 操作歷史管理 (Undo/Redo History Stack)       | Accepted                        |
| [0037](./0037-virtual-list.md)                     | 原生虛擬列表組件 (Virtual List)              | Accepted                        |
| [0038](./0038-image-processing.md)                 | 原生影像處理服務 (Canvas Image Filters)      | Accepted                        |
| [0039](./0039-native-speech-service.md)            | 原生語音服務 (Web Speech API)                | Accepted                        |
| [0040](./0040-native-slots-system.md)              | 原生組件組合與插槽模擬 (Slots)               | Accepted                        |
| [0041](./0041-native-playground.md)                | 原生程式碼遊樂場 (Live Playground)           | Accepted                        |
| [0042](./0042-native-storage-management.md)        | 原生儲存配額監控與持久化 (StorageManager)    | Accepted                        |
| [0043](./0043-native-web-crypto.md)                | 原生 Web Crypto 服務整合 (Native Web Crypto) | Accepted                        |
| [0044](./0044-wasm-integration.md)                 | WebAssembly (Wasm) 整合策略                  | Accepted                        |
| [0045](./0045-webgpu-integration.md)               | 次世代 WebGPU 運算與渲染架構                 | Accepted                        |
| [0046](./0046-file-system-access.md)               | File System Access API 本地開發環境整合      | Accepted                        |
| [0047](./0047-compression-streams.md)              | 原生 Compression Streams 數據優化            | Accepted                        |
| [0048](./0048-webrtc-p2p-sync.md)                  | WebRTC P2P 無伺服器通訊架構                  | Accepted                        |
| [0049](./0049-web-share-integration.md)            | 原生 Web Share 與 Web Share Target 整合      | Accepted                        |
| [0050](./0050-pwa-advanced-features.md)            | 原生 PWA 安裝引導與進階同步機制              | Accepted                        |
| [0051](./0051-sdk-oriented-distribution.md)        | SDK 導向的分發策略與模組純化                 | Accepted                        |
| [0052](./0052-web-bluetooth-integration.md)        | 原生 Web Bluetooth 與裝置通訊整合            | Accepted                        |
| [0053](./0053-mobile-readability.md)               | 手機閱讀體驗與響應式優化                     | Accepted                        |
| [0054](./0054-mobile-responsiveness-strategy.md)   | 響應式設計與行動體驗優化策略                 | Accepted                        |
| [0055](./0055-screen-capture-integration.md)       | 原生螢幕錄製與串流整合                       | Accepted                        |
| [0056](./0056-payment-request-integration.md)      | 原生 Payment Request API 整合                | Accepted                        |
| [0057](./0057-industrial-sdk-design.md)            | SDK 型別與介面標準化 (Industrial SDK Design) | Accepted                        |
| [0058](./0058-sw-notification-debounce.md)         | Service Worker 更新通知防抖與跨分頁去重      | Accepted                        |
| [0059](./0059-native-data-visualization.md)        | 原生 SVG 圖表引擎整合                        | Accepted                        |
| [0060](./0060-live-stream-processing.md)           | 原生即時串流處理機制                         | Accepted                        |
| [0061](./0061-web-serial-integration.md)           | 原生 Web Serial API 整合                     | Accepted                        |
| [0062](./0062-native-reactive-form-engine.md)      | 原生響應式表單引擎                           | Accepted                        |
| [0063](./0063-crdt-data-sync.md)                   | CRDT 數據一致性策略                          | Accepted                        |
| [0065](./0065-modular-lab-routing.md)              | 實驗室模組化與巢狀路由架構                   | Accepted                        |
| [0066](./0066-web-nfc-integration.md)              | 原生 Web NFC API 整合                        | Accepted                        |
| [0067](./0067-barcode-detection-integration.md)    | 原生 Barcode Detection API 整合              | Accepted                        |
| [0068](./0068-webauthn-integration.md)             | 原生 WebAuthn 生物辨識支援                   | Accepted                        |
| [0069](./0069-popover-api-integration.md)          | 原生 Popover API 互動層                      | Accepted                        |
| [0070](./0070-eye-dropper-integration.md)          | 原生 EyeDropper API 取色體驗                 | Accepted                        |
| [0071](./0071-web-locks-integration.md)            | 原生 Web Locks API 併發協調                  | Accepted                        |
| [0072](./0072-screen-wake-lock-integration.md)     | 原生 Screen Wake Lock 保持喚醒               | Accepted                        |
| [0073](./0073-badging-api-integration.md)          | 原生 Badging API 應用徽章                    | Accepted                        |
| [0074](./0074-webcodecs-integration.md)            | 原生 WebCodecs 低延遲編碼                    | Accepted                        |
| [0075](./0075-view-transitions-lab-integration.md) | 強化 View Transitions 教學頁整合             | Accepted                        |
