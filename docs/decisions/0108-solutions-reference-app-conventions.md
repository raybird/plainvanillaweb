# ADR 0108: Solutions 分類與 Reference App 慣例

- 狀態: 已接受
- 日期: 2026-11-25

## 背景

Epic #8 要在 Browser Coordination SDK（Epic #2，ADR 0103–0107）之上新增 Solutions：Labs 解釋單一 API，Solutions 展示多個原生能力組成的完整應用與工作流程。首輪範例是 Multi-Window POS（#10）與 Browser Computing Farm（#11）；Browser Cluster Lab 已由 #6 交付。

開始寫範例之前（#9），有幾件事要先統一，否則每個範例各寫一套，之後回頭改規範的成本很高：

1. 多視窗範例的每個角色視窗都會載入完整的 `<x-app>`，包含側邊欄與頁尾；點餐、叫號這類畫面需要佔滿視窗的版面。
2. Epic 要求雙語文件，但 `docs/*.md` 只有中文，`lib/doc-service.js` 不分語系。
3. 範例要能獨立重設與卸載，需要一致的 namespace、儲存名稱、資源釋放與重設方式。
4. POS 的訂單狀態與 Computing Farm 的圖片，都不適合直接放進 `DurableTaskQueue`。

## 決策

### 1. 路由與載入

- Solutions 是頂層路由 `/solutions`，由 `components/pages/Solutions.js` 以巢狀 `<x-switch>` 管理 `/solutions/*`，與 Lab 相同的模式；各範例以 `<x-route module>` 延遲載入，內容放在 `<template>`（ADR 0102）。
- 範例程式放在 `components/pages/solutions/<slug>/`；核心不得匯入，`tests/core.test.js` 的 allowlist（ADR 0101）持續把關。
- 已在其他區域交付的項目（Browser Cluster）只在 Solutions 目錄放入口，不重做。

### 2. Kiosk 版面用 hash query，不另開 HTML 入口

hash query 帶 `kiosk=1` 時，`<x-app>` 不渲染側邊欄、漢堡按鈕與頁尾，主內容佔滿視窗，並固定顯示「離開 kiosk 版面」連結。判斷邏輯在 `app/kiosk.js`（純函式，`<x-app>` 與 Solutions 共用）。

不採用獨立 HTML 入口（例如 `solutions/pos/kitchen.html`）：那會繞過 `<x-route>` 與 ADR 0102 的頁面生命週期，smoke test 也走訪不到，等於另一套載入流程。kiosk 是版面設定，不是另一個應用。

### 3. 雙語文件用同層的兩個檔案

每份 Solutions 文件寫兩個檔：`docs/solutions/<slug>.md`（中文）與 `docs/solutions/<slug>.en.md`（英文），開頭互相連結；文件頁清單只列中文版。

`lib/doc-service.js` 只放寬文件 id：最後一段可以帶 `.en` 後綴（`solutions/conventions.en`），其他含 `.` 的名稱仍然拒絕，路徑穿越的防護不變。不做依語系自動切換：那需要改動文件服務、文件清單與深連結，範圍遠大於 Solutions 本身。

### 4. 共用慣例收成一個小模組

`components/pages/solutions/solution-kit.js` 只收各範例都要遵守的部分：`resolveNamespace`（預設 `solution-<slug>`，`?ns=` 可覆寫）、`solutionStorageName`（`vanilla_solution:<namespace>:<purpose>`）、`buildSolutionHash`、`openSolutionWindow`（固定視窗名稱，被擋時回傳 `null` 由畫面提供連結）、`detectFeatures`、`createTeardown`（釋放後才登記的資源立即釋放，並提供 `disposed`／`signal` 讓非同步初始化在每個 `await` 之後停止）、`resetSolutionData`。狀態管理、畫面與資料模型由範例自己負責，不做成框架。

### 5. 業務資料與二進位資料不放進佇列

- POS 的訂單有「待處理 → 備餐 → 完成 → 取餐」的人工流程，`DurableTaskQueue` 的狀態機（pending／running／completed／failed）與 5 秒租約自動回收都不符合這個語意。訂單存在範例自己的 IndexedDB store，以單一 `readwrite` transaction 檢查狀態轉移與版本後寫入；`MessageBus` 只負責通知，收到後重讀權威狀態。這是應用資料，不算複製基礎設施。
- 佇列的 payload 與 result 會拒絕 `Blob`／`ArrayBuffer`（`docs/coordination.md`）。Computing Farm 的輸入與輸出圖片存在範例自己的 Blob store，佇列只放參考；輸出以帶 `leaseId` 的 key 寫入，以 `completeAtomic` 的租約比對決定哪一份有效，過期租約留下的輸出當作孤兒清除。

## 後果

- 正面：範例之間的資料與資源互不干擾，可單獨重設；kiosk 版面與 smoke test、頁面生命週期使用同一條路徑；Node 可直接測試慣例模組。
- 代價：雙語文件要人工保持兩份一致；kiosk 版面下沒有語系與主題切換按鈕（沿用使用者先前的設定）。
- 限制：namespace 只隔離資料，不是安全邊界；所有範例只在同一台機器的同源頁面之間協作，跨裝置同步不在範圍內（見 ADR 0107）。
