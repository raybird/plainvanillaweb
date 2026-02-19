# 🗺️ Plain Vanilla Web 演進路線圖 (2026)

本專案致力於成為現代原生網頁開發 (Modern Vanilla Development) 的標竿。本路線圖定義了從基礎架構到 AI 協作生態的演進路徑。

---

## 📅 當前階段：架構標準化 (Standardization)
**重心：定義標準接口，提升代碼一致性。**
- [x] **Base Service 抽象化**：實作 `lib/base-service.js` 規範事件與狀態。
- [x] **Base Component 強化**：提供生命週期鉤子與渲染優化.
- [x] **CSS 變數封裝規範**：定義原生 Scoped CSS 實作模式。

## 🚀 下一階段：AI 協作與開發體驗 (AI & DX)
**重心：人機友善工具化。**
- [x] **架構決策紀錄 (ADR)**：建立 `docs/decisions/` 追蹤設計選擇。
- [x] **AI 專用維護腳本**：自動化測試、清理與同步工具。
- [x] **動態腳手架 (CLI)**：原生指令快速產生組件。

## 💎 進階階段：高性能與邊緣情境 (Performance)
- [x] **Web Workers 服務化**：多線程運算整合。
- [x] **智能快取策略**：IndexedDB 離線支援。
- [x] **全域錯誤邊界**：增強 SPA 穩定性。

## 🎓 最終目標：生態與教學 (Education)
- [x] **互動式 Dashboard 範例**：整合全技術棧的實戰 Demo (監控 IDB/Store/Worker)。
- [x] **Vanilla Manifesto**：撰寫長青代碼開發宣言。

## 🔮 未來願景 (Cutting Edge)
**重心：突破瀏覽器應用的極限能力。**
- [x] **WebAssembly (Wasm) 整合**：實作流式載入高效能機器碼模組。
- [x] **次世代 WebGPU 運算**：探索硬體加速的 GPU 計算與渲染。
- [x] **File System 原生編輯**：整合本地檔案系統存取，打造原生開發體驗。
- [x] **原生數據壓縮 (Gzip/Deflate)**：實作儲存與傳輸的流式壓縮優化。
- [x] **WebRTC P2P 通訊**：實作無伺服器的去中心化數據交換。

---
*最後更新：2026-02-18 (By TeleNexus Orchestrator)*

## 🎉 專案里程碑達成 (2026/02/19)
本專案已完成從「範例集合」向「工業級 SDK」的全面轉型。
1. **Vanilla SDK v1.0.0**：重構 `VanillaSDK` 入口，提供單例化、自動配置與完整的 JSDoc 型別提示。
2. **WebRTC 穩定性增強**：內建 Google/Twilio STUN Server，優化 HTTPS 與 GitHub Pages 下的連線表現。
3. **SDK 使用指南升級**：重寫 `docs/sdk-usage.md`，提供具備實戰價值的快速上手範例與 API 細節。
4. **語音服務補全**：修復並導出 `speechService`，整合至全域 SDK 入口。
5. **原生數據可視化**：實作基於 SVG 的輕量級圖表引擎與 Dashboard 整合。

## 🎁 自主開發 (Bonus Features)
**AI Agent 主動識別並實作的高價值功能。**
- [x] **身分驗證與保護 (Auth System)**：實作 Auth Guard 與受保護路由。
- [x] **操作歷史管理 (History API)**：實作撤銷/重做 (Undo/Redo) 狀態快照。
- [x] **高效能虛擬列表 (Virtual List)**：支持大數據量下的流暢渲染。
- [x] **原生影像處理 (Image Filter)**：利用 Canvas 實作純前端圖片濾鏡。
- [x] **原生語音實驗室 (Speech Lab)**：整合 Web Speech API (TTS & STT)。
- [x] **語音功能全域整合**：在教學文件新增「朗讀模式」與搜尋頁面新增「語音搜尋」。
- [x] **原生組件組合 (Slots Simulation)**：支援 Light DOM 內容分發。
- [x] **原生程式碼遊樂場 (Playground)**：利用 Blob & ObjectURL 實作即時編輯器。
- [x] **原生儲存管理 (Storage Service)**：監控配額使用率並請求數據持久化。
- [x] **原生 Web Crypto 服務 (Security)**：實作高強度數據雜湊與 AES 加解密。
- [x] **Web Share 與接收整合 (PWA)**：支援系統級內容分享與 Share Target。
- [x] **PWA 進階功能 (Install & Sync)**：實作自定義安裝引導與背景同步機制。
- [x] **Vanilla SDK 模式轉型**：核心服務解耦，支援由外部 URL 直接引用的 CDN 開發模式。
- [x] **原生 Web Bluetooth 整合**：支援與 BLE 藍牙裝置直接通訊與數據交換。
- [x] **原生螢幕錄製與串流**：實作 Screen Capture API 與 MediaRecorder 整合。
- [x] **響應式設計與手機版面優化**：全面提升行動裝置的閱讀體驗與佈局彈性。
- [x] **原生 Payment Request 整合**：實作標準化的瀏覽器原生結帳流程。
- [x] **原生圖表引擎 (SVG Charting)**：實作零相依的反應式動態圖表，展示 CSS 路徑過渡動畫。
