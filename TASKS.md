# 📋 任務清單：原生 CRDT 數據同步

## 🎯 目標
實作一個零依賴的 CRDT 引擎，支援跨分頁 (Multi-tab) 與離線 (Offline) 數據的最終一致性同步。

## 🛠 任務分解
- [x] **Phase 1: 核心引擎開發 (ADR 0063)**
    - [x] 實作 `lib/crdt-service.js` 封裝 LWW (Last Write Wins) 暫存器與集合。
    - [x] 支援時間戳記與節點 ID 排序。
    - [x] 整合 `broadcast-service.js` 實現即時同步。
- [x] **Phase 2: 協作範例實作 (Lab)**
    - [x] 在 `Lab.js` 新增「即時協作筆記」單元。
    - [x] 展示當多個分頁同時編輯時，數據如何自動合併。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/crdt-sync.md` 教學文件。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。
