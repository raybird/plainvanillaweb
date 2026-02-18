# PWA 進階功能：安裝與背景同步

PWA 的強大之處在於它能打破瀏覽器的界限，提供接近原生應用程式的安裝體驗與背景處理能力。

## 1. 自定義安裝引導 (Custom Install UI)

預設情況下，瀏覽器會自行決定何時顯示安裝提示。透過監聽 `beforeinstallprompt` 事件，我們可以接管這個流程。

```javascript
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // 顯示您自己的「安裝按鈕」
    showMyInstallBtn();
});

// 當按鈕被點擊時
async function onInstallClick() {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`使用者選擇: ${outcome}`);
}
```

## 2. 背景同步 (Background Sync)

`Background Sync` API 允許您的應用程式在斷網時將操作記錄下來，並在網路恢復後自動在背景執行，即使頁面已經關閉。

### 註冊同步任務
```javascript
const registration = await navigator.serviceWorker.ready;
await registration.sync.register('my-tag');
```

### 在 Service Worker 中處理
```javascript
self.addEventListener('sync', (event) => {
    if (event.tag === 'my-tag') {
        event.waitUntil(doDataSync());
    }
});
```

## 3. 定期背景同步 (Periodic Background Sync)

對於需要定期更新數據（如新聞、股票）的應用，可以使用 `Periodic Sync`。這需要使用者將應用安裝至桌面且有足夠的參與度。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
