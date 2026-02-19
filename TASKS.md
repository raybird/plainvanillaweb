# 📋 任務清單：原生響應式表單引擎

## 🎯 目標
實作一個零依賴的響應式表單引擎，支援狀態追蹤 (Touched/Dirty/Valid)、自定義驗證規則及非同步驗證。

## 🛠 任務分解
- [x] **Phase 1: 核心引擎開發 (ADR 0062)**
    - [x] 建立 `lib/form-engine.js` 封裝表單狀態與邏輯。
    - [x] 支援自定義驗證器 (Custom Validators) 與跨欄位驗證。
    - [x] 實作欄位狀態追蹤機制。
    - [x] 支援非同步驗證 (Async Validation)。
- [x] **Phase 2: UI 整合與展示 (Lab)**
    - [x] 在 `Lab.js` 實作「專業註冊表單」範例。
    - [x] 展示實時驗證回饋與非同步檢查效果。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/reactive-forms.md` 教學文件。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。
