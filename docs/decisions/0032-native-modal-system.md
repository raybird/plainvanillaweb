# ADR 0032: 原生對話框系統 (Native Modal/Dialog System)

## 上下文
應用程式需要一種標準化且符合無障礙 (A11y) 標準的方式來顯示對話框、確認框與警告。雖然可以使用自訂的 `div` 模擬，但處理焦點鎖定 (Focus Trapping) 與背景遮罩通常非常複雜。

## 決策
實作基於 **`<dialog>`** 元素的對話框系統：
1.  **ModalService**: 負責管理全域對話框的開啟、關閉與數據傳遞。提供 Promise-based 的 `confirm` 與 `alert` 方法。
2.  **ModalContainer**: 一個全域 Custom Element (`<app-modal>`)，負責監聽 Service 事件並渲染具體的對話框 UI。
3.  **原生 API 優勢**: 使用 `showModal()` 自動獲得瀏覽器內建的背景遮罩 (Backdrop) 支援、Escape 鍵關閉支援、以及自動焦點管理。
4.  **樣式封裝**: 利用 `::backdrop` 偽元素輕鬆定義遮罩效果。

## 後果
- **優點**: 極致輕量且符合 Web 標準。
- **優點**: 自動獲得絕佳的無障礙支援，無需手動管理 Tab 鍵順序。
- **優點**: 教學價值高，展示了原生 `<dialog>` 的現代開發模式。
- **缺點**: 對於極舊的瀏覽器（不支援 `<dialog>`）可能需要 Polyfill，但在 2026 年的現代瀏覽器中這已不是問題。
