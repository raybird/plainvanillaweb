# 原生路由系統 (Vanilla Router Service)

本專案實作了一個具備 Service 特性的路由系統，將 URL 狀態管理與 UI 渲染分離。

## 核心組件
- **lib/router.js**: 路由服務，負責監聽 hash 變更與程式化跳轉。
- **x-route**: 宣告式路由組件，根據路徑顯示或隱藏內容。

## 使用方式
### 宣告式
```html
<x-route path="/about" exact>
    <h1>關於</h1>
</x-route>
```

### 程式化跳轉
```javascript
import { router } from './lib/router.js';
router.push('/search');
```
