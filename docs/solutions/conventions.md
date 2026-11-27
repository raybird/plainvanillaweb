# Solutions Reference App 慣例

> **更新日期**：2026-11-27  
> **English**：[Reference App Conventions](./conventions.en.md)  
> **架構決策**：[ADR 0108](../decisions/0108-solutions-reference-app-conventions.md) · [ADR 0101](../decisions/0101-core-entry-point.md) · [ADR 0102](../decisions/0102-route-owned-page-lifecycle.md)  
> **共用工具**：`components/pages/solutions/solution-kit.js`、`app/kiosk.js`

Labs 解釋單一 API；Solutions 把多個原生能力組成完整的應用與工作流程。每個 reference app 都要能單獨開啟、單獨重設、單獨移除，不影響其他範例，也不讓核心依賴它。

入口：[Solutions](#/solutions)。

---

## 1. 範例清單與邊界

| 範例 | 路由 | 交付 | 狀態 |
| --- | --- | --- | --- |
| Multi-Window POS | `#/solutions/pos/*` | #10 | 可使用（[文件](./pos.md)） |
| Multi-Window POS v2 | `#/solutions/pos-v2/*` | #16 | 可使用（[文件](./pos-v2.md)） |
| Browser Computing Farm | `#/solutions/farm` | #11 | 可使用（[文件](./farm.md)） |
| Browser Cluster | `#/lab/browser-cluster` | #6（Lab） | 已完成，Solutions 只放入口 |

- 範例程式放在 `components/pages/solutions/<slug>/`，由 `components/pages/Solutions.js` 的巢狀 `<x-switch>` 以 `module` 延遲載入。
- 核心（`lib/core.js` 與它的匯入圖）不得匯入 Solutions；`tests/core.test.js` 的 allowlist 會擋下。
- 協作能力只用 `lib/coordination.js` 的公開 API。需要的能力 SDK 沒有時，先在 issue 討論要不要補進 SDK，不在範例裡複製一份基礎設施。
- 範例自己的業務資料（例如訂單）由範例自己的 IndexedDB store 保存，這屬於應用資料，不算複製基礎設施。

## 2. 路由

- 一律在 `/solutions/<slug>` 底下，`<slug>` 為小寫英數與連字號（例如 `pos`、`farm`）。
- 多角色範例每個角色一條路由：`/solutions/<slug>/<role>`，例如 `/solutions/pos/kitchen`。
- 路由內容放在 `<template>` 裡（ADR 0102）：進入時建立、離開時移除。
- 範例內的連結用 `buildSolutionHash(path, { ns, kiosk })` 組，namespace 與 kiosk 設定才不會在換頁時遺失。

## 3. Kiosk 版面

hash query 帶 `kiosk=1` 時（例如 `#/solutions/pos/kitchen?kiosk=1`），`<x-app>` 不渲染側邊欄、漢堡按鈕與頁尾，Solutions 標頭也隱藏，主內容佔滿視窗。右下角固定有「離開 kiosk 版面」連結，回到一般版面。

開啟角色視窗用 `openSolutionWindow(path, { name, ns })`：

```javascript
import { openSolutionWindow } from './solution-kit.js';

const { url, window: opened } = openSolutionWindow('/solutions/pos/kitchen', { name: 'pos-kitchen', ns });
if (!opened) {
    // 瀏覽器擋下彈出視窗：顯示 url 讓使用者自己開
}
```

- 視窗名稱固定，重複點擊會重用同一個視窗。
- 彈出視窗被擋時回傳 `window: null`，畫面要提供可點的連結作為後備，不能只靠 `window.open`。

## 4. Namespace 與儲存

| 項目 | 規則 | 工具 |
| --- | --- | --- |
| namespace | 預設 `solution-<slug>`；hash query 的 `ns` 可覆寫（測試與並排展示用） | `resolveNamespace(slug)` |
| IndexedDB 資料庫、localStorage key | `vanilla_solution:<namespace>:<purpose>` | `solutionStorageName(namespace, purpose)` |
| MessageBus／LeaderElection／DurableTaskQueue | 傳入同一個 namespace | coordination API 的 `namespace` 選項 |

- namespace 只用來隔離資料，**不是安全邊界**：同源頁面都能讀寫。
- 不使用全域 `appStore` 存範例資料：它會寫入 `localStorage` 並廣播到所有分頁。
- 每個範例宣告自己的 `SCHEMA_VERSION`。版本升級時在 `onupgradeneeded` 遷移；無法遷移的展示資料直接重設，並在畫面上說明。
- 每個 IndexedDB 連線都要設定 `db.onversionchange = () => db.close()`，否則其他視窗重設資料時會被卡住。
- 二進位資料（圖片、影音）存在範例自己的 Blob store，`DurableTaskQueue` 的 payload 與 result 只放參考（佇列會拒絕 `Blob`、`ArrayBuffer`，見 [協作基礎](../coordination.md)）。
- 會寫入大量資料的範例，先用 `navigator.storage.estimate()` 檢查剩餘空間，並限制檔案大小與數量，超出時明確報錯。

## 5. 能力偵測與降級

進入範例時先偵測需要的能力，缺少時顯示可理解的說明，而不是讓頁面拋錯：

```javascript
import { detectFeatures } from './solution-kit.js';

const { supported, missing } = detectFeatures({
    indexedDB: () => 'indexedDB' in globalThis,
    webLocks: () => 'locks' in navigator,
    offscreenCanvas: () => typeof OffscreenCanvas === 'function',
});
```

- 分成「必要」與「選用」：缺必要能力時停在說明畫面；缺選用能力（例如 Wake Lock、條碼）時關掉該功能，其餘照常運作。
- 偵測函式拋錯視同不支援。
- headless Chrome 缺少的硬體能力不得在頁面載入時 `console.error`，smoke test 會判為失敗。

## 6. 資源釋放（teardown）

開啟資源的同時登記釋放函式，`disconnectedCallback` 一次釋放：

```javascript
import { createTeardown } from './solution-kit.js';

connectedCallback() {
    super.connectedCallback();
    this._teardown = createTeardown();
    const bus = createMessageBus({ namespace });
    this._teardown.add(() => bus.dispose());
    const url = URL.createObjectURL(blob);
    this._teardown.add(() => URL.revokeObjectURL(url));
}

disconnectedCallback() {
    super.disconnectedCallback();
    this._teardown.run();
}
```

- 依相反順序釋放；單一項目失敗不影響其他項目，`run()` 回傳錯誤清單。
- **非同步初始化**：初始化常要等待（Web Lock、Worker 就緒、佇列啟動），等待中途就可能離開路由。`run()` 之後清單即為已釋放（`disposed`、`signal.aborted` 為 true），之後才登記的釋放函式會立即執行；初始化在每個 `await` 之後檢查 `disposed`，已釋放就停止，不再建立後續資源：

```javascript
async start() {
    const bus = createMessageBus({ namespace });
    this._teardown.add(() => bus.dispose());
    await this._claimStationLock(); // 取得鎖時以 this._teardown.add(release) 登記；已釋放時會立即放掉
    if (this._teardown.disposed) return; // 等鎖期間已離開：不再建立 PeerDiscovery 與監聽器
    // ...
}
```

- 可以反覆開關的資源（例如 Farm 的「加入處理」／「停止處理」）把開與關排成依序執行，全部建立成功才生效，中途失敗或已釋放就撤回已建立的部分。
- `createTeardown()` 釋放後不能再用；需要「先關再開」的情境（例如重設資料）直接關閉該連線，不要呼叫 `run()`。
- 必須釋放的資源：BroadcastChannel／MessageBus、Web Lock 與 Leader 身分、Worker、object URL、計時器、IndexedDB 連線、Wake Lock、媒體串流。
- smoke test 會走訪每一條路由再離開；沒釋放的資源會讓後續頁面出錯或測試變慢。

## 7. 重設（reset）

每個範例都要提供畫面上的「重設 demo 資料」，並能重新載入 seed 資料：

```javascript
import { resetSolutionData, solutionStorageName } from './solution-kit.js';

this._repo.close(); // 先關自己的連線（下一次讀寫時重新開啟）
bus.publish('solution:reset', {}); // 通知其他視窗關閉連線或重新載入
const report = await resetSolutionData({
    databases: [solutionStorageName(namespace, 'orders')],
    storageKeys: [solutionStorageName(namespace, 'settings')],
    cleanups: [() => queue.clearNamespace()],
});
```

- `report.databases[name]` 為 `deleted`、`blocked`（有連線沒關，逾時）或 `unsupported`。出現 `blocked` 要提示使用者關閉其他視窗後再試。
- 只清自己 namespace 的資料；共用的 `vanilla_coordination_tasks` 用 `clearNamespace()`，不刪整個資料庫。

## 8. 文件與測試

- 每個範例有中英兩份文件：`docs/solutions/<slug>.md` 與 `docs/solutions/<slug>.en.md`，開頭互相連結。依 [文件範本](./reference-app-template.md) 撰寫架構、資料流、故障模式與正式上線差距。
- 新文件加進 `components/pages/Docs.js` 的清單（只列中文版，英文版由連結進入）。
- 測試：
  - 純邏輯（狀態轉移、儲存命名）寫 Node 單元測試。
  - 多視窗流程寫在 `tests/browser-runner.mjs`，用多個真實分頁（CDP `Target.createTarget`）驗證，並以獨立的 `ns` 隔離測試資料。
  - 路由會被 smoke test 自動走訪，必須沒有例外、沒有 `console.error`、沒有 4xx/5xx。
- 正式商業部署需要的授權、交易、跨裝置同步與後端，要在文件的「正式上線差距」明確列出，不在範例中假裝已處理。
