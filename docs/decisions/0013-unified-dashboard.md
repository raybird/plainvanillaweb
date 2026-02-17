# ADR 0013: 整合開發者儀表板 (Unified Developer Dashboard)

## 上下文
隨著專案功能日益複雜（引入 Store, Web Worker, IndexedDB），開發者需要一個統一的介面來監控這些子系統的運行狀態。原有的 Dashboard 僅具備基本的跳轉與單一功能測試，缺乏全局可觀測性。

## 決策
將 `Dashboard` 組件重構為 **「全功能開發者儀表板 (Interactive DevTools Panel)」**。
1.  **即時指標 (Live Metrics)**：直接從 `IDBService` 獲取數據庫統計，並透過 `performance.memory` 監控記憶體使用量。
2.  **狀態檢視 (State Inspection)**：提供 `appStore` 全域狀態的即時 JSON 視圖，取代傳統的 `console.log` 除錯方式。
3.  **互動控制 (Interactive Control)**：集成各個子系統的操作入口（如清除快取、觸發運算），便於進行集成測試。

## 後果
- **優點**: 大幅提升開發體驗 (DX)，能直觀地看到各個 Vanilla 模組的協同工作狀況。
- **優點**: 作為一個綜合範例，向學習者展示如何將多個原生 API 整合在同一個 UI 中。
- **缺點**: Dashboard 組件的程式碼複雜度增加，引入了更多的內部狀態管理。
