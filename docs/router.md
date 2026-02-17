# 原生路由系統 (Router & SEO)

本專案實作了一個基於 Hash 的 SPA 路由系統，並解決了常見的 SEO 與 404 問題。

## 核心組件

### 1. 路由服務 (Router Service)
`lib/router.js` 負責監聽 `hashchange` 事件，並維護 `currentPath` 狀態。它是單一真實來源 (Single Source of Truth)。

### 2. 宣告式組件 (Declarative Components)
*   **`<x-route>`**: 定義路由規則。
    *   `path`: 匹配路徑 (支援萬用字元 `*` 與簡單正則)。
    *   `exact`: 是否完全匹配。
    *   `meta-title` / `meta-desc`: 定義該頁面的 SEO 資訊 (支援 i18n key)。
*   **`<x-switch>`**: 互斥渲染容器。確保同一時間只顯示**第一個**匹配的子路由 (類似 React Router `<Switch>`)。

```html
<x-switch>
    <x-route path="/" exact meta-title="app.home">...</x-route>
    <x-route path="/about" meta-title="app.about">...</x-route>
    <!-- 404 頁面 -->
    <x-route path="*"><h1>Page Not Found</h1></x-route>
</x-switch>
```

## SEO 與 Meta 管理
`lib/meta-service.js` 負責在路由切換時，動態更新 `document.title` 與 `<meta name="description">`。它會自動從 `x-route` 讀取屬性，並透過 `I18nService` 進行多語言翻譯。

## 靜態主機相容性 (GitHub Pages 404 Hack)
由於 GitHub Pages 不支援 SPA 的 History API Rewrite，我們採用了 **404 Redirect Hack**：
1.  **`404.html`**: 當伺服器找不到路徑 (如 `/about`) 時，回傳此頁。
2.  **自動轉導**: 腳本將路徑轉換為 Hash 格式 (`/#/about`) 並重導回 `index.html`。
3.  **路由還原**: SPA 啟動後，Router 接手處理 Hash 路徑，使用者無縫看到正確內容。
