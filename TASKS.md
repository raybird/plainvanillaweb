# 📋 任務清單：原生 Web Serial API 整合

## 🎯 目標
實作網頁與硬體裝置（如 Arduino, Serial Sensors）的直接通訊能力。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務開發 (ADR 0061)**
    - [x] 實作 `lib/serial-service.js`。
    - [x] 封裝 `requestPort` 與連線管理。
    - [x] 實作串流讀寫接口 (TextEncoder/Decoder)。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 在 `Lab.js` 新增「序列通訊 (Web Serial)」單元。
    - [x] 實作終端機模擬介面。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/web-serial.md` 教學文件。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。
