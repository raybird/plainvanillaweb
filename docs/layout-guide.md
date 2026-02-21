# 🎨 原生佈局範式 (Layout & Responsive Guide)

`plainvanillaweb` 不使用 Tailwind 或 Bootstrap。我們利用現代 CSS 的原生特性（CSS Variables, Flex/Grid, Clamp）建構了一套極具靈活性且高性能的佈局系統。

---

## 🏗️ 全域佈局架構

所有頁面均被包裹在 `.app-container` 內，實現一致的間距與最大寬度控制。

```css
/* index.css 核心佈局 */
.app-container {
  display: flex;
  min-height: 100vh;
  flex-direction: row; /* 桌機預設：側邊欄 + 內容 */
}

main#main-content {
  flex: 1;
  padding: 2rem;
  min-width: 0; /* 防止內容溢出破壞 flex 佈局 */
}
```

---

## ⚡ CSS 變數驅動 (Themed Design)

我們透過 `:root` 定義語意化變數，實現系統級的風格統一與主題切換。

```css
:root {
  --bg-color: #ffffff;
  --text-color: #333333;
  --primary-color: #007bff;
  --spacing-unit: 1rem;
}

/* 組件中使用 */
.card {
  background: var(--bg-color);
  padding: calc(var(--spacing-unit) * 1.5);
  border-radius: var(--border-radius);
}
```

---

## 📱 響應式策略 (Responsive Standards)

### 1. 流體字體 (Fluid Typography)
利用 `clamp()` 確保文字在手機與桌機間無縫縮放，無需頻繁使用 Media Queries。

```css
body {
  /* 最小值 16px，隨視窗寬度縮放，最大值 18px */
  font-size: clamp(16px, 2vw, 18px);
}
```

### 2. 佈局轉換 (Layout Flipping)
在手機版（1024px 以下），側邊欄自動轉換為漢堡選單或平鋪模式。

```css
@media (max-width: 768px) {
  .app-container {
    flex-direction: column; /* 垂直堆疊 */
  }
  
  /* 導覽平鋪策略 */
  .docs-nav ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
}
```

---

## 🛠️ 實作 Pattern：響應式卡片網格

```javascript
render() {
    return html`
        <style>
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 1.5rem;
            }
        </style>
        <div class="grid">
            <div class="card">...</div>
            <div class="card">...</div>
        </div>
    `;
}
```

## 💡 最佳實踐

1.  **優先使用 CSS 屬性選擇器**: 例如 `[data-theme="dark"]` 優於修改 Class 名稱。
2.  **避免魔術數字**: 間距與邊距應盡量引用 `--spacing-unit` 變數及其倍數。
3.  **善用 Aspect Ratio**: 對於圖片與影片容器，使用 `aspect-ratio` 屬性優於手動計算內邊距。
