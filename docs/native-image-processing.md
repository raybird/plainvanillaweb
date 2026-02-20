# 🎨 原生影像處理 (Native Image Processing)

現代瀏覽器透過 Canvas API 和最新的硬體加速濾鏡，已具備在不依賴第三方庫（如 Fabric.js）的情況下進行高效影像處理的能力。

## 🌟 為什麼選擇原生處理？

1.  **隱私優先**：所有影像處理皆在客戶端（瀏覽器）完成，圖片數據完全無需上傳至伺服器。
2.  **極致效能**：利用 <code>ctx.filter</code> 可以調用設備的硬體加速來渲染濾鏡效果。
3.  **零依賴**：大幅減少專案體積，避免大型影像處理庫帶來的載入負擔。

## 🛠️ 核心實作原理

### 1. 硬體加速濾鏡
Canvas 2D 環境支援 CSS 風格的濾鏡語法：
```javascript
const ctx = canvas.getContext('2d');
ctx.filter = 'grayscale(100%) sepia(50%) brightness(120%)';
ctx.drawImage(imageElement, 0, 0);
```

### 2. 圖片壓縮與格式轉換
利用 <code>canvas.toBlob</code> 或 <code>canvas.toDataURL</code> 可以輕鬆將圖片轉換為 WebP 格式並控制品質：
```javascript
canvas.toBlob((blob) => {
  // 得到壓縮後的 WebP Blob
}, 'image/webp', 0.8); // 0.8 代表 80% 品質
```

### 3. 使用 OffscreenCanvas (進階)
對於效能要求更高的場景，可以使用 <code>OffscreenCanvas</code> 在 Web Worker 中進行處理，避免阻塞主執行緒。

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面進入 **「影像工作室」** 單元，體驗即時上傳、濾鏡調整與壓縮下載的完整流程。
