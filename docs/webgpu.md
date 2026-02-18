# 原生 WebGPU 運算 (WebGPU Integration)

WebGPU 是 WebGL 的繼承者，它提供了更接近底層顯示卡 (GPU) 的存取能力，支援強大的圖形渲染與通用計算 (GPGPU)。

## 1. 為什麼選擇 WebGPU？

相對於 WebGL，WebGPU 具備以下優勢：
- **高效能**：更少的 CPU 開銷與更好的多執行緒支援。
- **Compute Shader**：原生支援通用計算，讓 GPU 不僅能畫圖，還能處理複雜數學運算。
- **現代 API**：採用類似 Vulkan、Metal 與 Direct3D 12 的現代架構。

## 2. 核心概念

在 WebGPU 中，您需要處理以下對象：
1.  **GPUAdapter**：代表實體顯卡。
2.  **GPUDevice**：代表與顯卡的邏輯連接。
3.  **ComputePipeline**：定義計算任務的管線。
4.  **WGSL (WebGPU Shading Language)**：專為 WebGPU 設計的 Shader 語言。

## 3. 本專案的實踐

在「實驗室 (Lab)」中，我們展示了：
1.  **可用性偵測**：檢查使用者瀏覽器是否具備次世代圖形能力。
2.  **Compute Shader 範例**：利用 GPU 同時處理 100 萬筆數據的運算，展示併行計算的驚人速度。
3.  **零依賴整合**：完全不使用 Three.js 等外部庫，直接操作 `navigator.gpu`。

## 4. 注意事項

- **安全上下文**：與 Web Crypto 一樣，WebGPU 僅在 HTTPS 或 localhost 下運作。
- **瀏覽器支援**：目前主要在 Chrome、Edge 等 Chromium 系瀏覽器中穩定支援，其餘瀏覽器正陸續實作中。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
