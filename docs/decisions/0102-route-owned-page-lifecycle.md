# ADR 0102: 頁面的進入與離開由 `<x-route>` 管理

## 狀態
已接受 (Accepted)，2026-11-04。

## 背景
`<x-route>` 停用時只把自己設成 `display: none`，頁面元素一直留在 DOM 中，永遠收不到 `disconnectedCallback`。頁面之所以會在換頁時「離開」與「重新進入」，其實是 `App` 監聽 `hashchange` 後重繪：依 [ADR 0100](./0100-dom-morphing-updates.md)，morph 時自訂元素一律重建，`<x-switch>` 與底下所有頁面因此每次換頁都被重建。這個隱含的生命週期帶來下列問題：

1. **每次換頁都重建所有頁面**：包括看不到的頁面，它們的 `connectedCallback` 也都會跑一次；應用啟動時所有頁面都會先建立一次。
2. **頁面狀態無法保留**：`App` 因主題、語系、選單開關或登入狀態重繪時，目前的頁面也被重建，使用者輸入與頁面內狀態消失。
3. **重複建立**：巢狀路由（`/lab/*`）的外層頁面被重建後，內層子頁面又被建立一次（3.0.0 修正前從其他頁切入實驗室子頁時建立 3 次）。
4. **依賴關係不透明**：「離開頁面時釋放相機」「文件頁依網址重新載入」都靠 `App` 重繪這個副作用成立，改動 `App` 或 morph 規則就會悄悄失效。

## 考慮過的做法
- **`<x-route>` 發出進入／離開事件，頁面自行訂閱**：頁面不用重建，但所有依賴 `connectedCallback`／`disconnectedCallback` 的頁面（23 個）都要改寫，新頁面也得記得訂閱。
- **停用時把頁面移出 DOM、啟用時放回同一個實例**：生命週期回呼照常觸發，但同一個實例會反覆 connect，頁面若在 `connectedCallback` 啟動資源（訂閱、計時器）就會重複，且 `BaseComponent` 不會再渲染第一次。
- **`<x-route>` 以 `<template>` 保存內容，啟用時建立、停用時移除（採用）**：頁面每次進入都是新實例、離開時收到 `disconnectedCallback`，與 3.0.0 以前從頁面看到的生命週期相同，頁面程式碼不需修改；只有在同一個路由內換網址的頁面需要自行監聽 `route-change`。

## 決策
1. **`<x-route>` 的 `<template>` 寫法**：`<x-route path="/a"><template><page-a></page-a></template></x-route>`。內容只在路由啟用時以 `document.importNode` 建立，停用時移除；已啟用時重複啟用（`<x-switch>` 每次比對都會重設 `active`）不會重建。延遲模組已載入時同步建立內容，讓頁面在 View Transition 的更新回呼內出現；等待模組載入期間路由被停用時不建立。沒有 `<template>` 的舊寫法維持原行為（內容常駐、停用時隱藏），既有使用者不受影響。
2. **`<x-switch>` 只管理自己的路由**：只比對 `closest('x-switch') === this` 的 `<x-route>`，不再停用巢狀 `<x-switch>` 內的路由。
3. **`data-persistent` 可直接標在 `render()` 輸出的元素上**：新舊 HTML 中同 id 的 `data-persistent` 元素視為同一個節點原樣保留（morph 與 `morphUpdates = false` 的整塊重繪皆然）。`App` 與 `Lab` 以 `<x-switch data-persistent="…">` 讓重繪不再重建路由與頁面。
4. **morph 不搬動已在正確位置的保留節點**：比對與擺放分成兩輪，擺放時略過即將移除的舊節點。原本前面的兄弟是重建的自訂元素時，後面被保留的節點會被 `insertBefore` 搬動，整棵子樹斷開再接上，裡面的元件都重跑 `disconnectedCallback`／`connectedCallback`。
5. **`router.refresh()`**：網址沒變、但守衛的判斷條件改變時呼叫，讓 `<x-switch>` 重新比對。`index.js` 與 `vanilla-sdk.js` 在 `authService` 的 `auth-change` 時呼叫它，停在受保護頁面時登出會導向登入頁（原本靠 `App` 重繪重建 `<x-switch>` 間接達成）。
6. **頁面自行訂閱會改變畫面的來源**：同一路由內換網址時，`Docs`（`/docs/a` → `/docs/b`）、`Lab` 標頭顯示的路徑、`WebSharePage` 的分享參數改為監聽 `route-change`；`Profile` 的主題選單改為訂閱 `appStore` 的 `theme`／`primaryColor` 變更（原本靠側欄切換主題時 `App` 重繪重建頁面才更新）。
7. **實驗室子頁改為各自的 `module` 屬性延遲載入**：子頁面不再常駐 DOM，`<page-lab>` 不必一次預載 39 個模組。

## 後果
- **優點**：換頁只建立進入的頁面、移除離開的頁面，看不到的頁面不再存在於 DOM；`App` 重繪（主題、語系、選單、登入狀態）不影響目前的頁面與其狀態；頁面生命週期由路由明確決定，不再依賴 `App` 重繪的副作用；實驗室子頁按需載入。
- **缺點**：在同一個路由內換網址時頁面不再重建，依網址顯示內容的頁面要自行監聽 `route-change`；`<template>` 寫法與舊寫法並存，路由宣告多一層標記。
- **相容性**：新增功能、舊寫法行為不變，屬次版本變更。morph 的擺放順序調整只減少不必要的節點搬動，不改變結果。
- **驗證**：`tests/browser.html` 新增 `<template>` 內容的建立／移除／不重建與 `router.refresh()` 守衛、巢狀 `<x-switch>`、`data-persistent` 元素保留（兩種重繪模式）、morph 不搬動保留節點的測試；`tests/browser-runner.mjs` 新增 `App` 重繪保留頁面實例與狀態、`/lab/*` 間換頁保留 `<page-lab>` 並移除前一個子頁、停在 `/profile` 時登出導向 `/login`、從側欄切換主題後 `Profile` 的主題選單同步的互動測試。
