# Plain Vanilla Web App Template

這是一個遵循 **[Plain Vanilla Web](https://plainvanillaweb.com/)** 核心理念所開發的現代原生網頁應用範本。本專案完全不使用前端框架（如 React, Vue, Angular）或複雜的建置工具（如 Webpack, Vite），回歸瀏覽器最本質的效能與開發體驗。

## 核心特色

- **零相依性 (Zero Dependencies)**：不需要 `npm install`，直接在瀏覽器運行。
- **原生組件化 (Native Web Components)**：利用 `Custom Elements` 實現組件封裝與重用。
- **輕量化路由 (Hash-based Routing)**：內建原生實作的 `<x-route>` 組件，支援 SPA 單頁應用導覽。
- **安全性 (XSS Protection)**：整合 `lib/html.js` 標籤模板，自動執行 HTML 轉義。
- **Git 版本管理**：整合至 TeleNexus 專案管理體系。

## 專案目錄結構

```text
.
├── app/
│   └── App.js          # 應用程式主組件與導覽邏輯
├── components/
│   └── route/
│       └── route.js    # 原生 Hash 路由組件實作
├── lib/
│   └── html.js         # 安全 HTML 標籤模板與轉義工具
├── index.html          # 應用入口檔案
├── index.js            # 啟動腳本與組件註冊
└── README.md           # 專案說明文件
```

## 快速啟動

由於專案採用純原生技術，您不需要任何建置步驟：

1. **直接開啟**：在瀏覽器中直接打開 `index.html` 即可運行。
2. **靜態伺服器 (推薦)**：若需使用 `import.meta` 等進階特性，建議使用簡易伺服器：
   ```bash
   npx serve .
   ```

## 開發指南

### 建立新組件
在 `components/` 目錄下建立新的 JS 檔案，繼承 `HTMLElement` 並使用 `customElements.define` 註冊。

### 安全渲染
請務必從 `lib/html.js` 引入 `html` 標籤模板來處理用戶輸入，以防範 XSS 攻擊：
```javascript
import { html } from '../lib/html.js';
this.innerHTML = html`<div>Hello, ${userName}</div>`;
```

## 教學指南 (Documentation)
- [原生狀態管理實作](./docs/state-management.md)
- [非同步 API 請求範例](./docs/api-fetching.md)
- [原生路由系統實作](./docs/router.md)

## 授權
MIT License
