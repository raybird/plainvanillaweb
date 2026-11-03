# ADR 0101: 新增只含核心的入口 lib/core.js

## 狀態
已接受 (Accepted)，2026-11-03。

## 背景
本專案同時是兩件事：一套約 1,000 行、可直接複製或 import 的基礎建設（`html` 安全模板、`BaseComponent` 與 DOM morphing、`BaseService`、`Store`、hash 路由），以及一個展示站（39 個 Lab、45 個前沿 Web API service、執行期解析的文件）。

對外唯一的入口 `lib/vanilla-sdk.js` 會一次載入全部 45 個 service。只想用核心的人無從得知哪些檔案是核心，`import` 一次就連帶下載 WebGPU、WebRTC、WebAuthn 等展示程式；核心檔案之間也沒有邊界保護，`<x-switch>` 甚至直接依賴展示用的 `auth-service`。

## 決策
1. 新增 `lib/core.js`，只匯出核心：`html`／`unsafe`／`escapeHTML`、`BaseComponent`、`morph`、`BaseService`、`Store`／`appStore`、`broadcastService`、`i18n`、`metaService`、`router`／`matchRoute`、`<x-route>`／`<x-switch>`。
2. `lib/vanilla-sdk.js` 維持不變，作為「全部帶走」的入口，既有程式不需修改。
3. `<x-switch>` 不再 import `auth-service`。`RouterService` 新增 `authGuard`（預設放行）與 `loginPath`，由應用程式在啟動時注入：`index.js` 設定 `router.authGuard = () => authService.isAuthenticated`。
4. `tests/core.test.js` 以靜態 import 走訪 `lib/core.js` 的相依圖，與允許清單比對；核心意外引入展示用 service 時測試失敗。`tests/browser.html` 另以 `core.js` 單獨組出路由，驗證守衛的導向行為。

## 考慮過的替代方案
- **把核心搬到獨立的 `core/` 目錄**：邊界最清楚，但全站約 60 個檔案的 import 路徑都要改，對既有的外部引用（GitHub Pages 上的 `lib/*.js` 網址）也是破壞性變更。
- **拆成兩個 repo**：核心單獨發版、展示站引用核心。切分最乾淨，但要多維護一個 repo 與版本同步，對目前的規模不划算。

## 影響
- 核心有了明確、受測試保護的邊界；新增核心模組時要同步更新 `tests/core.test.js` 的允許清單。
- `auth-required` 路由的登入判斷改由應用程式注入；沒有設定 `router.authGuard` 時一律放行。
- 檔案位置不變，既有的 `vanilla-sdk.js` 與各檔案網址照常可用。
