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

## 為什麼是 hash 路由，而不是一般路徑

本專案刻意使用 `#/lab` 形式的網址，而不是 `/lab`（History API 路由）。以下是 2026-11-04 評估時的考量，之後重新評估時可依此檢查前提是否改變。

**hash 路由換來的東西**

- **零設定部署**：`#` 後面的內容不會送到伺服器，任何靜態主機都只會收到 `index.html` 的請求。`python3 -m http.server`、`npx serve`、GitHub Pages 都不必設定改寫規則。
- **連結就是原生連結**：點擊 `<a href="#/lab">` 時瀏覽器本來就不會重新載入頁面，只會觸發 `hashchange`。router 不必攔截點擊，也不必處理 Ctrl+點擊、`target="_blank"`、下載連結等情況。

**付出的代價**

- 網址帶著 `#`，比較不好看。
- 伺服器與爬蟲看不到 `#` 後面的路徑，搜尋引擎索引與社群分享預覽只會看到首頁的內容。
- 直接開啟一般路徑（例如 `/plainvanillaweb/lab`）時，要靠 `404.html` 轉成 hash 網址（見上一節），伺服器回應的狀態碼仍是 404。

**為什麼目前不提供 History API 模式**

History API 本身是 Web 標準，使用它不違反零依賴與零建置。問題在於要讓一般路徑的連結不重新載入頁面，只有兩條路：

1. **router 攔截全站的連結點擊**，再自己呼叫 `history.pushState()`。這等於在 JS 裡重做瀏覽器的導覽行為，違反[開發宣言](./manifesto.md)的「最小抽象」。
2. **使用 Navigation API**（`navigation.addEventListener('navigate', (e) => e.intercept({ handler }))`），由瀏覽器負責攔截。它已在各主流瀏覽器提供，但還沒達到 Baseline「廣泛可用」，現在採用就得另寫一套攔截點擊的備援，等於維護兩套導覽邏輯。

此外，History API 模式要求伺服器把找不到的路徑都回傳 `index.html`，這是 JS 以外的部署設定，各主機寫法不同；GitHub Pages 無法設定，展示站本身也就用不上這個模式。兩種模式並存時，站內所有寫死 `#/...` 的連結也都要改由 router 產生。

**何時重新評估**

- Navigation API 達到 Baseline「廣泛可用」時：可以用它實作 History API 模式，不攔截點擊、也不寫備援，與 hash 模式並存，預設仍為 hash。
- 有實際需求時，例如需要讓搜尋引擎索引各頁內容，且部署環境能設定改寫規則。

**自行改用一般路徑時要注意**

- 伺服器要把所有找不到的路徑改寫為 `index.html`，同時保留真實檔案（`.js`、`.css`、`docs/*.md`）的正常回應。
- 本專案的模組與資源都以 `document.baseURI` 解析（`<base href="/plainvanillaweb/">`），深層網址下仍能正確載入；自行調整時要保留 `<base>`，或改用絕對路徑。
- `lib/router.js` 的 `currentPath`、`push()` 與 `hashchange` 監聽，以及站內的 `#/...` 連結與 `location.hash = ...` 都要一併改寫。
