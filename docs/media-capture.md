# 原生螢幕錄製與串流 (Screen Capture & Recording)

現代瀏覽器提供了強大的多媒體 API，允許網頁直接擷取使用者的螢幕畫面並進行錄製，無需安裝任何插件。

## 1. 擷取螢幕串流 (getDisplayMedia)

透過 `navigator.mediaDevices.getDisplayMedia`，您可以請求使用者選擇分享整個螢幕、特定視窗或瀏覽器分頁。

```javascript
async function startCapture() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true // 可選：同時擷取系統音訊
    });
    return stream;
}
```

## 2. 錄製串流 (MediaRecorder)

取得 `MediaStream` 後，可以使用 `MediaRecorder` 將其錄製為影片檔案。

```javascript
const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
const chunks = [];

recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    // 可將 url 賦予 <a href="..." download> 進行下載
};

recorder.start();
```

## 3. 本專案的實踐

在「實驗室 (Lab)」中，我們展示了：
1.  **即時預覽**：將擷取到的串流直接顯示在 `<video>` 標籤中。
2.  **錄影控制**：提供開始與停止錄影的介面。
3.  **下載與回放**：錄製完成後，自動生成下載連結並提供預覽。

## 4. 隱私與權限

- **使用者授權**：每次調用 `getDisplayMedia` 都會強制彈出系統選擇視窗，網頁無法在背景靜默啟動。
- **指示器**：瀏覽器通常會顯示「正在分享螢幕」的系統級通知。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
