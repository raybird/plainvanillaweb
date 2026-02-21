# 🔌 服務模式規範 (Service Interaction Patterns)

在 `plainvanillaweb` 中，**Service (服務)** 負責封裝純粹的業務邏輯、API 通訊與硬體交互（如 WebRTC、MIDI）。我們採用「單例模式 (Singleton)」配合「顯式匯入注入」來管理系統的依賴。

---

## 🌟 核心理念：邏輯與 UI 分離
組件 (Component) 僅負責渲染與使用者互動，所有的狀態變更、複雜計算與外部 I/O 應交由 Service 處理。

## 🛠️ Service 基礎結構

所有服務應繼承自 `BaseService` 以獲得事件發布/訂閱能力：

```javascript
import { BaseService } from './base-service.js';

export class DataService extends BaseService {
    constructor() {
        super();
        this._data = [];
    }

    async fetchData() {
        this._data = await fetch('/api/data').then(r => r.json());
        // 發布事件通知監聽者
        this.emit('data-loaded', this._data);
    }

    get data() { return this._data; }
}

// 導出單例實例 (即時注入模式)
export const dataService = new DataService();
```

---

## 📥 注入與交互模式 (Interaction Patterns)

### 1. 顯式匯入注入 (Explicit Import Injection)
這是最推薦的模式。組件直接匯入所需的 Service 單例。

```javascript
import { dataService } from '../../lib/data-service.js';

export class MyPage extends BaseComponent {
    connectedCallback() {
        super.connectedCallback();
        // 訂閱服務事件
        this._unsubscribe = dataService.on('data-loaded', (data) => {
            this.state.items = data;
        });
    }

    disconnectedCallback() {
        // 務必解除訂閱以防記憶體洩漏
        this._unsubscribe();
    }
}
```

### 2. 服務聚合器 (Industrial Hub)
透過 `lib/vanilla-sdk.js` 將所有服務聚合，提供統一的命名空間存取。

```javascript
import { VanillaSDK } from '../../lib/vanilla-sdk.js';

// 透過聚合器存取
VanillaSDK.notification.success("操作成功");
```

---

## 🔄 組件與服務的通訊流向

1.  **Command (命令)**: 組件調用服務方法（如 `authService.login()`）。
2.  **Event (事件)**: 服務處理完成後發布事件（如 `this.emit('login-success')`）。
3.  **Sync (同步)**: 組件監聽到事件後，更新自身的反應式 `state` 並觸發重繪。

## 💡 最佳實踐

1.  **封裝性**: 服務內部的變數應以 `_` 開頭或使用私有欄位，僅透過 `get` 或方法暴露必要資訊。
2.  **防禦性**: Service 應處理自身的錯誤，並透過 `BaseService` 的錯誤頻道廣播給 `ErrorService`。
3.  **無狀態化 (Statelessness)**: 盡可能保持服務本身不存儲 UI 專用的臨時狀態，僅維護與業務資料相關的核心狀態。
