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
- [x] **基礎頁面與佈局教學**：撰寫標準的 Layout 與 Component 開發規範。
- [x] **Service 交互 Pattern**：定義並說明組件與服務間的注入與通訊模式。
- [x] **Vanilla Manifesto**：撰寫長青代碼開發宣言並實作專屬頁面。

## 🏗️ 建築藍圖：架構與規範 (Architecture)

**重心：將實作轉化為可複製的開發模式。**

- [x] **ADR 0089+: 架構決策深度化**：記錄關於組件通訊與狀態流向的選擇。
- [x] **核心反應式優化 (lib/base-component.js)**：實作深度觀察與非同步渲染緩衝。
- [x] **組件開發指南 (docs/component-architecture.md)**：詳解 BaseComponent 的反應式狀態與生命週期。
- [x] **服務模式規範 (docs/service-patterns.md)**：詳解 Singleton Service 的注入、事件廣播與狀態隔離。
- [x] **原生佈局範式 (docs/layout-guide.md)**：實作 CSS 變數驅動的流體佈局教學。

## 🔮 未來願景 (Cutting Edge)

**重心：突破瀏覽器應用的極限能力。**

- [x] **WebAssembly (Wasm) 整合**：實作流式載入高效能機器碼模組。
- [x] **次世代 WebGPU 運算**：探索硬體加速的 GPU 計算與渲染。
- [x] **File System 原生編輯**：整合本地檔案系統存取，打造原生開發體驗。
- [x] **原生數據壓縮 (Gzip/Deflate)**：實作儲存與傳輸的流式壓縮優化。
- [x] **WebRTC P2P 通訊**：實作無伺服器的去中心化數據交換。

---

_最後更新：2026-02-21 (By TeleNexus Orchestrator)_

## 🎉 專案里程碑達成 (2026/02/19)

本專案已完成從「範例集合」向「工業級 SDK」的全面轉型，並實作了多項尖端 Web 硬體與數據技術。

1. **Vanilla SDK v1.0.0**：重構 `VanillaSDK` 入口，提供單例化、自動配置與完整的 JSDoc 型別提示。
2. **WebRTC 穩定性增強**：內建 Google/Twilio STUN Server，優化 HTTPS 與 GitHub Pages 下的連線表現。
3. **實驗室架構重構**：實作巢狀路由 (Nested Routing)，將 10+ 項實驗功能模組化隔離，提升系統穩定性。
4. **原生數據可視化**：實作基於 SVG 的輕量級圖表引擎與 Dashboard 整合。
5. **原生即時串流處理**：實作 Insertable Streams 濾鏡機制，展示高效能影像運算。
6. **原生 Web Serial 整合**：實作序列通訊服務與終端機模擬介面。
7. **原生響應式表單**：實作零相依的表單驗證引擎與 Lab 註冊範例。
8. **原生 CRDT 數據同步**：實作 LWW-Register 衝突解決機制與即時協作筆記。
9. **原生 Web NFC 整合**：實作與實體 NDEF 標籤的讀寫通訊，解鎖近場感應應用。
10. **原生掃碼與視覺辨識**：實作高效能、零相依的條碼與 QR 碼辨識引擎。
11. **原生生物辨識整合**：實作 WebAuthn 流程，支援 FaceID 與實體安全金鑰驗證。
12. **原生 WebGPU 運算**：實作 Compute Shader 展示硬體加速的平行計算能力。
13. **原生檔案系統存取**：實現網頁對本地目錄與檔案的深度讀寫與編輯。
14. **原生數據壓縮流**：利用 Compression Streams 實現高效、零依賴的數據壓縮。
15. **原生影像工作室**：實作純前端圖片濾鏡、縮放與 WebP 品質壓縮。
16. **原生連線性實驗室**：整合 Network Information API 與 Beacon 可靠傳輸。
17. **原生效能監控儀表板**：實作 Web Vitals (LCP/CLS) 與加載管線視覺化。
18. **原生 MIDI 互動實驗室**：實作 Web MIDI 設備偵測與即時訊息解析。
19. **原生 Web Audio 合成器**：實作振盪器音訊生成與 MIDI 聯動發聲。

## 🎁 自主開發 (Bonus Features)

**AI Agent 主動識別並實作的高價值功能。**

- [x] **身分驗證與保護 (Auth System)**：實作 Auth Guard 與受保護路由。
- [x] **操作歷史管理 (History API)**：實作撤銷/重做 (Undo/Redo) 狀態快照。
- [x] **高效能虛擬列表 (Virtual List)**：支持大數據量下的流暢渲染。
- [x] **原生影像處理 (Image Filter)**：利用 Canvas 實作純前端圖片濾鏡。
- [x] **原生語音實驗室 (Speech Lab)**：整合 Web Speech API (TTS & STT)。
- [x] **原生程式碼遊樂場 (Playground)**：利用 Blob & ObjectURL 實作即時編輯器。
- [x] **原生儲存管理 (Storage Service)**：監控配額使用率並請求數據持久化。
- [x] **原生 Web Crypto 服務 (Security)**：實作高強度數據雜湊與 AES 加解密。
- [x] **Web Share 與接收整合 (PWA)**：支援系統級內容分享與 Share Target。
- [x] **PWA 進階功能 (Install & Sync)**：實作自定義安裝引導與背景同步機制。
- [x] **原生 Web Bluetooth 整合**：支援與 BLE 藍牙裝置直接通訊與數據交換。
- [x] **原生螢幕錄製與串流**：實作 Screen Capture API 與 MediaRecorder 整合。
- [x] **響應式設計與手機版面優化**：全面提升行動裝置的閱讀體驗與佈局彈性。
- [x] **原生 Payment Request 整合**：實作標準化的瀏覽器原生結帳流程。
- [x] **原生背景抓取 (Background Fetch) 整合**：支援即使關閉分頁也能持續的大型檔案傳輸任務。
- [x] **原生圖表引擎 (SVG Charting)**：實作零相依的反應式動態圖表。
- [x] **原生即時串流處理 (Live Media Processing)**：利用 Insertable Streams 實現低延遲影像濾鏡。
- [x] **原生 Web Serial 整合**：支援與硬體裝置（如 Arduino）的直接序列埠通訊。
- [x] **原生響應式表單引擎**：實作具備狀態追蹤 (Touched/Dirty) 與非同步驗證的專業表單系統。
- [x] **原生 CRDT 數據同步**：實作基於 LWW-Register 的最終一致性算法，支援零衝突跨分頁協作。
- [x] **原生 Web NFC 整合**：實作與實體 NDEF 標籤的讀寫通訊。
- [x] **原生掃碼與視覺辨識**：利用 Barcode Detection API 實作高效能、零相依的條碼與 QR 碼辨識。
- [x] **原生生物辨識整合**：利用 WebAuthn API 實作基於硬體（FaceID/TouchID）的身分驗證流程。
- [x] **原生 WebGPU 運算實驗室**：實作 Compute Shader (WGSL) 平行運算展示頁。
- [x] **原生檔案系統存取實驗室**：實作目錄讀取與檔案編輯/儲存回本地的完整流程。
- [x] **原生數據壓縮流實驗室**：利用 Compression Streams 實作零依賴的 Gzip 壓縮/解壓展示。
- [x] **原生影像工作室**：實作基於 Canvas API 的濾鏡、縮放與 WebP 品質壓縮引擎。
- [x] **原生連線性與網路資訊實驗室**：實作即時頻寬監控與 Beacon API 可靠數據傳送。
- [x] **原生效能監控實驗室**：實作 Web Performance API 儀表板，監控 Web Vitals 與加載指標。
- [x] **原生 MIDI 互動實驗室**：實作 Web MIDI 設備連線、訊息解析與即時監控。
- [x] **原生 Web Audio 實驗室**：實作基於振盪器的音訊合成器與 MIDI 聯動演奏能力。
- [x] **原生 Web 藍牙實驗室**：實作設備搜尋、GATT 連線管理與通訊規範文件。
- [x] **原生佈局與主題實驗室**：實作 CSS 變數驅動的主題引擎與教學範例。
- [x] **原生 Popover API 互動層**：以宣告式與程式式雙模式實作輕量彈出層體驗。
- [x] **原生 EyeDropper API 取色體驗**：以零相依方式實作畫面取色與主題色票預覽流程。
- [x] **原生 Web Locks API 併發協調**：以 `exclusive/ifAvailable` 實作跨流程資源互斥與非阻塞排程。
- [x] **原生 Screen Wake Lock 保持喚醒**：以手動啟用/釋放與前景自動恢復策略維持長流程常亮體驗。
- [x] **原生 Badging API 應用徽章**：以未讀數徽章與標題降級策略補齊 PWA 提醒體驗。
- [x] **原生 WebCodecs 低延遲編碼**：以 `VideoEncoder` 合成影格編碼與指標儀表展示即時影音管線能力。
- [x] **原生 View Transitions 教學強化**：新增可操作教學頁，覆蓋路由切換與同頁狀態過渡示範。
- [x] **技術手冊與 Lab 雙向快參照**：建立文件與實作頁的雙向連結與深連結導覽流程。
- [x] **原生權限預檢教學頁**：新增 `#/lab/permissions`，示範 Secure Context、Permissions API 與鏡頭啟動/釋放流程。
- [x] **原生 Web Share 教學頁與 Query-Aware 路由**：新增 `#/lab/web-share`，補齊系統分享/接收流程，並修正 hash query 路由匹配穩定性。
