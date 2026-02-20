# ADR 0057: 原生背景抓取 (Background Fetch) 整合

## 狀態
Accepted

## 上下文
在現代漸進式網頁應用 (PWA) 中，使用者經常需要下載或上傳大型檔案（如離線影片、遊戲資產、備份數據）。然而，傳統的 `fetch` API 受限於頁面生命週期，一旦分頁關閉或瀏覽器被系統回收，傳輸便會中斷，導致使用者體驗不佳且浪費頻寬。

## 決策
我們決定在 `VanillaSDK` 中整合 **Background Fetch API**。

1.  **服務封裝**：在 `PWAService` (或 `BackgroundFetchService`) 中封裝 `registration.backgroundFetch.fetch()` 接口。
2.  **Service Worker 擴充**：在 `sw.js` 實作 `backgroundfetchsuccess`、`backgroundfetchfail` 與 `backgroundfetchclick` 事件監聽器。
3.  **自動化快取管理**：下載成功後，資源將由 Service Worker 自動存入 Cache Storage，確保離線可用性。
4.  **教學示範**：建立 `PWAAdvancedPage` 展示背景下載、進度監控與斷線恢復能力。

## 後果
- **優點**：
    - 大幅提升大型資源傳輸的可靠性。
    - 減少使用者對「保持分頁開啟」的心理負擔。
    - 整合系統級通知列進度條，提升 App 質感。
- **缺點**：
    - 瀏覽器支援度目前僅限於 Chromium 核心。
    - 增加 Service Worker 邏輯複雜度。
