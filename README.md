# 🍦 Plain Vanilla Web App Template

> **[📍 檢視 2026 演進路線圖 (Roadmap)](./ROADMAP.md)**

這是一個遵循 **[Plain Vanilla Web](https://plainvanillaweb.com/)** 精神所構建的現代原生網頁應用範本。
我們拒絕過度封裝，擁抱瀏覽器原生能力，旨在提供一個高效、安全且具備高度教育意義的開發起點。

> **💡 發想靈感源自 [jsebrech/plainvanilla](https://github.com/jsebrech/plainvanilla)。**

---

## 🍦 專案精神 (The Vanilla Way)

> 💡 **了解我們為何堅持「標準優於框架、零建置成本、安全且透明」的哲學：** <br>
> 閱讀 **[Vanilla Manifesto (原生網頁開發宣言)](./docs/MANIFESTO.md)**

---

## 📚 文件與模組導覽地圖 (Navigation Map)

我們依據功能性質，將專案的模組與文件劃分為以下四大類，與網頁介面的側邊欄導覽 (`Navbar`) 完全對齊：

### 1. 導覽與核心 (Overview)
- **總覽**：本 `README.md` 所處的專案首頁。
- **宣言**：[Vanilla Manifesto](./docs/MANIFESTO.md) 專案精神與哲學。

### 2. 學習與實作 (Learning & Lab)
- **📚 技術手冊 (Docs)**：包含豐富的 Markdown 教學文件，涵蓋：
    - [這不是框架！組件開發指南](./docs/component-architecture.md)
    - [SafeHTML：防護 XSS 的安全渲染機制](./docs/safe-html-rendering.md)
    - [基礎核心：路由、狀態管理、PWA、i18n 等子系統指南](./docs/)
- **🧪 互動式實驗室 (Lab)**：直接在瀏覽器執行並體驗 WebGPU、WebRTC、Web Bluetooth、FaceID 等數十多種前沿原生 API。
- **🎡 Vanilla 遊樂場 (Playground)**：內建的所見即所得線上程式碼編輯器。

### 3. 監控與開發工具 (Developer Tools)
- **📊 開發者儀表板 (Dashboard)**：即時監控 IndexedDB 資料、Network 請求與 Store 全域狀態流向。
- **📈 效能分析中心 (Analytics)**：利用原生 Canvas API 視覺化監測 Web Vitals (LCP/CLS) 指標。
- **⚡ Web Worker 展示 (Worker Demo)**：展示耗時運算與主執行緒分離的優化實作。
- **🔍 開源碼搜尋 (Repo Search)**：串接 GitHub API 的高互動性搜尋介面。

### 4. 使用者 (Account)
- **👤 個人檔案 (Profile)**：展示基於 LocalStorage/IndexedDB 結合身份驗證 (Auth Guard) 的會員登入機制。

---

## 🚀 核心特色

- **前沿 Web 技術整合 (Cutting Edge)**：
    - **WebGPU & WASM**: 高效能並行運算與 C/Rust 編譯模組整合。
    - **WebRTC (P2P)**：無伺服器去中心化數據傳輸與影音通訊。
    - **Native Speech**: 整合原生 TTS (語音合成) 與 STT (語音辨識)。
    - **Hardware Access**: 原生 Web Bluetooth 藍牙通訊與螢幕錄製。
- **電商與支付 (E-commerce Ready)**：
    - **Payment Request**: 標準化的瀏覽器原生支付介面，提升轉換率。
- **進階交互實踐**：
    - **Native Charts**: 利用 Canvas API 實作零依萊的高效能數據視覺化。
    - **Image Processing**: 純前端圖片濾鏡 (Grayscale) 與縮放處理。
    - **Vanilla SDK 模式**: 核心服務解耦，支援由外部 URL 直接引用的 CDN 開發模式。
- **專業級韌性架構**：
    - **安全的預設值 (SafeHTML)**: 實作內建 XSS 防禦的標籤模板渲染機制，將安全視為一等公民。
    - **Offline Action Queue**: 斷網時操作自動排隊，恢復連線後自動同步。
    - **Undo/Redo History**: 實作狀態快照機制的撤銷與重做功能。
    - **Virtual List**: 支援萬筆數據的高流暢度虛擬捲動。
    - **Storage Persistence**: 主動申請數據持久化，防止系統清理。
- **高性能與開發體驗優化 (Performance & DX)**：
    - **現代化文件 UI 佈局**: 具備 Tree-view 導覽、毛玻璃質感與強化的閱讀字體學體驗。
    - **Lazy & Prefetch**: 路由驅動的模組動態載入與智能資源預載。
    - **Web Workers**: 邏輯計算與主執行緒解耦，保持介面反應。
    - **Responsive First**: 全面優化手機版面佈局與 Header 響應式體驗。
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
