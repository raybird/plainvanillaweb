# 🔐 Web Locks API 併發協調

`Web Locks API` 讓網頁可以對共享資源建立命名鎖（Named Lock），適合處理「同一時間只能有一個流程操作」的情境，例如媒體恢復、背景同步、快取重建。

## 🌟 為什麼用 Web Locks API

- **避免重入**：防止 start/stop/recover 或多個非同步流程同時操作同一資源。
- **跨執行內容協調**：同網域下可在不同 Tab、Worker 間協調資源使用順序。
- **原生排程語意**：用 `exclusive`（排隊）與 `ifAvailable`（不阻塞）建立清楚策略。

## 🧩 基本用法

```javascript
await navigator.locks.request("camera-recover", async () => {
  await recoverCamera();
});
```

### 非阻塞嘗試（ifAvailable）

```javascript
const acquired = await navigator.locks.request(
  "camera-recover",
  { ifAvailable: true },
  async (lock) => {
    if (!lock) return false;
    await quickHealthCheck();
    return true;
  },
);
```

## 🛡️ 相容性與降級策略

- 先檢查：`navigator.locks && navigator.locks.request`
- 不支援時維持功能可用，改用本地提示與最小排隊機制
- 針對高優先任務使用 `exclusive`，低優先背景任務可用 `ifAvailable`

## 🎓 教學對應

在 `Lab` 的 `#/lab/weblocks` 可以直接體驗：

1. 建立 `exclusive` 任務並觀察鎖排隊順序
2. 建立 `ifAvailable` 任務並觀察忙碌時略過行為
3. 透過混合壓力測試比對完成數與略過數
