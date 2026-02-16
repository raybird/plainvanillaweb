# 🍦 Plain Vanilla Web App Template

這是一個遵循 **[Plain Vanilla Web](https://plainvanillaweb.com/)** 精神所構建的現代原生網頁應用範本。
我們拒絕過度封裝，擁抱瀏覽器原生能力，旨在提供一個高效、安全且具備高度教育意義的開發起點。

---

## 📚 文件導覽地圖 (Documentation Map)

為了方便開發者快速掌握架構，我們建立了詳盡的技術文件：

### 核心架構 (Architecture)
- [**原生路由系統 (Router Service)**](./docs/router.md) - 解析如何實作無框架的 SPA 路由與程式化導航。
- [**狀態管理機制 (State Management)**](./docs/state-management.md) - 利用 Proxy 與 EventTarget 實作輕量級數據流。
- [**非同步資料處理 (API Fetching)**](./docs/api-fetching.md) - 關於 Web Components 串接外部 API 的最佳實踐。

### 組件與邏輯 (Implementation)
- [**安全模板工具 (lib/html.js)**](#安全性-xss-protection) - 如何在不使用 JSX 的情況下安全渲染 HTML。
- [**專案目錄結構說明**](#專案目錄結構) - 深入了解每一個目錄的職責。

---

## 🚀 核心特色

- **零相依性 (Zero Dependencies)**：純原生，無需 `npm install`。
- **Service 導向架構**：將路由與狀態邏輯抽象為 Service，實現組件解耦。
- **原生組件化**：利用 Custom Elements 與模組化 JS 構建 UI。
- **安全性 (XSS Protection)**：內建 HTML 轉義機制，防範常見網路攻擊。

---

## 📂 專案目錄結構

```text
.
├── app/                # 應用程式進入點 (如 App.js)
├── components/         # UI 組件庫
│   ├── pages/          # 頁面級組件 (如 HomePage, RepoSearch)
│   └── route/          # 路由核心組件 (x-route)
├── docs/               # 💡 技術說明文件與開發指南
├── lib/                # 核心服務層 (Services)
│   ├── html.js         # 安全轉義工具
│   ├── router.js       # 路由服務
│   └── store.js        # 全域狀態服務
├── index.html          # HTML 入口
├── index.js            # JS 引導程序
└── README.md           # 專案主導覽
```

## 🛠 快速啟動

由於專案採用純原生技術，建議使用簡易伺服器運行以支援 ESM 模組：

```bash
npx serve .
```

---

## 授權
MIT License
