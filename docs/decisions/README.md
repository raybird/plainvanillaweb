# 架構決策紀錄 (Architecture Decision Records)

本文檔追蹤專案演進過程中的關鍵技術決策。

## 索引

| ID | 標題 | 狀態 | 
|----|------|------|
| [0001](./0001-service-based-architecture.md) | 採用 Service 導向的原生架構 | Accepted |
| [0002](./0002-base-component-pattern.md) | BaseComponent 組件模式 | Accepted |
| [0003](./0003-scoped-css-strategy.md) | CSS 變數封裝規範 | Deprecated (Superceded by 0005) |
| [0004](./0004-ai-maintenance-tooling.md) | AI 專用自動化維護工具 (Sync Script) | Accepted |
| [0005](./0005-css-variables-encapsulation.md) | CSS 變數封裝規範 (Scoped Strategy) | Accepted |
| [0006](./0006-scaffolding-cli.md) | 動態腳手架 (Scaffolding CLI) | Accepted |
| [0007](./0007-web-workers-integration.md) | Web Workers 服務化整合 | Accepted |
| [0008](./0008-caching-strategy.md) | 智能快取策略 (LocalStorage) | Accepted |
| [0009](./0009-error-boundary-strategy.md) | 全域錯誤邊界策略 | Accepted |
| [0010](./0010-integrated-demo-strategy.md) | 整合式 Demo 策略 | Accepted |
| [0011](./0011-landing-page-strategy.md) | Landing Page 策略 | Accepted |
| [0012](./0012-indexeddb-caching.md) | 基於 IndexedDB 的進階快取策略 | Accepted |
| [0013](./0013-unified-dashboard.md) | 整合開發者儀表板 (Unified Dashboard) | Accepted |
| [0014](./0014-spa-routing-hack.md) | GitHub Pages SPA 路由修復 | Accepted |
| [0015](./0015-user-profile-assets.md) | 使用者個人資料與資源管理 | Accepted |
| [0016](./0016-pwa-support.md) | 漸進式網頁應用 (PWA) 支援 | Accepted |
| [0017](./0017-native-i18n.md) | 原生輕量級國際化系統 (i18n) | Accepted |
| [0018](./0018-seo-a11y.md) | SEO 與無障礙優化 (A11y) | Accepted |
| [0019](./0019-advanced-theming.md) | 進階主題系統 (Advanced Theming) | Accepted |
| [0020](./0020-network-monitor.md) | 原生網路請求監控 (Network Monitor) | Accepted |
| [0021](./0021-documentation-hub.md) | 內建技術文件中心 (Doc Hub) | Accepted |
| [0022](./0022-safe-html-strategy.md) | 安全 HTML 與 XSS 防護策略 | Accepted |
| [0023](./0023-form-validation.md) | 原生表單驗證引擎 (Constraint Validation) | Accepted |
| [0024](./0024-fetch-lifecycle.md) | 非同步請求生命週期管理 (AbortController) | Accepted |
| [0025](./0025-connectivity-pwa-updates.md) | 連線偵測與 PWA 版本更新通知 | Accepted |
| [0026](./0026-reactive-local-state.md) | 組件反應式本地狀態 (Proxy-based State) | Accepted |
| [0027](./0027-performance-monitoring.md) | 原生性能監控與 Web Vitals | Accepted |
| [0028](./0028-page-transitions.md) | 原生頁面過渡動畫 (View Transitions API) | Accepted |
| [0029](./0029-lazy-loading-prefetching.md) | 資源動態載入與智能預載 (Lazy & Prefetch) | Accepted |
| [0030](./0030-notification-service.md) | 通過服務解耦的通知系統 | Accepted |
| [0031](./0031-cross-tab-sync.md) | 跨分頁狀態同步 (BroadcastChannel) | Accepted |
| [0032](./0032-native-modal-system.md) | 原生對話框系統 (HTML5 <dialog>) | Accepted |
| [0033](./0033-native-charts-canvas.md) | 高效能原生 Canvas 圖表實作 | Accepted |
| [0034](./0034-offline-sync.md) | 離線動作排隊與自動同步機制 | Accepted |
| [0035](./0035-native-auth-system.md) | 身分驗證系統與路由守衛 (Auth Guard) | Accepted |
| [0036](./0036-undo-redo-history.md) | 操作歷史管理 (Undo/Redo History Stack) | Accepted |
| [0037](./0037-virtual-list.md) | 原生虛擬列表組件 (Virtual List) | Accepted |
| [0038](./0038-image-processing.md) | 原生影像處理服務 (Canvas Image Filters) | Accepted |
| [0039](./0039-native-speech-service.md) | 原生語音服務 (Web Speech API) | Accepted |
| [0040](./0040-native-slots-system.md) | 原生組件組合與插槽模擬 (Slots) | Accepted |
| [0041](./0041-native-playground.md) | 原生程式碼遊樂場 (Live Playground) | Accepted |
| [0042](./0042-native-storage-management.md) | 原生儲存配額監控與持久化 (StorageManager) | Accepted |
