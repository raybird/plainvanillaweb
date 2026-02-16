# 資料持久化 (LocalStorage Persistence)

在 Vanilla 開發中，我們不需要複雜的插件來保存狀態。

## 實作思路
1. **讀取**: 在 `Store` 初始化時從 `localStorage.getItem()` 恢復數據。
2. **寫入**: 在 `Proxy` 的 `set` 陷阱中，同步執行 `localStorage.setItem()`。

## 優點
- 零相依性。
- 效能極高。
- 使用者體驗佳（重新整理不遺失資料）。
