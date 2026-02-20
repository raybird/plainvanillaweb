# ADR 0082: 原生影像工作室 (Native Image Studio) 整合

## 狀態

已接受 (Accepted)

## 背景

`plainvanillaweb` 旨在展示網頁原生的強大能力。影像處理通常依賴如 `fabric.js` 或 `canvas-filters` 等外部庫。透過 Canvas API 和最新的 `CompressionStream` (或 Canvas toBlob)，我們可以實現高效、零依賴的影像處理工作流。

## 決策

建立一個整合式的影像處理服務與實驗室頁面。

1.  **服務擴展**：增強 `lib/image-service.js`，利用 `CanvasRenderingContext2D` 實作常見濾鏡與幾何變換。
2.  **效能優先**：使用 `OffscreenCanvas` (如果支援) 進行背景處理，避免阻塞 UI 執行緒。
3.  **格式轉換**：支援將圖片轉換為 WebP 格式並進行品質壓縮。
4.  **三位一體同步**：建立 `ImageStudioPage.js` 實作頁面，並與 `native-image-processing.md` 技術手冊建立雙向連結。

## 後果

- **優點**：展示網頁原生 API 在多媒體處理上的成熟度，大幅減少前端專案對第三方影像庫的依賴。
- **缺點**：對於極大型圖片（如 8K 以上），純 Canvas 處理可能面臨記憶體限制與效能瓶頸。
