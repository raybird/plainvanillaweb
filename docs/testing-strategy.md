# 原生測試策略 (Testing Strategy)

即使不使用 React 或 Vue，高品質的 Web 應用依然需要測試。本專案展示如何以「零依賴」的方式進行單元測試。

## 1. 內建測試運行器 (Node.js Test Runner)

我們利用 Node.js 20+ 內建的測試模組，無需安裝 Jest 或 Mocha。

```javascript
import test from 'node:test';
import assert from 'node:assert';
import { myService } from '../lib/my-service.js';

test('服務應能正確處理數據', () => {
    const result = myService.process(10);
    assert.strictEqual(result, 20);
});
```

## 2. 模擬瀏覽器環境 (Mocking)

由於我們的測試在 Node.js 環境運行，我們需要模擬一些瀏覽器特定的 API（如 `localStorage` 或 `BroadcastChannel`）。

```javascript
// 在測試前進行 Mock
global.localStorage = {
    getItem: (key) => store[key],
    setItem: (key, val) => store[key] = val
};
```

## 3. 測試組件 (Component Testing)

針對 Web Components，我們專注於邏輯測試與渲染快照：
1.  **邏輯測試**：測試組件的 `state` 變更是否符合預期。
2.  **DOM 測試**：檢查產出的 HTML 字串是否包含正確的標籤與類別。

## 4. 持續整合 (CI)

透過簡單的 npm script 即可執行所有測試：
```bash
# 在 scripts/sync.sh 中整合了自動稽核
node --test tests/*.test.js
```

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
