# 📋 任務清單：原生 Popover API 互動層

## 🎯 目標

導入瀏覽器原生 Popover API，建立可直接教學與實作的彈出層範例，並維持 Vanilla-first 架構。

## 🛠 任務分解

- [x] **Phase 1: 架構決策 (ADR 0069)**
  - [x] 建立 `docs/decisions/0069-popover-api-integration.md`。
  - [x] 定義宣告式與程式式雙模式實作策略。
  - [x] 定義不支援環境的降級提示策略。
- [x] **Phase 2: 實驗室整合 (Lab)**
  - [x] 建立 `components/pages/lab/PopoverPage.js`。
  - [x] 在 `components/pages/Lab.js` 註冊 preload 與子路由。
  - [x] 更新 `components/pages/lab/LabIndex.js`，加入入口卡片。
- [x] **Phase 3: 教學與文件同步**
  - [x] 撰寫 `docs/popover-api.md` 教學文件。
  - [x] 更新 `components/pages/Docs.js` 導覽清單。
  - [x] 更新 `ROADMAP.md` 記錄演進里程碑。
