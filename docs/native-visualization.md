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
const y = chartHeight - ((val - min) / (max - min) * chartHeight);
```

### 2. 路徑生成 (Bezier Curves)
利用 SVG 的 `C` (Curveto) 指令，可以將直線連接轉化為平滑的貝茲曲線。
```javascript
// 生成 M (MoveTo) 與 C (CurveTo) 路徑數據
const path = points.map(p => `C ${cp1x},${cp1y} ...`).join(' ');
```

### 3. 反應式更新
當組件偵測到 `data` 屬性改變時，會重新計算 `points` 並更新 `<path>` 的 `d` 屬性。由於我們在 CSS 中設定了 `transition: d 0.5s`，瀏覽器會自動補插路徑點，呈現流暢的變形效果。

## 🎓 學習成果
您可以在 **「儀表板 (Dashboard)」** 頁面看到即時監控趨勢圖的實作效果。它展示了原生 Web 技術在處理複雜 UI 互動時的優雅與高效。
