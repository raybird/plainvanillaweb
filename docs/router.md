# 原生路由系統 (Router & SEO)

本專案實作了一個基於 Hash 的 SPA 路由系統，並解決了常見的 SEO 與 404 問題。

## 核心組件

### 1. 路由服務 (Router Service)
`lib/router.js` 負責監聽 `hashchange` 事件並發出 `route-change`。`currentPath` 由 `location.hash` 即時取得，比對時使用去除 query string 的 `currentRoutePath`。它是單一真實來源 (Single Source of Truth)。

路徑比對集中在同一檔的 `matchRoute(pattern, path, { exact })`，`<x-route>` 與 `<x-switch>` 都呼叫它（`router.match(pattern, options)` 會帶入目前路徑）：

| 樣式 | 意義 | 例子 |
|------|------|------|
| `*` | 符合所有路徑 | 404 頁面 |
| `:name` | 符合一個路徑段，值放進參數物件 | `/docs/:id` 符合 `/docs/router`，參數為 `{ id: 'router' }` |
| 結尾 `/*` | 符合該前綴本身與其底下的任何路徑 | `/lab/*` 符合 `/lab`、`/lab/x/y` |
| 加上 `exact` | 必須完全相符 | `/lab` exact 不符合 `/lab/` |
| 不加 `exact` | 以路徑段為界做前綴比對 | `/docs` 符合 `/docs/router`，不符合 `/docsx` |

比對不分大小寫，路徑中的 `.`、`+` 等字元照字面比對。`URLPattern` 目前（2026-11）仍屬 Baseline「新近可用」，為了不維護兩套比對邏輯暫不採用；成為廣泛可用後可直接替換 `matchRoute` 的實作。

### 2. 宣告式組件 (Declarative Components)
*   **`<x-route>`**: 定義路由規則。
    *   `path`: 匹配路徑，語法見上表。符合後可由 `route.params` 取得路徑參數。
    *   `exact`: 是否完全匹配。
    *   `meta-title` / `meta-desc`: 定義該頁面的 SEO 資訊 (支援 i18n key)。
    *   `auth-required`: 由 `<x-switch>` 在啟用前呼叫 `router.authGuard(route)`，回傳 `false` 時導向 `router.loginPath`（預設 `/login`）；單獨使用、不在 `<x-switch>` 內的 `<x-route>` 不會檢查。守衛預設一律放行；透過 `lib/vanilla-sdk.js` 載入時會自動設為 `() => authService.isAuthenticated`，直接使用 `lib/core.js` 時請在啟動時自行設定，例如 `router.authGuard = () => authService.isAuthenticated`（見 `index.js`）。
    *   `module`: 進入時才 `import()` 的頁面模組（相對於 `document.baseURI`）。
*   **`<x-switch>`**: 互斥渲染容器。確保同一時間只顯示**第一個**匹配的子路由 (類似 React Router `<Switch>`)。只管理屬於自己的 `<x-route>`，巢狀 `<x-switch>` 裡的路由由內層自己決定。

```html
<x-switch data-persistent="routes">
    <x-route path="/" exact meta-title="app.home"><template><page-home></page-home></template></x-route>
    <x-route path="/about" module="./pages/About.js" meta-title="app.about"><template><page-about></page-about></template></x-route>
    <!-- 404 頁面 -->
    <x-route path="*"><template><h1>Page Not Found</h1></template></x-route>
</x-switch>
```

### 3. 頁面生命週期（[ADR 0102](./decisions/0102-route-owned-page-lifecycle.md)）
`<x-route>` 的內容包在 `<template>` 裡時：

*   **進入**：路由啟用時才建立內容，頁面是新的實例並收到 `connectedCallback`。
*   **離開**：路由停用時移除內容，頁面收到 `disconnectedCallback`，在這裡釋放相機、計時器與訂閱。
*   **停在同一個路由**：網址在路由範圍內改變（例如 `/docs/a` → `/docs/b`、query 改變）時頁面**不會**重建。依網址顯示內容的頁面要自己監聽：

```javascript
connectedCallback() {
    super.connectedCallback();
    this._offRoute = router.on('route-change', () => this.syncWithUrl());
    this.syncWithUrl();
}
disconnectedCallback() {
    super.disconnectedCallback();
    this._offRoute?.();
}
```

不寫 `<template>`、直接把頁面放在 `<x-route>` 裡的舊寫法仍然可用：頁面一直留在 DOM 中，停用時只隱藏，收不到 `disconnectedCallback`。

**父元件重繪時保留路由**：`<x-switch>` 是自訂元素，放在 `BaseComponent` 的 `render()` 裡時，父元件每次重繪都會重建它與底下所有頁面（[ADR 0100](./decisions/0100-dom-morphing-updates.md)）。加上 `data-persistent="<id>"`，重繪時就會原樣保留同一個節點。

**守衛條件改變時**：網址沒變、但登入狀態等守衛條件改變時呼叫 `router.refresh()`，`<x-switch>` 會重新比對並執行守衛。本站與 `lib/vanilla-sdk.js` 在 `authService` 的 `auth-change` 時呼叫它，停在受保護頁面時登出會被導向登入頁。

## SEO 與 Meta 管理
`<x-route>` 啟用時讀取 `meta-title` / `meta-desc`，呼叫 `metaService.update()`；`lib/meta-service.js` 以 `i18n.t()` 翻譯後更新 `document.title` 與 `<meta name="description">`，語系切換時也會自動重新套用。

## 靜態主機相容性 (GitHub Pages 404 Hack)
由於 GitHub Pages 不支援 SPA 的 History API Rewrite，我們採用了 **404 Redirect Hack**：
1.  **`404.html`**: 當伺服器找不到路徑 (如 `/about`) 時，回傳此頁。
2.  **自動轉導**: 腳本將路徑轉換為 Hash 格式 (`/#/about`) 並重導回 `index.html`。
3.  **路由還原**: SPA 啟動後，Router 接手處理 Hash 路徑，使用者無縫看到正確內容。
