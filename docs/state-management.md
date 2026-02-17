# 原生狀態管理與持久化 (State Management & Persistence)

本專案展示了如何在不依賴 Redux/Vuex/Pinia 等函式庫的情況下，構建可擴展的狀態管理系統。

## 核心概念

我們採用 **Service 導向** 的狀態管理，每個 Service 負責特定的領域邏輯，並繼承自 `BaseService` (EventTarget) 以支援事件驅動。

### 1. 全域狀態 (Store) - 同步與輕量
`lib/store.js` 使用 `Proxy` 攔截物件屬性的寫入操作，並自動：
1.  發送 `change` 事件通知訂閱者。
2.  同步至 `localStorage` (持久化)。

**適用場景**：UI 狀態 (Theme)、使用者設定 (Profile)、短期通知。

```javascript
import { appStore } from '../lib/store.js';

// 訂閱變更
appStore.addEventListener('change', (e) => {
    console.log('State changed:', e.detail.key, e.detail.value);
});

// 修改狀態 (自動觸發事件與持久化)
appStore.state.theme = 'dark';
```

### 2. 大數據快取 (IDBService) - 非同步與海量
`lib/idb-service.js` 封裝了原生的 `IndexedDB`，提供 Promise-based 的 API。
**優勢**：
*   **非阻塞**：不會凍結主執行緒。
*   **大容量**：支援 50MB+ 存儲 (LocalStorage 僅 5MB)。
*   **TTL 支援**：內建過期時間管理。

**適用場景**：API 響應快取 (GitHub Repo 列表)、圖片二進位資料。

```javascript
import { idbService } from '../lib/idb-service.js';

// 存入數據 (TTL: 60分鐘)
await idbService.set('api_cache_key', bigDataObj, 60);

// 讀取數據
const data = await idbService.get('api_cache_key');
```

### 3. 主題管理 (ThemeService)
`lib/theme-service.js` 專門負責外觀邏輯。
*   監聽 `appStore` 的 `theme` 設定。
*   監聽系統 (`prefers-color-scheme`) 偏好。
*   動態計算並應用 CSS Variables (`--primary-color`)。

這種 **「Store 負責數據，Service 負責邏輯」** 的分離模式，是 Vanilla Web 架構可維護性的關鍵。
