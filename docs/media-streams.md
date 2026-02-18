# 原生螢幕錄製與串流 (Media Streams)

HTML5 的多媒體能力已不僅限於播放影片。透過 Screen Capture API，網頁可以請求擷取使用者的螢幕畫面，並利用 MediaRecorder 進行即時錄製。

## 1. 擷取螢幕 (Screen Capture)

`getDisplayMedia` 是核心 API，它會彈出系統對話框讓使用者選擇要分享的螢幕、視窗或分頁。

```javascript
const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: "always" },
    audio: false
});
// 將串流導向 Video 元素進行預覽
videoElement.srcObject = stream;
```

## 2. 錄製串流 (MediaRecorder)

一旦獲得 `MediaStream`，即可透過 `MediaRecorder` 將其編碼為影片檔案。

```javascript
const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
const chunks = [];

recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    // 建立下載連結
};

recorder.start();
```

## 3. 本專案的實踐

在「實驗室 (Lab)」中，我們展示了：
1.  **完整流程**：從請求權限、預覽畫面到下載錄影檔。
2.  **狀態管理**：處理錄製中、停止與數據收集的狀態轉換。
3.  **零外掛**：完全不依賴任何瀏覽器擴充功能。

## 4. 注意事項

- **安全性**：必須由使用者手勢觸發。
- **行動裝置**：目前手機瀏覽器對螢幕分享的支援度較低，通常僅支援相機擷取 (`getUserMedia`)。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
