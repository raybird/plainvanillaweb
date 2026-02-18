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
- [**儲存管理與持久化**](./docs/storage-persistence.md) - StorageManager API 與配額監控。
- [**原生測試策略**](./docs/testing-strategy.md) - 零依賴自動化單元測試指南。
- [**架構決策紀錄 (ADR)**](./docs/decisions/README.md) - 追蹤專案的所有技術決策。

---

## 🚀 核心特色

- **零相依性 (Zero Dependencies)**：純原生，無需 `npm install`。
- **進階交互範例**：
    - **Native Charts**: 利用 Canvas API 實作高效能數據視覺化。
    - **Image Processing**: 純前端圖片濾鏡與縮放。
    - **Speech Lab**: 整合 Web Speech API (TTS & STT)。
    - **Live Playground**: 利用 Blob & ObjectURL 實作即時程式碼編輯器。
- **高效能架構**：
    - **Virtual List**: 支持大數據量下的流暢渲染。
    - **Web Workers**: 多線程運算處理耗時任務。
    - **Lazy & Prefetch**: 模組動態載入與智能資源預載。
- **現代化組件化**：
    - **Advanced Slots**: 在不使用 Shadow DOM 下實現強大的內容分發。
    - **Reactive State**: 基於 Proxy 的反應式組件局部狀態。

---

## 📂 專案目錄結構

```text
.
├── app/                # 應用程式進入點 (App.js)
├── assets/             # 靜態資源 (images, locales)
├── components/         # UI 組件庫 (ui/, pages/, route/)
├── docs/               # 💡 技術說明文件
├── lib/                # 核心服務層 (Services)
│   ├── base-*.js       # 基礎類別 (Component, Service)
│   ├── store.js        # 全域狀態
│   ├── idb-service.js  # IndexedDB 管理
│   └── ...             # 其他功能服務 (Speech, Image, Storage...)
├── workers/            # Web Worker 腳本
├── index.html          # HTML 入口
├── manifest.json       # PWA 配置
├── sw.js               # Service Worker
└── scripts/            # 自動化維護腳本 (sync.sh, scaffolding...)
```

## 🤖 維護工具 (For AI & Human)
- `scripts/sync.sh`: 自動執行測試、稽核代碼、提交變更並清理系統資源。

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
