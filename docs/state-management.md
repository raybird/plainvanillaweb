# 原生狀態管理 (Vanilla Store Pattern)
在不使用框架的情況下，利用 JS 原生 Proxy 與 EventTarget 實作訂閱者模式。
## 使用範例
```javascript
import { appStore } from '../lib/store.js';
appStore.state.count++;
```
