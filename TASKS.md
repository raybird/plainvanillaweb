# 📋 任務清單：原生 View Transitions 教學強化

## 🎯 目標

將既有 `View Transitions API` 能力轉為可操作教學頁，完整展示路由切換與同頁狀態過渡，並補齊技術手冊與 ADR。

## 🛠 任務分解

- [x] **Phase 1: 架構決策 (ADR 0075)**
  - [x] 建立 `docs/decisions/0075-view-transitions-lab-integration.md`。
  - [x] 定義路由過渡與同頁過渡示範範圍。
  - [x] 定義不支援環境 fallback 與教學說明。
- [x] **Phase 2: 實驗室整合 (Lab)**
  - [x] 建立 `components/pages/lab/ViewTransitionsPage.js`。
  - [x] 在 `components/pages/Lab.js` 註冊 preload 與子路由。
  - [x] 更新 `components/pages/lab/LabIndex.js`，加入入口卡片。
- [x] **Phase 3: 教學與文件同步**
  - [x] 撰寫 `docs/view-transitions.md` 教學文件。
  - [x] 更新 `components/pages/Docs.js` 導覽清單。
  - [x] 更新 `docs/decisions/README.md` 與 `ROADMAP.md` 記錄演進里程碑。
- [x] **Phase 4: 交付驗證與發布**
  - [x] 執行測試或最小驗證命令，確認專案可正常運作。
  - [x] 完成 `commit -> tag -> push` 發布流程。
