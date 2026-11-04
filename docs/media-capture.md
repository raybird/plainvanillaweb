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

本專案在 `lib/media-service.js`（`mediaService`）封裝了上述螢幕擷取與錄影流程：
1.  **螢幕擷取**：`startScreenShare()` 呼叫 `getDisplayMedia`，成功時發出 `stream-started` 事件；使用者停止分享時發出 `stream-ended`。
2.  **錄影控制**：`startRecording()` 開始錄製，`stopRecording()` 停止錄影並關閉串流，完成時發出 `recording-stopped` 事件並附上 `blob`。
3.  **下載**：`downloadVideo(blob)` 會直接觸發下載 `screen-recording.webm`。

目前「實驗室 (Lab)」的 `#/lab/media` 頁面並未使用螢幕錄製，展示的是相機串流的即時處理：
1.  **相機預覽**：點擊「📹 啟動處理器」後才以 `getUserMedia` 開啟鏡頭（優先使用後鏡頭）。
2.  **影格處理**：支援 `MediaStreamTrackProcessor` 時，透過 `streamProcessorService` 以 Canvas 逐格處理後輸出到 `<video>`；不支援時改為原始預覽。
3.  **生命週期**：切回前景時自動恢復串流，離開頁面時釋放鏡頭。

## 4. 隱私與權限

- **使用者授權**：每次調用 `getDisplayMedia` 都會強制彈出系統選擇視窗，網頁無法在背景靜默啟動。
- **指示器**：瀏覽器通常會顯示「正在分享螢幕」的系統級通知。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
