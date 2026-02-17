# ADR 0027: 原生性能監控服務 (Native Performance Monitoring Service)

## 上下文
為了進一步提升應用的專業性與可觀測性，開發者需要了解應用的實際運行效能，特別是 Core Web Vitals 指標。在無框架環境中，手動收集這些數據往往需要撰寫複雜的 `performance` 呼叫。

## 決策
實作 `PerformanceService`，利用現代瀏覽器提供的 **`PerformanceObserver`** API。
1.  **關鍵指標監控**: 自動偵測並記錄 `largest-contentful-paint` (LCP), `layout-shift` (CLS), 與 `first-input` (FID)。
2.  **加載時間分析**: 整合 `navigation` timing 以獲取精確的頁面載入總時長。
3.  **即時事件廣播**: 透過繼承 `BaseService`，在指標更新時即時廣播事件，讓 UI (如 Dashboard) 能自動反映最新狀態。
4.  **零入侵設計**: 監控邏輯完全獨立於業務組件，對應用效能影響降至最低。

## 後果
- **優點**: 提供真實用戶視角的效能數據，有助於精確定位優化點。
- **優點**: 作為教學範例，展示了瀏覽器原生性能 API 的進階用法。
- **缺點**: 部分較舊的瀏覽器可能不支援某些觀測類型，需在實作中加入適當的 try-catch 防護。
