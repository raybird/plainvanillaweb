# 🎨 原生佈局範式 (Layout & Responsive Guide)

`plainvanillaweb` 不使用 Tailwind 或 Bootstrap。我們利用現代 CSS 的原生特性（CSS Variables, Flex/Grid, Media Queries）建構了一套極具靈活性且高性能的佈局系統。

---

## 🏗️ 全域佈局架構

所有頁面均被包裹在 `.app-container` 內。側邊欄 `.navbar` 以 `position: fixed` 固定在左側，主內容區 `main#main-content` 以 `margin-left: var(--nav-width)` 讓出側邊欄的寬度，內容最大寬度統一為 900px。

```css
/* index.css 核心佈局 */
:root {
  --nav-width: 260px;
}

.app-container {
  display: flex;
  min-height: 100vh;
}

.navbar {
  width: var(--nav-width);
  height: 100vh;
  position: fixed; /* 固定在左側，不參與 flex 排列 */
  left: 0;
  top: 0;
}

main#main-content {
  flex: 1;
  margin-left: var(--nav-width); /* 讓出側邊欄的寬度 */
  width: calc(100% - var(--nav-width));
  padding: 3rem 2.5rem;
}

main#main-content>* {
  max-width: 900px; /* 內容最大寬度 */
  margin-left: auto;
  margin-right: auto;
}
```

---

## ⚡ CSS 變數驅動 (Themed Design)

我們透過 `:root` 定義語意化變數，並在 `[data-theme="dark"]` 中覆寫同名變數，實現系統級的風格統一與主題切換。

```css
/* index.css（節錄） */
:root {
  --primary-color: #2563eb;
  --bg-color: #ffffff;
  --text-color: #1e293b;
  --spacing-unit: 1rem;
  --border-radius: 10px;
}

[data-theme="dark"] {
  --bg-color: #0a0f1a;
  --text-color: #e2e8f0;
  --primary-color: #60a5fa;
}

/* 組件中使用（示意） */
.card {
  background: var(--bg-color);
  padding: calc(var(--spacing-unit) * 1.5);
  border-radius: var(--border-radius);
}
```

---

## 📱 響應式策略 (Responsive Standards)

### 1. 字級調整 (Typography)
本專案 `body` 固定 `font-size: 16px`，在 768px 以下以 Media Query 縮小標題字級。

```css
body {
  font-size: 16px;
}

@media (max-width: 768px) {
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.3rem; }
  h3 { font-size: 1.1rem; }
}
```

若需要文字隨視窗寬度連續縮放，可改用 `clamp()`，例如 `font-size: clamp(16px, 2vw, 18px);`（最小 16px、最大 18px）。

### 2. 佈局轉換 (Layout Flipping)
在 1024px 以下，側邊欄 `.navbar` 以 `transform: translateX(-100%)` 隱藏，改由漢堡按鈕開啟；768px 以下，文件導覽 `.docs-nav` 改為全寬、最高 300px 的可捲動區塊，排在內容上方。

```css
@media (max-width: 1024px) {
  .navbar {
    transform: translateX(-100%); /* 收進畫面左側 */
    width: 280px;
  }

  .navbar.open {
    transform: translateX(0); /* 漢堡按鈕開啟 */
  }

  main#main-content {
    margin-left: 0; /* 側邊欄不再佔位 */
    padding: 1.25rem;
    padding-top: 4.5rem;
  }

  .hamburger-btn {
    display: flex;
  }
}

@media (max-width: 768px) {
  .docs-nav {
    width: 100% !important;
    position: static !important;
    max-height: 300px;
    overflow-y: auto;
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
