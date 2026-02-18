# ADR 0045: 次世代 WebGPU 運算與渲染架構

## 上下文
WebGL 已逐漸邁入成熟與穩定期，但隨著 WebGPU 的正式推出，瀏覽器現在可以發揮顯示卡的現代特性（如 Compute Shaders、Render Pipelines）。作為現代原生標準的展示者，我們需要一個前瞻性的範例。

## 決策
1.  **採用 WebGPU 核心**: 直接操作 `navigator.gpu` 提供的底層 API。
2.  **GPU 計算 (Compute Shader)**: 展示如何利用 GPU 進行大量併行計算（如物理粒子系統），這在以前的 WebGL 時代極難實現。
3.  **效能對比**: 提供一個同時具備 Canvas 2D、WebGL 與 WebGPU 三種渲染模式的實驗單元，對比各技術的效能表現。

## 狀態
**Accepted (2026-02-18)**

## 實作備註
已實作 `webgpu-service.js` 並整合至實驗室，提供 Compute Shader 運算範例。

## 後果
- **優點**: 展示了瀏覽器在處理 GPU 密集型任務時的最高水準。
- **優點**: 體現了原生 Web API 對於未來視覺技術的長期兼容與前瞻。
- **缺點**: 目前僅在 Chromium 等最新穩定版瀏覽器中完整支援。
- **缺點**: WebGPU API 複雜度極高，對初學者門檻顯著提升。
