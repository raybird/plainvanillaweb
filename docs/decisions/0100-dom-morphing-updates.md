# ADR 0100: BaseComponent 重繪改為 DOM 就地更新（morphing）

## 狀態
已接受 (Accepted)，2026-11-03。

## 背景
`BaseComponent.update()` 每次都以 `innerHTML` 整塊重繪，再靠三個補救措施降低副作用：重繪前記下焦點元素的 `id` 與游標位置、以 `data-persistent` 搬移需要保留的節點、首次渲染前備份子節點模擬插槽。仍有下列問題：

1. **監聽器遺失**：`afterFirstRender()` 綁在子元素上的監聽器在第一次重繪後就消失。`Profile`、`RepoSearch`、`Login`、`WorkerDemo` 都是這種寫法，表單送出等功能只在第一次渲染前有效；`App` 則改在每次 `update()` 重新綁定。
2. **介面狀態重置**：沒有 `id` 的輸入框失去焦點，內層捲動容器的捲動位置、CSS 動畫、`<img>` 都會重來。
3. **效能**：每次狀態變更都重建整個元件的 DOM。

## 考慮過的做法
- **模板插值追蹤（類似 lit-html）**：讓 `html` 回傳模板與插值位置，只更新變動的插值。最有效率，但 63 個 `render()` 大量以字串拼接、`unsafe()` 與陣列組合內容，必須逐一改寫，且回傳純字串的元件無法支援。
- **DOM morphing（採用）**：`render()` 介面不變，仍回傳 HTML 字串；把新 HTML 解析進 `<template>`，再與現有 DOM 逐節點比對，只修改不同的屬性、文字與節點。所有元件不需修改即可受益。

## 決策
新增 `lib/morph.js`，`BaseComponent.update()` 在首次渲染後改用它更新：

1. **一般元素就地更新**：同位置、同標籤的元素保留節點本身，只同步屬性並遞迴比對子節點；帶 `id` 的元素優先依 `id` 配對，順序改變時搬移而不重建。
2. **子元件（自訂元素）一律重建**：與舊行為相同，父元件重繪時子元件會經過 `disconnectedCallback`／`connectedCallback`。這保留了既有的生命週期假設，例如離開頁面時釋放相機、`Docs` 依網址重新載入文件。
3. **表單控制項**：`value`、`checked`、`selected` 以新 HTML 為準同步（與重建後的結果相同），值相同時不寫入，避免游標跳動。
4. **`data-persistent`**：舊節點與新 HTML 的 `data-persistent-placeholder` 同 id 時直接保留；位置改變時仍沿用原本的搬移機制。
5. **Lucide 圖示**：產生的 `<svg>` 記住來源 `<i data-lucide>` 的 HTML，並把屬性改名為 `data-lucide-icon`，避免每次更新被 Lucide 重新產生；來源相同時保留，不同時重建。
6. **逃生口**：元件可設定 `static morphUpdates = false` 改回整塊重繪。
7. **`App` 改用事件委派**：監聽器在 `afterFirstRender()` 綁一次在元件本身，不再於每次 `update()` 重綁（節點保留後重綁會讓同一事件觸發多次）。

## 後果
- **優點**：`afterFirstRender()` 綁的監聽器在重繪後仍有效；焦點、捲動位置、動畫與圖片不再因重繪重置；DOM 變動量大幅減少。元件程式碼不需修改。
- **缺點**：多一層比對邏輯（`lib/morph.js`）需要維護；在 `update()` 中以匿名函式重複 `addEventListener` 的寫法會累積監聽器，新元件應改用 `afterFirstRender()` 或事件委派。
- **驗證**：`tests/browser.html` 新增 morphing 行為測試；`tests/browser-runner.mjs` 的冒煙測試涵蓋全站路由與文件，並檢查文件頁實際載入的文件。
