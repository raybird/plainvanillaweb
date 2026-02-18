# 原生儲存管理與數據持久化 (Storage & Persistence)

在 PWA 與離線優先的應用中，IndexedDB 與 LocalStorage 是核心。但瀏覽器預設會將這些數據標記為「可清理」的。本章節介紹如何主動管理這些資源。

## 1. 監控儲存配額 (Storage Estimate)

透過 `navigator.storage.estimate()`，我們可以獲取目前應用程式佔用的位元組數以及瀏覽器分配的總上限。

```javascript
async function checkStorage() {
    if (navigator.storage && navigator.storage.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        const percent = ((usage / quota) * 100).toFixed(2);
        console.log(`已使用: ${usage} bytes (佔配額 ${percent}%)`);
    }
}
```

## 2. 請求持久化儲存 (Persistent Storage)

持久化儲存能確保您的數據不會因為硬碟空間不足而被瀏覽器自動刪除。

```javascript
async function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log(isPersisted ? "數據已受保護" : "數據仍為暫時性");
    }
}
```

> **注意**：瀏覽器通常會根據使用者是否「安裝」了 PWA 或與網站的互動頻率來決定是否核准持久化權限。

## 3. 實戰建議

1.  **儀表板顯示**：在應用的設置或儀表板中向使用者展示空間使用狀況。
2.  **主動申請**：當使用者執行重要操作（如儲存大型專案）時，引導其開啟持久化。
3.  **優雅降級**：如果權限被拒絕，請確保應用依然能透過頻繁同步等方式保持數據安全。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
