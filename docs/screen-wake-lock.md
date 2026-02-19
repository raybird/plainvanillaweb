# 💡 Screen Wake Lock API 保持喚醒

`Screen Wake Lock API` 可讓網頁請求裝置在指定期間維持螢幕常亮，適合長時間閱讀、簡報展示、掃碼流程或監看儀表板。

## 🌟 為什麼用 Screen Wake Lock

- **減少中斷**：避免螢幕自動熄滅打斷使用流程。
- **原生能力**：不需要第三方套件，即可完成常亮控制。
- **可控降級**：不支援時可提示使用者，維持功能可理解。

## 🧩 基本用法

```javascript
let sentinel = null;

if (navigator.wakeLock && document.visibilityState === "visible") {
  sentinel = await navigator.wakeLock.request("screen");
}

await sentinel?.release();
```

## 🔁 前景恢復策略

`Wake Lock` 可能在切背景或省電策略下被系統釋放，建議在回到前景時做可控的自動恢復：

```javascript
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    await ensureWakeLock();
  }
});
```

## 🛡️ 相容性與降級

- 先檢查：`navigator.wakeLock && navigator.wakeLock.request`
- 僅在 `HTTPS` 或 `localhost` 測試
- 不支援時顯示提示，並維持一般流程可操作

## 🎓 教學對應

在 `Lab` 的 `#/lab/wakelock` 可直接體驗：

1. 手動啟用/釋放常亮
2. 切背景後回前景的自動恢復策略
3. 觀察持續時間與最後釋放原因
