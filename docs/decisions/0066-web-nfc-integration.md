# ADR 0066: 引入原生 Web NFC API 支援

## 狀態
已提議 (Proposed)

## 背景
`plainvanillaweb` 持續探索網頁與實體硬體的交互能力。NFC (Near Field Communication) 是一種短距離無線通訊技術，廣泛應用於標籤識別與數據交換。整合 Web NFC 將解鎖網頁應用在行動端（主要是 Android）與實體標籤通訊的可能性。

## 決策
實作基於 `NDEFReader` 的服務模組。
1. **安全性考量**：Web NFC 要求 HTTPS 安全上下文，且讀寫操作必須由使用者手動觸發。
2. **數據處理**：解析 NDEF (NFC Data Exchange Format) 訊息，支援 Text 與 JSON 格式的讀寫。
3. **錯誤處理**：針對設備不支援或權限遭拒的情況提供友好的 UI 回饋。

## 後果
- **優點**：使網頁具備讀取實體標籤內容與寫入數據的能力，大幅擴展物聯網應用情境。
- **缺點**：目前僅在 Android 設備上的部分瀏覽器（如 Chrome for Android）支援，在桌面端或其他系統需提供相容性降級提示。
