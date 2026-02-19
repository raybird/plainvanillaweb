# ADR 0060: 實作原生即時串流處理機制

## 狀態
已提議 (Proposed)

## 背景
`plainvanillaweb` 已具備媒體錄製與 P2P 通訊能力。然而，若要實作如「視訊背景模糊」或「即時影像增強」等現代 Web 應用功能，需要具備直接操作串流幀 (Frames) 的能力。傳統做法是將 Video 繪製到 Canvas 再讀取，但這會造成顯著的效能損耗。

## 決策
使用 Web 原生 `Insertable Streams for MediaStreamTrack` API。
1. **處理模型**：採用 `MediaStreamTrackProcessor` (ReadableStream) 獲取幀，經過運算後透過 `MediaStreamTrackGenerator` (WritableStream) 產出新串流。
2. **效能優化**：利用 `VideoFrame` 對象直接操作 GPU 資源或二進位數據，減少記憶體拷貝。
3. **靈活性**：設計插拔式 (Plugin) 處理器接口，方便未來擴充 AI 辨識等功能。

## 後果
- **優點**：極低延遲、比 Canvas 方案更優的記憶體管理、可無縫對接到 WebRTC 傳輸。
- **缺點**：此 API 目前主要由 Chromium 系瀏覽器支援 (Chrome/Edge)，需要實作相容性降級處理。
