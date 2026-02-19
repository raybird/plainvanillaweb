# ADR 0067: 引入原生 Barcode Detection API 支援

## 狀態
已提議 (Proposed)

## 背景
`plainvanillaweb` 持續探索網頁與實體世界的交互。掃描 QR Code 與條碼是行動應用程式最常見的需求之一。以往這需要引入如 `jsQR` 等大型函式庫，但現代瀏覽器已開始提供原生的 `BarcodeDetector` API，能利用硬體加速大幅提升辨識速度。

## 決策
實作基於 `BarcodeDetector` 的服務模組。
1. **安全性考量**：掃碼涉及攝像頭存取，必須在 Secure Context (HTTPS) 下執行。
2. **多格式支援**：預設啟用常用的格式（QR_CODE, EAN_13, CODE_128）。
3. **效能優化**：結合 `requestAnimationFrame` 進行低延遲的循環檢測。
4. **相容性處理**：針對不支援的環境（如 Safari）提供友好的提示。

## 後果
- **優點**：極致的效能、零額外套件體積、支援多種工業標準條碼。
- **缺點**：目前僅在 Chromium 系瀏覽器支援，在其他系統需提示使用者使用 Chrome/Edge。
