# 📋 任務清單：技術手冊與 Lab 雙向快參照

## 🎯 目標

建立教學文件與實驗室的雙向導覽，支援 `#/docs/<doc-id>` 深連結，降低查找成本並提升手機場景下的快速參照效率。

## 🛠 任務分解

- [x] **Phase 1: 架構決策 (ADR 0076)**
  - [x] 建立 `docs/decisions/0076-docs-lab-cross-reference.md`。
  - [x] 定義 Docs->Lab 與 Lab->Docs 的雙向導覽範圍。
  - [x] 定義 `#/docs/<doc-id>` 深連結策略。
- [x] **Phase 2: 導覽能力實作**
  - [x] 在 `components/pages/Docs.js` 加入對應實驗室快捷入口。
  - [x] 在 `components/pages/lab/LabIndex.js` 加入對應技術手冊入口。
  - [x] 支援由 hash 路徑直接開啟指定文件（`/docs/<doc-id>`）。
- [x] **Phase 3: 文件與路線同步**
  - [x] 撰寫 `docs/docs-lab-cross-reference.md`。
  - [x] 更新 `components/pages/Docs.js` 導覽清單。
  - [x] 更新 `docs/decisions/README.md` 與 `ROADMAP.md` 記錄里程碑。
- [x] **Phase 4: 交付驗證與發布**
  - [x] 執行測試或最小驗證命令，確認專案可正常運作。
  - [x] 完成 `commit -> tag -> push` 發布流程。
