# Multi-Window POS

> **更新日期**：2026-11-27  
> **English**：[Multi-Window POS](./pos.en.md)  
> **入口**：[#/solutions/pos](#/solutions/pos) · **Issue**：#10 · **慣例**：[Reference App 慣例](./conventions.md)

同一台機器上的四個視窗（點餐、廚房、顧客叫號、管理統計）協同處理訂單的 local-first 範例。訂單存在瀏覽器的 IndexedDB，視窗之間不經過伺服器，所以離線也能完整運作。重點在示範：多個視窗同時操作同一筆資料時，如何保證狀態轉移合法、原子且冪等，以及重新整理、晚開啟、關閉視窗後如何回到一致的狀態。

這是展示用範例：**不處理真實付款，也不收集個資**。

## 1. 操作方式

- 開啟 [POS 入口](#/solutions/pos)，按「開啟全部四個視窗」。瀏覽器擋下彈出視窗時，改用每個角色下方的「在新分頁開啟」連結。
- 角色視窗的路由：

| 角色 | 路由 | 做什麼 |
| --- | --- | --- |
| 點餐 | `#/solutions/pos/order` | 選品項、送出訂單、顯示取餐號碼 |
| 廚房 | `#/solutions/pos/kitchen` | 認領待處理訂單、完成備餐、接手已關閉站台的訂單；可開多個（多個站台） |
| 顧客叫號 | `#/solutions/pos/display` | 大字顯示備餐中與請取餐的號碼，按「已取餐」結案；可保持螢幕常亮 |
| 管理統計 | `#/solutions/pos/admin` | 狀態統計、營收、平均備餐時間、熱銷品項、在線視窗、取消待處理訂單 |

- 角色視窗預設以 kiosk 版面（`?kiosk=1`）開啟，右下角可離開 kiosk 版面。
- 一次完整流程：點餐送單 → 廚房「認領」→「備餐完成」→ 叫號畫面「已取餐」。
- 重設：入口或管理視窗的「重設 demo 資料」會刪除整個 POS 資料庫；菜單在下一次開啟時自動補回。「產生 3 張示範訂單」可快速準備展示資料。
- 加上 `?ns=<名稱>` 可以開一份獨立的資料（例如 `#/solutions/pos?ns=demo-2`），入口開出的視窗會沿用同一個 namespace。

## 2. 架構

```text
 點餐視窗      廚房視窗 ×N      叫號視窗      管理視窗
    │              │              │             │
    └──── PosSession（每個視窗一個）─────────────┘
           │ 寫入：PosRepository（單一 readwrite transaction）
           │ 通知：MessageBus 'pos:changed'（只說「有變動」）
           │ 讀取：收到通知、開啟、回到前景、重新連線時重讀 IndexedDB
           ▼
  IndexedDB  vanilla_solution:<namespace>:orders   ← 唯一的權威狀態
```

| 檔案 | 用途 |
| --- | --- |
| `components/pages/solutions/pos/pos-model.js` | 菜單、訂單建立、狀態轉移規則、統計（純函式） |
| `components/pages/solutions/pos/pos-repository.js` | IndexedDB 讀寫；每次寫入在單一 transaction 內「讀出 → 判斷 → 寫回」 |
| `components/pages/solutions/pos/pos-session.js` | 每個視窗的工作階段：通知、重讀、站台鎖、節點探索、重設 |
| `components/pages/solutions/pos/pos-page.js` | 四個視窗共用的外框、提示與事件委派 |
| `components/pages/solutions/pos/Pos*Page.js` | 入口與四個角色畫面 |

使用的 coordination API：

- `MessageBus`：寫入成功後發出 `pos:changed`。訊息內容不被信任，收到後一律重讀權威狀態。
- `PeerDiscovery`：管理視窗顯示目前在線的視窗與角色；有視窗加入或離開時重讀一次。
- Web Locks（平台 API）：每個廚房站台持有 `vanilla_solution:<namespace>:station:<站台>` 鎖，用來判斷站台是否已關閉。畫面上的「已關閉」只是提示；實際接手時先以 `ifAvailable` 取得原站台的鎖，持鎖到 transaction 完成，取不到就拒絕接手（`CONFLICT`）並重讀畫面。

## 3. 資料流

資料模型（`POS_SCHEMA_VERSION = 1`）：

- `products`：菜單，資料庫建立時寫入示範菜單。
- `orders`：`{ id, requestId, number, sequence, items, total, status, station, version, createdAt, updatedAt, history }`；`requestId` 為唯一索引。
- `meta`：`sequence` 取餐序號。

狀態轉移（其餘一律拒絕，回報 `INVALID_TRANSITION`）：

| 動作 | 轉移 | 執行者 | 規則 |
| --- | --- | --- | --- |
| `claim` | 待處理 → 備餐中 | 廚房站台 | 記錄站台；其他站台已認領時回報 `CONFLICT` |
| `ready` | 備餐中 → 請取餐 | 認領的站台 | 其他站台不能完成 |
| `takeover` | 備餐中 → 備餐中 | 廚房站台 | 必須指定原站台；原站台還持有站台鎖（仍在線，或另一個站台正在接手），或原站台已不是指定的那個時回報 `CONFLICT` |
| `pickup` | 請取餐 → 已取餐 | 叫號視窗 | |
| `cancel` | 待處理 → 已取消 | 管理視窗 | |

- **原子性**：`PosRepository.transition()` 在單一 `readwrite` transaction 內讀出訂單、交給 `decideTransition()` 判斷、寫回。IndexedDB 保證範圍重疊的 readwrite transaction 依序執行，跨分頁也一樣，所以兩個站台同時認領，後執行的那個一定讀到前一個的結果。
- **冪等**：同一個執行者重送已生效的動作回傳 `noop`；點餐以 `requestId` 去重，連按兩下或失敗重試都不會產生第二張單。取餐序號與訂單在同一個 transaction 內遞增與寫入。
- **通知**：寫入的視窗發出 `pos:changed` 並重讀自己的畫面；其他視窗收到後重讀。讀取中又收到通知時，讀完會再讀一次，不會漏掉最後的變更。

## 4. 故障模式

| 情境 | 預期行為 | 如何驗證 |
| --- | --- | --- |
| 重新整理 | 從 IndexedDB 恢復；廚房站台 id 存在 sessionStorage，重新整理後沿用並保有自己認領的訂單 | 瀏覽器測試重新整理廚房視窗 |
| 視窗關閉後重開 | 重開時重讀權威狀態；關閉的廚房站台釋放 Web Lock，其他站台出現「接手」 | 瀏覽器測試關閉站台後接手 |
| 晚加入的視窗 | 開啟時讀取目前狀態，與其他視窗一致 | 瀏覽器測試之後才開啟管理視窗 |
| 並行操作同一筆資料 | 只有一個成功，另一個顯示「已由其他站台處理」 | 瀏覽器測試兩個廚房同時認領；兩個分頁各自同時認領 6 張單；兩個廚房同時接手已關閉站台的同一張單 |
| 舊畫面上的「接手」 | 原站台重新整理後又拿回站台鎖，舊畫面送出的接手被拒絕，畫面重讀 | 瀏覽器測試在原站台仍在線時直接送出接手 |
| 初始化中途離開路由 | 晚到的站台鎖立即釋放，不建立 PeerDiscovery 與監聽器 | 瀏覽器測試延遲取得鎖、期間釋放工作階段 |
| 重複送出 | 同一 `requestId` 只建立一張單 | 瀏覽器測試同一 `requestId` 同時送出兩次 |
| 離線 | 照常運作；標頭顯示離線狀態。協作只在同一台機器的同源視窗之間 | 已造訪過的頁面由 Service Worker 快取提供 |
| 背景分頁漏接通知 | 回到前景（`visibilitychange`）與重新連線時重讀 | `PosSession.start()` |
| 重設時其他視窗開著 | 其他視窗的連線收到 `versionchange` 後自動關閉；下一次重讀重新開啟並補回菜單 | 瀏覽器測試重設後各視窗一致 |
| 複製分頁 | sessionStorage 被一起複製，第二個分頁取不到同一個站台鎖，改用新的站台 id | `PosSession._claimStation()` |
| 不支援 IndexedDB 或 BroadcastChannel | 顯示說明，不啟動 | `detectPosFeatures()` |
| 不支援 Web Locks | 無法判斷站台是否已關閉：「接手」一律顯示，由人工確認，沒有互斥保證 | 廚房畫面標示「無法偵測站台狀態」 |

## 5. 資源與清理

- 每個視窗開啟：IndexedDB 連線、MessageBus、PeerDiscovery（心跳計時器）、`visibilitychange`／`online`／`offline` 監聽；廚房另外持有站台 Web Lock；叫號畫面選用 Wake Lock。全部在離開路由時（`disconnectedCallback`）由 `createTeardown()` 釋放。
- 重設清除：IndexedDB `vanilla_solution:<namespace>:orders`。廚房站台 id 存在 sessionStorage（`vanilla_solution:<namespace>:station`），隨視窗關閉消失。

## 6. 正式上線差距

- **授權與身分**：任何同源頁面都能讀寫這份資料，namespace 不是安全邊界。正式系統需要登入、角色權限與操作稽核。
- **交易與付款**：沒有收款、發票、退款與對帳；營收只是訂單金額加總。
- **跨裝置同步與後端**：只在同一台機器的同一個瀏覽器設定檔內協作。多台收銀機、廚房平板需要後端（見 [ADR 0107](../decisions/0107-sharedworker-and-cross-device-transport-evaluation.md) 的跨裝置評估）與衝突處理。第二代 [Multi-Window POS v2](./pos-v2.md)（#16）以 WebRTC DataChannel 讓其他裝置加入，主機分頁是唯一的權威。
- **個資與稽核**：不收集顧客資料；正式系統要處理個資保存期限與存取紀錄。
- **其他**：菜單管理、庫存、尖峰負載、印表機與叫號硬體整合都不在範圍內；瀏覽器可能在儲存空間不足時清除資料，正式系統需要 `navigator.storage.persist()` 與備份。

## 7. 測試

- `tests/pos-model.test.js`：訂單建立與金額、完整流程、冪等、站台衝突、接手的 CAS、不合法轉移、統計。
- `tests/browser-runner.mjs` 的 `runPosTests`：在獨立 namespace 下以多個真實視窗走完下單 → 認領 → 完成 → 取餐；同一 `requestId` 重送；兩個廚房同時認領；兩個分頁同時認領 6 張單各只成功一次；晚加入的管理視窗；重新整理沿用站台；原站台在線時接手被拒絕；關閉站台後兩個站台同時接手只有一個成功；初始化中途離開不留下站台鎖與 PeerDiscovery；重設後各視窗一致。
