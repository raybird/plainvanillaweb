# ADR 0086: 原生效能儀表板 (Performance Dashboard) 整合

## 狀態
已接受 (Accepted)

## 背景
`plainvanillaweb` 致力於展現原生 Web 技術的極限。雖然專案已具備 `PerformanceService`，但缺乏一個直觀的實驗室頁面來展示 Web Vitals (LCP, CLS, FID) 與頁面加載指標的實時監控。

## 決策
建立一個專屬的效能實驗室頁面，整合 Web Performance API 與視覺化監控。
1. **指標可視化**：整合 `PerformanceService` 的數據，以動態圖表或儀表板形式展示。
2. **Web Vitals 監控**：即時顯示 Largest Contentful Paint (LCP) 與 Cumulative Layout Shift (CLS)。
3. **加載流程拆解**：展示 DNS 查詢、TCP 連線、DOM 解析等細項耗時。
4. **三位一體同步**：建立 `PerformancePage.js`，撰寫 `web-performance.md` 文檔，並更新導覽系統。

## 後果
- **優點**：向開發者展示如何在不使用第三方套件的情況下，構建精準的效能監控工具。
- **缺點**：部分進階指標（如 FID 的繼任者 INP）在部分環境下需要使用者互動才能觸發。
