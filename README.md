# 🍦 Plain Vanilla Web App Template

> **[📍 檢視 2026 演進路線圖 (Roadmap)](./ROADMAP.md)**

這是一個遵循 **[Plain Vanilla Web](https://plainvanillaweb.com/)** 精神所構建的現代原生網頁應用範本。
我們拒絕過度封裝，擁抱瀏覽器原生能力，旨在提供一個高效、安全且具備高度教育意義的開發起點。

---

## 📚 文件導覽地圖 (Documentation Map)

### 核心架構 (Architecture)
- [**原生路由系統 (Router & SEO)**](./docs/router.md) - SPA 路由、Meta 管理與 404 修復。
- [**狀態管理與持久化 (Store & IDB)**](./docs/state-management.md) - Proxy Store、LocalStorage 與 IndexedDB 整合。
- [**國際化系統 (i18n)**](./docs/i18n.md) - 原生輕量級多語言支援。
- [**漸進式網頁應用 (PWA)**](./docs/pwa.md) - Service Worker 與離線體驗。

### 開發指南 (Guides)
- [**非同步資料處理 (API Fetching)**](./docs/api-fetching.md) - Web Components 與 API 串接。
- [**部署指南 (Deployment)**](./docs/deployment.md) - GitHub Pages 部署與路由配置。
- [**架構決策紀錄 (ADR)**](./docs/decisions/README.md) - 追蹤專案的所有技術決策。

---

## 🚀 核心特色

- **零相依性 (Zero Dependencies)**：純原生，無需 `npm install`。
- **完整生態系範例**：
    - **PWA Ready**: 支援安裝至桌面、離線啟動 (Service Worker)。
    - **i18n**: 原生 JSON 多語言切換。
    - **SEO & A11y**: 動態 Meta 標籤與無障礙導航。
    - **Advanced Theming**: 系統深色模式跟隨與動態換色。
    - **High Performance**: Web Workers 多線程運算與 IndexedDB 大容量快取。
- **Service 導向架構**: 邏輯與 UI 分離 (Router, Store, I18n, Theme, Meta, Worker Services)。

---

## 📂 專案目錄結構

```text
.
├── app/                # 應用程式進入點 (App.js)
├── assets/             # 靜態資源 (images, locales)
├── components/         # UI 組件庫
│   ├── pages/          # 頁面級組件 (Home, Profile, Dashboard...)
│   └── route/          # 路由組件 (x-route, x-switch)
├── docs/               # 💡 技術說明文件
├── lib/                # 核心服務層 (Services)
│   ├── base-*.js       # 基礎類別 (Component, Service)
│   ├── store.js        # 全域狀態 (LocalStorage)
│   ├── idb-service.js  # 大容量快取 (IndexedDB)
│   ├── i18n-service.js # 國際化服務
│   ├── theme-service.js# 主題管理
│   ├── meta-service.js # SEO 管理
│   └── worker-service.js # 多線程運算
├── workers/            # Web Worker 腳本
├── index.html          # HTML 入口
├── manifest.json       # PWA 配置
├── sw.js               # Service Worker
└── scripts/            # 自動化維護腳本
```

## 🤖 維護工具 (For AI & Human)
- `scripts/sync.sh`: 自動執行測試、提交代碼並清理系統資源。

## 🛠 快速啟動

由於專案採用 ES Modules 與 Service Worker，必須使用 HTTP 伺服器運行：

```bash
# 使用 Python (內建)
python3 -m http.server

# 或使用 npx
npx serve .
```

---

## 授權
MIT License
