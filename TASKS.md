# 📋 任務清單：原生數據可視化引擎 (SVG)

## 🎯 目標
實作一個零依賴的圖表引擎，利用 SVG 與反應式狀態展示具備動態過渡效果的專業圖表。

## 🛠 任務分解
- [x] **Phase 1: 核心引擎開發 (ADR 0059)**
    - [x] 實作 `lib/chart-service.js` 封裝 SVG 路徑生成與數據縮放 (Scaling) 算法。
    - [x] 支援折線圖 (Line) 與長條圖 (Bar) 基礎路徑計算。
- [x] **Phase 2: UI 元件實作 (Custom Elements)**
    - [x] 建立 `components/ui/NativeChart.js` 組件。
    - [x] 支援數據變動時的 CSS Transitions 平滑動畫。
    - [x] 整合至 `Dashboard.js` 展示實時數據。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/native-visualization.md` 教學文件。
    - [x] 在 `Docs.js` 中新增項目並更新 `ROADMAP.md`。
