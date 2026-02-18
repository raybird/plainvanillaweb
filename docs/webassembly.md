# 原生 WebAssembly 整合 (WebAssembly Integration)

WebAssembly (Wasm) 是一種可以在現代網頁瀏覽器中執行的二進位指令格式。它旨在提供近乎原生的執行速度，並與 JavaScript 協同工作。

## 1. 為什麼需要 WebAssembly？

JavaScript 雖然非常快，但在處理以下任務時仍有侷限：
- **重度數值運算**：物理引擎、3D 渲染。
- **複雜影像處理**：即時濾鏡、影片轉碼。
- **現有代碼復用**：將 C++、Rust 或 Go 編譯為網頁可用的格式。

## 2. 如何加載 Wasm？

現代瀏覽器推薦使用 `instantiateStreaming` 進行流式加載，這樣可以在下載的同時進行編譯。

```javascript
async function loadWasm(url) {
    const { instance } = await WebAssembly.instantiateStreaming(
        fetch(url)
    );
    // 呼叫 Wasm 導出的函數
    return instance.exports;
}
```

## 3. 本專案的實踐

在我們的「實驗室 (Lab)」中，我們展示了：
1.  **內嵌二進位碼**：展示即使沒有伺服器，也能透過 `Uint8Array` 直接載入 Wasm 指令。
2.  **JS 互操作性**：從 JS 傳遞參數給 Wasm 並獲取回傳值。
3.  **零建置工作流**：證明了在不使用任何打包工具的情況下，依然能運用 Web 最強大的計算技術。

## 4. 進階建議

- **Web Worker 協同**：建議將複雜的 Wasm 運算放在 Worker 中，避免阻塞 UI 執行緒。
- **記憶體共享**：利用 `WebAssembly.Memory` 在 JS 與 Wasm 間共享大數據塊。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
