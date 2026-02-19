# 📋 任務清單：原生即時串流處理 (Live Stream)

## 🎯 目標
實作一個零依賴的串流處理器，利用 MediaStreamTrackProcessor 攔截即時影像，並透過 Web Worker 或 Canvas 實作即時視覺濾鏡。

## 🛠 任務分解
- [x] **Phase 1: 核心服務開發 (ADR 0060)**
    - [x] 實作 `lib/stream-processor-service.js` 封裝處理管道 (Pipeline)。
    - [x] 支援從 `MediaStreamTrack` 讀取 `VideoFrame`。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 在 `Lab.js` 新增「即時串流濾鏡」單元。
    - [x] 實作灰階 (Grayscale) 與反轉 (Invert) 處理器。
    - [x] 整合攝像頭預覽與處理後串流展示。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/live-stream-processing.md` 教學文件。
    - [x] 在 `Docs.js` 中新增項目並更新 `ROADMAP.md`。
