# 📋 任務清單：File System Access API 整合

## 🎯 目標
將 Playground 升級為具備本地檔案存取能力的「原生開發環境」。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務開發**
    - [x] 實作 `lib/file-system-service.js`。
    - [x] 支援 `showDirectoryPicker` 獲取目錄控制權。
    - [x] 支援讀取目錄下的檔案清單。
    - [x] 支援讀取與寫入特定檔案內容。
- [x] **Phase 2: UI 整合 (Playground)**
    - [x] 在 Playground 介面新增「開啟專案目錄」按鈕。
    - [x] 實作自動載入 HTML/CSS/JS 機制。
    - [x] 整合儲存機制至本地檔案。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/file-system-access.md` 教學文件。
    - [x] 在 `Docs.js` 中新增文件項目。
    - [x] 更新 `ROADMAP.md` 狀態。

# 📋 任務清單：WebGPU 運算與渲染

## 🎯 目標
展示如何利用次世代 WebGPU API 進行硬體加速運算，突破瀏覽器圖形處理極限。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務開發**
    - [x] 實作 `lib/webgpu-service.js`。
    - [x] 實作設備初始化與可用性檢查邏輯。
    - [x] 封裝基礎的 Compute Shader 執行接口。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 在 `Lab.js` 新增「次世代圖形 (WebGPU)」單元。
    - [x] 展示 WebGPU 併行運算範例。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/webgpu.md` 教學文件。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。

# 📋 任務清單：WebRTC P2P 無伺服器通訊

## 🎯 目標
實作基於 DataChannel 的瀏覽器對等連線，展示去中心化數據同步能力。

## 🛠 任務分解
- [x] **Phase 1: 核心通訊服務**
    - [x] 實作 `lib/webrtc-service.js` 封裝 PeerConnection 與 DataChannel。
    - [x] 支援 Offer/Answer 的生成與設置。
    - [x] 實作 IceCandidate 的收集與注入。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 在 `Lab.js` 新增「P2P 通訊 (WebRTC)」單元。
    - [x] 實作手動信令交換 UI (複製/貼上 SDP)。
    - [x] 實作即時文字聊天示範。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/webrtc-p2p.md` 教學文件。
    - [x] 更新 `Docs.js`、`ADR 0048` 與 `ROADMAP.md`。

---
*Updated: 2026-02-18 by TeleNexus Orchestrator*

# 📋 任務清單：原生 Web Bluetooth 整合

## 🎯 目標
實作網頁與實體藍牙低功耗 (BLE) 裝置的直接通訊。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務開發**
    - [x] 實作 `lib/bluetooth-service.js`。
    - [x] 封裝 `requestDevice` 與 GATT 連線。
    - [x] 實作特徵值讀寫接口。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 在 `Lab.js` 新增「藍牙通訊 (Web Bluetooth)」單元。
    - [x] 實作裝置掃描與連線狀態顯示。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/web-bluetooth.md` 教學文件。
    - [x] 建立 `ADR 0052`。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。

# 📋 任務清單：原生 Web Share 與接收整合

## 🎯 目標
利用 Web Share API 與 Share Target 實現系統級內容分享與接收。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務開發**
    - [x] 實作 `lib/share-service.js`。
    - [x] 封裝 `navigator.share` 與檔案分享檢查。
- [x] **Phase 2: PWA 整合**
    - [x] 配置 `manifest.json` 的 `share_target`。
    - [x] 在 `Lab.js` 新增分享觸發按鈕。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/web-share.md` 教學文件。
    - [x] 建立 `ADR 0049`。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。

# 📋 任務清單：原生螢幕錄製與串流整合

## 🎯 目標
實作基於 Screen Capture API 與 MediaRecorder 的原生螢幕錄製功能。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務開發**
    - [x] 實作 `lib/media-service.js`。
    - [x] 封裝 `getDisplayMedia` 與串流預覽。
    - [x] 實作 `MediaRecorder` 錄製與 Blob 下載。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 在 `Lab.js` 新增「螢幕錄製 (Screen Capture)」單元。
    - [x] 實作錄影控制 UI 與即時預覽。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/media-streams.md` 教學文件。
    - [x] 建立 `ADR 0055`。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。

# 📋 任務清單：原生 Payment Request 整合

## 🎯 目標
引入標準化的網頁支付介面，提供流暢的結帳體驗。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務開發**
    - [x] 實作 `lib/payment-service.js`。
    - [x] 封裝 `PaymentRequest` 與可用性偵測。
    - [x] 實作支付回應處理與事件發布。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 在 `Lab.js` 新增「原生支付 (Web Payment)」單元。
    - [x] 實作模擬商品與結帳流程。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/web-payment.md` 教學文件。
    - [x] 建立 `ADR 0053`。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。

# 📋 任務清單：原生螢幕錄製與串流整合

## 🎯 目標
實作基於 Screen Capture API 與 MediaRecorder 的原生螢幕錄製功能。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務開發**
    - [x] 實作 `lib/media-service.js`。
    - [x] 封裝 `getDisplayMedia` 與串流預覽。
    - [x] 實作 `MediaRecorder` 錄製與 Blob 下載。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 在 `Lab.js` 新增「螢幕錄製 (Screen Capture)」單元。
    - [x] 實作錄影控制 UI 與即時預覽。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/media-streams.md` 教學文件。
    - [x] 建立 `ADR 0055`。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。

# 📋 任務清單：原生 Payment Request 整合

## 🎯 目標
引入標準化的網頁支付介面，提供流暢的結帳體驗。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務開發**
    - [x] 實作 `lib/payment-service.js`。
    - [x] 封裝 `PaymentRequest` 與可用性偵測。
    - [x] 實作支付回應處理與事件發布。
- [x] **Phase 2: 實驗室整合 (Lab)**
    - [x] 在 `Lab.js` 新增「原生支付 (Web Payment)」單元。
    - [x] 實作模擬商品與結帳流程。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/web-payment.md` 教學文件。
    - [x] 建立 `ADR 0053`。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。

# 📋 任務清單：手機閱讀體驗與響應式優化

## 🎯 目標
確保所有實驗室、文件與遊樂場頁面在行動裝置 (Mobile/Tablet) 上具備卓越的閱讀性與操作體驗。

## 🛠 任務分解
- [x] **Phase 1: 基礎版面調整 (Layout)**
    - [x] 檢視 `index.css`，優化全域字體大小與行高 (Line-height)。
    - [x] 調整 `.lab-grid` 與 `.docs-container` 的 Flex/Grid 斷點，確保單欄流式佈局。
    - [x] 優化導覽列 (Navbar) 在小螢幕上的呈現 (如漢堡選單或水平滾動)。
- [x] **Phase 2: 元件適配 (Components)**
    - [x] 優化 `Playground` 的編輯器與預覽視窗在直立螢幕下的堆疊方式。
    - [x] 調整 `Lab` 卡片的按鈕尺寸與間距，符合觸控目標 (Touch Target) 規範。
- [x] **Phase 3: 驗證與文件**
    - [x] 使用 `agent-browser` 進行多尺寸模擬測試。
    - [x] 更新 `ROADMAP.md` 狀態。

# 📋 任務清單：SDK 導向的分發與模組純化

## 🎯 目標
將 `lib/` 服務轉化為獨立、可由外部 URL 直接引用（CDN 風格）的工業級原生模組。

## 🛠 任務分解
- [x] **Phase 1: 服務純化與解耦**
    - [x] 檢視並修修核心服務，確保不依賴內部全域變數。
    - [x] 實作 `lib/vanilla-sdk.js` 作為統一入口。
- [x] **Phase 2: 外部引用範例**
    - [x] 實作 `sdk-demo.html` 展示外部引用。
    - [x] 在 `Lab.js` 補充教學重點。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/sdk-usage.md` 教學文件。
    - [x] 建立 `ADR 0051: SDK 導向的分發策略`。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。

# 📋 任務清單：WebAssembly (Wasm) 整合

## 🎯 目標
展示如何在不依賴建置工具的情況下，原生加載並執行高效能的 WebAssembly 模組。

## 🛠 任務分解
- [x] **Phase 1: 基礎服務與模組管理**
    - [x] 實作 `lib/wasm-service.js`。
    - [x] 支援 `instantiateStreaming` 流式加載。
    - [x] 實作內建二進位示範邏輯。
- [x] **Phase 2: 教學範例 (Lab)**
    - [x] 在 `Lab.js` 新增「高效能運算 (Wasm)」單元。
    - [x] 實作 Wasm 運算示範。
- [x] **Phase 3: 教學與文件**
    - [x] 撰寫 `docs/webassembly.md` 教學文件。
    - [x] 更新 `Docs.js` 與 `ROADMAP.md`。
