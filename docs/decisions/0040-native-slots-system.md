# ADR 0040: 原生組件組合與插槽模擬 (Native Component Composition & Slot Simulation)

## 上下文
在原生 Web Components 開發中，標準的內容分發機制 (Slots) 需要使用 Shadow DOM。然而，Shadow DOM 會隔離樣式，增加開發複雜度。若僅使用 `innerHTML` 進行更新，則會覆寫組件標籤內的原始子元素，導致無法建構容器型組件。

## 決策
在 `BaseComponent 2.2` 中實作「Light DOM 插槽模擬」：
1.  **內容擷取 (Capture)**: 在組件首次執行 `update()` 前，遍歷並儲存所有原始 `childNodes`。
2.  **分發邏輯 (Distribution)**:
    *   具有 `slot="name"` 屬性的元素被分類為命名插槽。
    *   其餘元素歸類為預設 (default) 插槽。
3.  **渲染輔助 ($slot)**: 提供 `$slot(name)` 方法，允許 `render()` 模板動態決定內容分發位置。
4.  **複用性**: 此機制不依賴 Shadow DOM，因此保持了全局 CSS 的可穿透性與 A11y 屬性的易讀性。

## 後果
- **優點**: 實作了類似 React/Vue 的容器組件模式，大幅提升組件複用性。
- **優點**: 避免了 Shadow DOM 帶來的樣式隔離困擾。
- **優點**: 保持了 HTML 的宣告式風格。
- **缺點**: 由於是模擬機制，當原始子元素動態改變時（非組件內部觸發），需要手動重新擷取內容（當前實作為一次性擷取，適合大多數靜態內容場景）。
