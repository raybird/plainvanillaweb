# ADR 0020: 網路請求監控器 (Network Monitor)

## 上下文
為了增強專案的教育意義與開發體驗 (DX)，我們需要一種機制來讓開發者直觀地看到應用程式發出的 API 請求、狀態與效能數據，類似瀏覽器的 DevTools Network 面板。

## 決策
1.  **Monkey Patching**: 實作 `NetworkMonitor` 服務，透過覆寫全域 `window.fetch` 來攔截所有請求。
    *   在請求前後記錄時間戳記，計算 Duration。
    *   保留原始 `fetch` 行為，確保業務邏輯不受影響。
2.  **事件驅動**: 監控器繼承自 `BaseService`，當有新請求或清除操作時發送事件。
3.  **UI 整合**: 在 Dashboard 中新增專屬面板，訂閱監控器的事件並即時渲染日誌列表。

## 後果
- **優點**: 提供即時、可視化的 API 互動反饋，對於學習 Fetch API 與除錯非常有幫助。
- **優點**: 完全獨立於業務邏輯，可隨時開啟或關閉。
- **缺點**: Monkey Patching 是一種侵入式做法，若未小心處理可能破壞全域環境（但在本專案受控環境下是安全的）。
- **缺點**: 僅支援 `fetch`，無法攔截 `XMLHttpRequest` (XHR)（但本專案不使用 XHR）。
