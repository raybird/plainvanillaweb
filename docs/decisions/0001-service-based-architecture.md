# ADR 0001: 採用 Service 導向的原生架構

## 背景
在無框架開發中，組件間的通訊往往會變成複雜的事件地獄 (Event Hell) 或深層的 Props Drilling。

## 決策
我們將邏輯與狀態從 UI 組件中剝離，建立獨立的 Service 層 (位於 `lib/`)。

## 影響
- **優點**: 組件高度解耦，易於測試 (Unit Testable)，代碼結構對 AI Agent 來說更易於預測與修改。
- **缺點**: 需要手動管理 EventTarget 的訂閱與取消訂閱以防記憶體洩漏。
