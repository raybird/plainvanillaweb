# ADR 0061: 引入原生 Web Serial API 支援

## 狀態
已提議 (Proposed)

## 背景
隨著現代瀏覽器能力的提升，網頁不再侷限於沙盒內的數據交換。為了支援更廣泛的工業與 IoT 情境，`plainvanillaweb` 需要一種方式來與透過 USB 或藍牙虛擬序列埠連接的硬體進行通訊。

## 決策
實作基於 `Web Serial API` 的服務模組。
1. **安全性考量**：由於 Serial API 涉及硬體存取，必須在 Secure Context (HTTPS) 下執行，且連線必須由使用者手動觸發（User Gesture）。
2. **串流處理**：採用 Web Streams API (`ReadableStream`, `WritableStream`) 進行數據處理，確保大數據量傳輸時不阻塞主線程。
3. **介面設計**：提供 `read` 與 `write` 的簡化介面，內建常用的 `TextEncoder/Decoder` 轉換。

## 後果
- **優點**：解鎖網頁與實體世界的通訊能力，無需安裝驅動程式或中介軟體。
- **缺點**：目前主要由 Chromium 系瀏覽器支援，在其他環境下需要提供友好的不支援提示。
