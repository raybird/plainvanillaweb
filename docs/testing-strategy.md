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

## 4. 真實瀏覽器測試 (Headless Chrome)

需要真實 DOM 的行為（`innerHTML` 重繪、Shadow DOM、焦點還原）放在 `tests/browser.html`，由 `tests/browser-runner.mjs` 自動執行。執行器同樣零依賴：只用 Node 內建的 `http` 與 `WebSocket`，透過 **Chrome DevTools Protocol** 操作系統上的 Chrome。

```bash
node tests/browser-runner.mjs
```

它會在根目錄 `/` 與 GitHub Pages 的子路徑 `/plainvanillaweb/` 各跑一次（子路徑伺服器只提供該路徑底下的檔案，相對路徑寫錯會直接 404），每次：
1. 執行 `tests/browser.html` 的元件測試，讀取 `window.__TEST_RESULTS__`。
2. **全站冒煙測試**：逐一開啟頁面上找得到的每個 `<x-route>`（含延遲載入的 Lab 子路由）與每份被連結的文件，只要出現未捕捉的例外、`console.error` 或 4xx/5xx 回應就失敗。

## 5. 持續整合 (CI)

GitHub Actions 在每次 push 與 PR 執行單元測試、語法檢查、Service Worker 版本檢查與瀏覽器測試：
```bash
node --test tests/*.test.js
node scripts/update-sw-version.js --check
node tests/browser-runner.mjs
```

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
