# ADR 0009: 錯誤邊界與全域復原策略 (Error Boundary Strategy)

## 上下文
在 SPA 中，任何一個未捕獲的 JS 錯誤都可能導致整個應用程式掛掉。

## 決策
1. 在 `BaseComponent` 實作 `try-catch` 渲染保護。
2. 建立全域 `ErrorService` 監聽瀏覽器級錯誤並整合進 Notification 系統。

## 後果
- **優點**: 大幅提升應用程式的穩定性。
- **優點**: 使用者能獲得明確的錯誤回饋，而非看到空白畫面。
- **缺點**: `update()` 方法增加了一點點效能開銷（try-catch）。
