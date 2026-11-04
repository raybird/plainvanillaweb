# 📊 原生數據可視化 (Native Data Visualization)

本單元展示如何在不依賴任何第三方庫（如 Chart.js 或 D3）的情況下，僅使用原生 **SVG**、**CSS Transitions** 與基礎數學計算，實作具備工業級表現的動態圖表。

## 🌟 為什麼選擇 SVG 而非 Canvas？

雖然 `Canvas` 在處理數萬個點時效能較佳（如我們的 Analytics Hub），但 `SVG` 在數據可視化方面有其獨特優勢：
1.  **CSS 動畫整合**：可以直接對 SVG 路徑 (`<path>`) 應用 `transition`，實現數據更新時的平滑過渡。
2.  **DOM 屬性存取**：每個數據點都是一個 DOM 元素，易於綁定事件（如 Hover 提示）與輔助功能 (A11y)。
3.  **無損縮放**：作為向量圖，在任何解析度下都能保持清晰。

## 🛠️ 核心實作原理

### 1. 座標縮放 (Linear Scaling)
我們需要將原始數據（如 0 到 100）轉換為 SVG 畫布座標（如 40px 到 260px）。
```javascript
// height = 300、padding = 40，可繪區高度為 height - padding * 2
const chartHeight = height - padding * 2;
const y = height - padding - ((val - min) / (max - min) * chartHeight);
```

### 2. 路徑生成 (Bezier Curves)
利用 SVG 的 `C` (Curveto) 指令，可以將直線連接轉化為平滑的貝茲曲線。
```javascript
// 生成 M (MoveTo) 與 C (CurveTo) 路徑數據，控制點 x 取兩點中點
const path = points.reduce((d, p, i, a) => {
    if (i === 0) return `M ${p.x},${p.y}`;
    const prev = a[i - 1];
    const cpx = prev.x + (p.x - prev.x) / 2;
    return d + ` C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
}, '');
```
完整實作見 `lib/chart-service.js` 的 `getPoints()` 與 `generateSmoothPath()`。

### 3. 反應式更新
Dashboard 的資料改變時會重新輸出 `<x-chart data="...">`，元件重新計算 `points` 並產生新的 `<path>`。CSS 中雖設定了 `transition: d 0.5s`，但自訂元素在 DOM morph 時一律重建，每次更新拿到的都是全新的 `<path>`，沒有舊的 `d` 值可供補插，因此目前圖表是直接切換到新形狀，不會產生變形動畫。若要平滑變形，需讓元件監聽 `data` 屬性並就地更新既有 `<path>` 的 `d`。

## 🎓 學習成果
您可以在 **「儀表板 (Dashboard)」** 頁面看到即時監控趨勢圖的實作效果。它展示了原生 Web 技術在處理複雜 UI 互動時的優雅與高效。
