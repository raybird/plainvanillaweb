# 📋 任務清單：原生 Web NFC 整合

## 🎯 目標
實作網頁與實體 NFC 標籤的讀寫通訊能力。

## 🛠 任務分解
- [x] **Phase 1: 核心服務開發 (ADR 0066)**
    - [x] 實作 `lib/nfc-service.js`。
    - [x] 封裝 `scan()` 與 `write()` 介面。
    - [x] 實作 NDEF 數據解析邏輯。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 建立 `components/pages/lab/NFCPage.js`。
    - [x] 在 `Lab.js` 註冊子路由。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/web-nfc.md` 教學文件。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。
