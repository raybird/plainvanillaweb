# ADR 0044: WebAssembly (Wasm) 整合策略

## 上下文
雖然 JavaScript 效能已大幅提升，但在執行重度數值運算（如物理引擎、加密、複雜影像處理）時，原生機器碼級別的效能仍具優勢。為了展示 Vanilla Web 的極限，我們需要一種在不依賴 Webpack/Rust-Bundler 等工具鏈的前提下，動態載入並執行 Wasm 的方案。

## 決策
1.  **動態載入**: 採用 `WebAssembly.instantiateStreaming(fetch(url))` 直接流式編譯並載入 Wasm 模組。
2.  **與 Worker 協同**: Wasm 模組應優先於 Web Worker 中運行，避免複雜運算阻塞 UI 渲染。
3.  **零建置接口**: 展示如何透過標準的 JavaScript TypedArrays (Uint8Array 等) 與 Wasm 記憶體進行數據交換。

## 狀態
**Accepted (2026-02-18)**

## 實作備註
已建立 `wasm-service.js` 並整合至 `Lab.js` 進行示範。

## 後果
- **優點**: 實現了網頁應用的「計算力跨越」，證明了原生標準具備承載高效能軟體的能力。
- **優點**: 展示了 WebAssembly 與傳統 JS 模組生態的無縫互操作性。
- **缺點**: Wasm 的調試與二進位數據處理門檻較高（需透過教學文件簡化說明）。
