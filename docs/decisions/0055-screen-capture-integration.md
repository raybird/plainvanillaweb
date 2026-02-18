# ADR 0055: 原生螢幕錄製與串流整合 (Screen Capture API)

## 上下文
在遠端協作與內容創作日益普及的今天，網頁應用程式直接擷取使用者螢幕、視窗或分頁畫面的能力變得至關重要。傳統上這需要安裝瀏覽器擴充功能或桌面軟體，但現代瀏覽器已透過 `Screen Capture API` 提供了標準化的解決方案。

## 決策
1.  **實作 ScreenShareService**: 封裝 `navigator.mediaDevices.getDisplayMedia`，提供簡單的 Promise-based 介面來啟動螢幕分享。
2.  **整合 MediaRecorder**: 結合 `MediaStream Recording API`，實作將擷取到的串流錄製為 `.webm` 或 `.mp4` 影片檔案的功能。
3.  **實驗室展示**: 在 Lab 中提供「螢幕錄影機」範例，支援即時預覽、錄製控制與影片下載。

## 後果
- **優點**: 無需任何插件即可實現專業級的螢幕錄製功能。
- **優點**: 產生的 MediaStream 可直接與 WebRTC 結合，實現螢幕共享通話。
- **缺點**: 瀏覽器對此 API 的權限控制極為嚴格，必須由使用者手動觸發且每次都需重新授權。
- **缺點**: 行動裝置瀏覽器對 `getDisplayMedia` 的支援度目前仍然有限。
