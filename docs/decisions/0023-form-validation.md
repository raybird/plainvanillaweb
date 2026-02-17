# ADR 0023: 原生表單驗證引擎 (Native Form Validation Engine)

## 上下文
在構建現代 Web 應用時，穩健的表單驗證是提升使用者體驗 (UX) 與確保數據完整性的關鍵。許多開發者習慣引入第三方庫（如 Formik），但在 Vanilla 環境中，這會增加不必要的體積。

## 決策
實作 `ValidationService`，充分利用瀏覽器內建的 **Constraint Validation API**。
1.  **邏輯抽象**: 將驗證邏輯與 UI 分離，由 Service 統一處理錯誤訊息的管理。
2.  **即時回饋**: 利用 `input` 與 `blur` 事件觸發 Service 驗證，並透過事件驅動 (Event-driven) 方式更新組件狀態。
3.  **UI 整合**: 在 `BaseComponent` 中整合 Service，根據錯誤狀態動態調整樣式（如紅色邊框）與顯示錯誤文字。
4.  **標準相容**: 直接使用 HTML5 屬性（如 `required`, `minlength`, `pattern`）作為驗證規則來源，保持代碼簡潔且符合 Web 標準。

## 後果
- **優點**: 零依賴實作了強大的驗證功能，且對螢幕閱讀器友善（符合無障礙標準）。
- **優點**: 學習成本低，開發者只需使用標準 HTML 屬性即可自訂規則。
- **缺點**: 對於極其複雜的跨欄位聯動驗證，原生 API 仍需額外的手動邏輯介入。
