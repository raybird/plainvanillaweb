# ADR 0029: 路由驅動的組件動態載入與預載 (Route-based Dynamic Loading & Prefetching)

## 上下文
隨著應用功能增加，靜態載入所有頁面組件會導致初始網絡負載增加及首屏加載時間變長。為了優化性能並展示更進階的原生 Web 開發模式，我們需要一套按需載入組件的機制。

## 決策
1.  **動態載入 (Lazy Loading)**:
    *   擴充 `x-route` 組件，支援 `module` 屬性。
    *   當路由匹配時，利用 `import()` 語法動態載入對應的 JS 模組。
    *   移除 `index.js` 中對頁面組件的靜態匯入。
2.  **預載服務 (PrefetchService)**:
    *   實作 `lib/prefetch-service.js`，利用 `<link rel="modulepreload">` 提前加載模組。
    *   在 `App.js` 中監聽導航連結的 `mouseover` 事件，當使用者有意圖導航時即時觸發預載。

## 後果
- **優點**: 顯著減少初次進入應用的資源體積，縮短 TTI (Time to Interactive)。
- **優點**: 利用 `mouseover` 預載抵消了網路延遲，實現「點擊即顯示」的極速體驗。
- **優點**: 充分發揮了瀏覽器原生支援 ES Modules 的優勢。
- **缺點**: 組件路徑需要硬編碼在路由屬性中，且需確保模組內含組件註冊邏輯。
