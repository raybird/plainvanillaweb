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
