# ADR 0019: 進階主題系統 (Advanced Theming System)

## 上下文
原本的主題系統僅支援 Light/Dark 硬切換，無法適應現代作業系統的「系統跟隨」偏好，也缺乏品牌色自訂的彈性。

## 決策
1.  **ThemeService**: 實作 `lib/theme-service.js`，負責：
    *   監聽 `prefers-color-scheme` 系統事件。
    *   管理 `theme` 狀態 (`system`, `light`, `dark`)。
    *   管理 `primaryColor` 自訂主色。
    *   動態計算最終應用的主題模式 (Effective Mode)，並設定 `data-theme` 與 CSS Variables。
2.  **Store 整合**: 主題設定持久化於 `appStore` (LocalStorage)，確保重新整理後設定不丟失。
3.  **UI 整合**:
    *   在 Profile 頁面提供完整的主題與顏色選擇器。
    *   導航列按鈕支援循環切換。

## 後果
- **優點**: 提供更現代化的使用者體驗 (系統跟隨)。
- **優點**: 展示了 CSS Variables 與 JavaScript 的強大整合能力 (動態換色)。
- **缺點**: 增加了樣式計算的複雜度，需確保所有顏色變數都正確定義在 CSS `:root` 中。
