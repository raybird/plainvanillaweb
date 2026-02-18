# 🍦 Plain Vanilla Web App Template

> **[📍 檢視 2026 演進路線圖 (Roadmap)](./ROADMAP.md)**

這是一個遵循 **[Plain Vanilla Web](https://plainvanillaweb.com/)** 精神所構建的現代原生網頁應用範本。
我們拒絕過度封裝，擁抱瀏覽器原生能力，旨在提供一個高效、安全且具備高度教育意義的開發起點。

> **💡 發想靈感源自 [jsebrech/plainvanilla](https://github.com/jsebrech/plainvanilla)。**

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

## 🎮 互動式教學中心 (Interactive Hub)

本專案不僅是範例，更是一個互動式實驗室：
- **[Vanilla 遊樂場 (Playground)](#/playground)**：直接在瀏覽器撰寫原生代碼並即時預覽。
- **[語音實驗室 (Speech Lab)](#/lab)**：實驗 Web Speech API 的文字轉語音與辨識功能。
- **[性能分析中心 (Analytics)](#/analytics)**：利用 Canvas API 即時視覺化 Web Vitals 指標。
- **[開發者儀表板 (Dashboard)](#/dashboard)**：監控 IndexedDB、Network 請求與全域狀態。

---

## 🚀 核心特色

- **進階交互實踐**：
    - **Native Charts**: 利用 Canvas API 實作零依賴的高效能數據視覺化。
    - **Image Processing**: 純前端圖片濾鏡 (Grayscale) 與縮放處理。
    - **Speech Tech**: 整合原生 TTS (語音合成) 與 STT (語音辨識)。
- **專業級韌性架構**：
    - **Offline Action Queue**: 斷網時操作自動排隊，恢復連線後自動同步。
    - **Undo/Redo History**: 實作狀態快照機制的撤銷與重做功能。
    - **Virtual List**: 支援萬筆數據的高流暢度虛擬捲動。
    - **Storage Persistence**: 主動申請數據持久化，防止系統清理。
- **高性能與優化**：
    - **Lazy & Prefetch**: 路由驅動的模組動態載入與智能資源預載。
    - **Web Workers**: 邏輯計算與主執行緒解耦，保持介面反應。
    - **Reactive State 2.2**: 具備 Light DOM 插槽模擬機制的反應式組件。

---

## 📂 專案目錄結構

```text
.
├── app/                # 應用程式進入點 (App.js)
├── assets/             # 靜態資源 (images, locales)
├── components/         # UI 組件庫 (ui/, pages/, route/)
├── docs/               # 💡 技術說明文件 (Markdown)
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
