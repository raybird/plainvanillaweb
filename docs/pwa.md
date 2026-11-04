# 漸進式網頁應用 (PWA)

Plain Vanilla Web 是一個完全符合 PWA 標準的應用程式，提供接近原生 App 的使用者體驗。

## 關鍵技術

### 1. Web App Manifest (`manifest.json`)
定義了應用程式的名稱、圖示、啟動模式 (Standalone) 與主題色。這讓應用程式可以被「安裝」到使用者的桌面或手機主畫面。

### 2. Service Worker (`sw.js`)
我們實作了一個 **網路優先 (Network First)** 策略的 Service Worker（決策見 [ADR 0097](./decisions/0097-network-first-sw-versioning.md)）：
*   **上線時永遠最新**: 攔截所有同源 GET 請求，一律先向伺服器驗證（`cache: 'no-cache'`，檔案沒變時只回 304），同一次載入的 HTML 與 JS 必定屬於同一版。
*   **離線回退**: 網路失敗時才改用 Cache API 裡的快取；任何頁面導覽都能回退到 `index.html`。
*   **App Shell 模型**: 安裝時預先快取核心資源 (`index.html`, `App.js`, CSS)，其餘檔案在瀏覽過後寫入快取，供離線使用。
*   **自動版本號**: `CACHE_NAME` 由 `scripts/update-sw-version.js` 依網站檔案內容的雜湊產生，檔案一變 `sw.js` 就跟著變，瀏覽器會安裝新版並清掉舊快取；CI 會檢查兩者一致。

## 註冊邏輯
在 `index.js` 中，我們採用非阻塞的方式註冊 Service Worker：

```javascript
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js');
    });
}
```
