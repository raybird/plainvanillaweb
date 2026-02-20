# 🛡️ 權限預檢與鏡頭啟動策略

在行動裝置上，若一進頁就直接啟動鏡頭，常見結果是「畫面閃一下後黑屏」或被瀏覽器自動回收串流。建議改用 **預檢 -> 使用者互動後請求 -> 離場釋放** 的流程。

## 為什麼需要預檢

- 先確認 `window.isSecureContext`，避免在非 HTTPS 環境請求失敗。
- 先透過 `navigator.permissions.query()` 了解權限狀態（可用時）。
- 將裝置權限請求延後到使用者點擊按鈕後，避免瀏覽器策略攔截。

## 建議流程

1. **Preflight**：檢查 Secure Context 與 Permissions API 可用性。
2. **Just-in-time Request**：在使用者觸發操作時才呼叫 `getUserMedia()`。
3. **Lifecycle Cleanup**：離開頁面或切換功能時 `track.stop()`，釋放攝影機資源。
4. **Fallback**：若 `permissions` 不支援，仍可直接請求但要強化錯誤提示。

## Vanilla 範例

```js
async function startCameraPreview(videoEl) {
  if (!window.isSecureContext) {
    throw new Error("需要 HTTPS 才能使用 camera API");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });

  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

function stopCameraPreview(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}
```

## 對應實驗

- 權限預檢 Lab：`#/lab/permissions`
- 媒體擷取 Lab：`#/lab/media`
