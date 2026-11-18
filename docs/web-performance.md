# ⏱️ 原生效能監控 (Web Performance API)

現代 Web 開發中，效能即是生命。Web Performance API 讓開發者能以微秒級的精度監控應用的運行狀況。

## 🌟 核心 API

### 1. Web Vitals 監控
利用 <code>PerformanceObserver</code> 監聽關鍵性能事件：
- **LCP (Largest Contentful Paint)**: 頁面主要內容載入時間。
- **CLS (Cumulative Layout Shift)**: 頁面佈局的穩定性。
- **Event Timing**：只計算有互動識別碼的事件，顯示可觀測的最慢互動。

CLS 取整個瀏覽期間分數最高的位移時間窗。效能頁顯示目前文件的觀測值，缺少資料時顯示「未取得」。最慢觀測互動與正式 INP 的彙整方式不同。SDK 的 `fid` 欄位保留，供既有呼叫端讀取。

### 2. Navigation Timing
分析頁面加載的各個階段，精確定位瓶頸（是 DNS 慢、伺服器慢還是 DOM 太重）。

```javascript
const nav = performance.getEntriesByType('navigation')[0];
const dnsTime = nav.domainLookupEnd - nav.domainLookupStart;
```

## 🛠️ 實作策略
在 Vanilla 專案中，我們建立了 `PerformanceService` 單例，全局監聽性能指標並透過事件系統通知 UI 進行更新。

## 🎓 學習成果
進入 **「實驗室 (Lab)」** 中的 **「效能監控」** 單元，您可以即時看到當前分頁的加載拆解圖與 Web Vitals 指標。
