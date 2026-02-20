# 📥 原生背景抓取 (Background Fetch API)

本專案利用瀏覽器內建的 **Background Fetch API** 實作了穩定、可靠的大型文件下載與上傳功能。即使使用者關閉分頁或瀏覽器，下載任務仍能在系統背景持續進行。

## 🚀 核心概念

傳統的 `fetch` 或 `XMLHttpRequest` 在頁面關閉時會被中斷。**Background Fetch** 解決了這個問題：
1.  **持久性**：任務由作業系統（透過 Service Worker）接管，不受頁面生命週期限制。
2.  **使用者介面**：瀏覽器會顯示系統級的下載進度條，使用者可以隨時查看或取消。
3.  **可靠性**：支援自動重試與網路切換（如從 Wi-Fi 切換到 4G）。

## 🛠️ 實作細節

我們將此功能整合在 `PWAService` 中，簡化了與 Service Worker 的互動流程。

### 1. 發起背景下載

```javascript
import { pwaService } from './lib/pwa-service.js';

// 要下載的資源清單
const urls = [
    './assets/large-video.mp4',
    './assets/app-data.json'
];

try {
    const bgFetch = await pwaService.fetch('my-movie-download', urls, {
        title: '正在下載高畫質影片...',
        icons: [{ src: './assets/icon.png', sizes: '192x192', type: 'image/png' }],
        downloadTotal: 100 * 1024 * 1024 // 預估總大小
    });
    
    console.log('下載已啟動！');
} catch (err) {
    console.error('發起失敗:', err.message);
}
```

### 2. 監聽進度與結果

您可以監聽 `pwaService` 發出的事件來更新 UI：

```javascript
pwaService.on('fetch-progress', ({ id, percent }) => {
    console.log(`任務 ${id} 進度: ${percent}%`);
});

pwaService.on('fetch-success', ({ id }) => {
    console.log(`任務 ${id} 下載完成！`);
});
```

## ⚠️ 技術限制

- **HTTPS 要求**：僅支援安全加密連線（Secure Context）。
- **瀏覽器支援**：目前主要由 Chrome, Edge 與 Android 瀏覽器支援。
- **資產管理**：下載完成後，資源會自動存入 **Cache Storage**，開發者需在 Service Worker 的 `backgroundfetchsuccess` 事件中進行後續處理。

## 🧪 實驗室 Demo

前往 **[PWA 進階實驗室](#/lab/pwa-advanced)** 體驗背景抓取：
- 模擬下載大型虛擬資源。
- 嘗試關閉分頁，觀察系統通知列的下載進度。
- 重新開啟頁面，查看資源是否已成功存入快取。
