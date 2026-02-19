# 🔔 Badging API 應用徽章

`Badging API` 讓 Web App 可以在應用圖示上顯示未讀數（例如通知、待辦、訊息），常見於 PWA 的背景提醒場景。

## 🌟 為什麼用 Badging API

- **即時感知**：使用者不進入 App 也能看到待處理數量。
- **原生整合**：透過瀏覽器與系統層提供一致的圖示徽章體驗。
- **低耦合**：可直接與既有通知、訊息、任務系統串接。

## 🧩 基本用法

```javascript
if (navigator.setAppBadge && navigator.clearAppBadge) {
  await navigator.setAppBadge(5); // 顯示未讀 5
  await navigator.clearAppBadge(); // 清除徽章
}
```

## 🛡️ 相容性與降級策略

- 先檢查：`navigator.setAppBadge` / `navigator.clearAppBadge`
- 不支援時可降級成 `document.title` 前綴（例如 `(5) App Name`）
- 在 PWA 場景支援通常較完整，桌面瀏覽器支援度仍不一致

## 🎓 教學對應

在 `Lab` 的 `#/lab/badging` 可直接體驗：

1. 增減未讀數與清除徽章
2. 模擬收到通知並更新徽章
3. 不支援環境以標題文字降級展示
