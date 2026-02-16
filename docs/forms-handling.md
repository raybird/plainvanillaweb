# 原生表單處理 (Form Handling)

在 Vanilla 環境中，我們回歸標準的 `FormData` 與 `Constraint Validation API`。

## 實作重點
- **FormData**: 輕鬆獲取所有輸入欄位的數值。
- **ValidityState**: 檢查欄位是否符合要求 (required, pattern 等)。
- **事件委派**: 在父容器監聽 `submit` 事件。
