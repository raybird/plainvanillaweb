# 📋 任務清單：原生 EyeDropper API 取色體驗

## 🎯 目標

導入瀏覽器原生 EyeDropper API，建立可直接教學與實作的取色範例，並維持 Vanilla-first 架構。

## 🛠 任務分解

- [x] **Phase 1: 架構決策 (ADR 0070)**
  - [x] 建立 `docs/decisions/0070-eye-dropper-integration.md`。
  - [x] 定義 API 支援檢測與取消操作 (`AbortError`) 處理策略。
  - [x] 定義不支援環境的降級提示與預設色票策略。
- [x] **Phase 2: 實驗室整合 (Lab)**
  - [x] 建立 `components/pages/lab/EyeDropperPage.js`。
  - [x] 在 `components/pages/Lab.js` 註冊 preload 與子路由。
  - [x] 更新 `components/pages/lab/LabIndex.js`，加入入口卡片。
- [x] **Phase 3: 教學與文件同步**
  - [x] 撰寫 `docs/eye-dropper.md` 教學文件。
  - [x] 更新 `components/pages/Docs.js` 導覽清單。
  - [x] 更新 `docs/decisions/README.md` 與 `ROADMAP.md` 記錄演進里程碑。
