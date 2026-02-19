# 🎞️ 即時串流處理 (Live Stream Processing)

本單元展示如何利用現代瀏覽器的 **Insertable Streams for MediaStreamTrack** API，在不依賴任何外部庫的情況下，對攝像頭或螢幕錄製的影格進行即時處理（如濾鏡、辨識）。

## 🌟 為什麼需要 Insertable Streams？

傳統上，要處理視訊影格需要透過 `requestAnimationFrame` 將 `<video>` 繪製到 `Canvas`，處理後再導出。這種方式存在以下問題：
1.  **效能損耗**：頻繁的 DOM 操作與記憶體拷貝導致延遲高。
2.  **主線程阻塞**：大量運算可能造成 UI 卡頓。

`Insertable Streams` 允許我們像處理資料流 (Stream) 一樣處理媒體軌道，影格直接從底層取出，運算後直接送回，過程極其高效。

## 🛠️ 核心實作原理

### 1. 影格攔截 (Processor)
利用 `MediaStreamTrackProcessor` 將媒體軌道轉換為一個 `ReadableStream`，從中獲取 `VideoFrame` 對象。
```javascript
const processor = new MediaStreamTrackProcessor({ track });
const reader = processor.readable.getReader();
```

### 2. 影格運算 (Transform)
對每一幀進行運算。我們可以使用 `OffscreenCanvas` 在後台進行濾鏡處理，或利用 `VideoFrame` 直接操作 GPU 資料。
```javascript
const canvas = new OffscreenCanvas(w, h);
ctx.filter = 'grayscale(100%)';
ctx.drawImage(frame, 0, 0);
const newFrame = new VideoFrame(canvas, { timestamp: frame.timestamp });
```

### 3. 串流產出 (Generator)
利用 `MediaStreamTrackGenerator` 將處理後的影格重新組合為一個新的 `MediaStream` 供影片播放器使用。

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面體驗即時濾鏡處理效果。這項技術是實作視訊會議背景模糊、AR 濾鏡或 WebRTC 影像增強的基礎。
