# 漸進式網頁應用 (PWA)

Plain Vanilla Web 是一個完全符合 PWA 標準的應用程式，提供接近原生 App 的使用者體驗。

## 關鍵技術

### 1. Web App Manifest (`manifest.json`)
定義了應用程式的名稱、圖示、啟動模式 (Standalone) 與主題色。這讓應用程式可以被「安裝」到使用者的桌面或手機主畫面。

### 2. Service Worker (`sw.js`)
我們實作了一個 **Stale-While-Revalidate** 策略的 Service Worker：
*   **離線優先**: 攔截所有同源請求，優先從 Cache API 回傳快取內容，確保在無網路環境下秒開。
*   **背景更新**: 在回傳快取的同時，於背景發起網路請求以更新快取，確保使用者下次訪問時能看到最新內容。
*   **App Shell 模型**: 預先快取核心資源 (`index.html`, `App.js`, CSS)，構建穩定的應用程式外殼。

## 註冊邏輯
在 `index.js` 中，我們採用非阻塞的方式註冊 Service Worker：

```javascript
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js');
    });
}
```
