# Changelog

版本依 [語意化版本](https://semver.org/lang/zh-TW/) 編號，範圍是核心（`lib/core.js` 匯出的 API）與 `lib/vanilla-sdk.js`；展示站（Lab、文件、Dashboard）的變動只在影響使用方式時列出。

固定版本的引用方式（jsDelivr 依 git tag 提供，內容不會再變）：

```javascript
import { BaseComponent, html, router } from 'https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v3.2.0/lib/core.js';
```

`https://raybird.github.io/plainvanillaweb/lib/...` 永遠是最新的 master，適合試用，不適合正式專案。

**發版步驟**：更新 `lib/version.js` 的 `VERSION` 與本檔最新一節 → 執行 `scripts/check.sh` → commit → 打 tag `v<VERSION>` 並推送。`tests/core.test.js` 會檢查 `VERSION` 與本檔最新一節一致。

---

## [Unreleased]

Epic #8（Native Web Solutions）的 #9–#11 合併為 v3.3.0 發布；核心與 `lib/coordination.js` 的匯出不變。

### 新增

- Solutions 分類（#9，[ADR 0108](./docs/decisions/0108-solutions-reference-app-conventions.md)）：`#/solutions` 目錄頁（首頁與側欄皆有入口，Browser Cluster 連回 `#/lab/browser-cluster`）、hash query `?kiosk=1` 的全視窗 kiosk 版面（`app/kiosk.js`）、`components/pages/solutions/solution-kit.js` 慣例工具（`resolveNamespace`、`solutionStorageName`、`buildSolutionHash`、`openSolutionWindow`、`detectFeatures`、`createTeardown`、`resetSolutionData`），以及中英雙語的 [Reference App 慣例](./docs/solutions/conventions.md) 與 [文件範本](./docs/solutions/reference-app-template.md)。
- Multi-Window POS（#10，`#/solutions/pos`，[文件](./docs/solutions/pos.md)）：點餐、廚房、顧客叫號、管理統計四個視窗的 local-first 訂單流程。訂單存在範例自有的 IndexedDB，每次狀態轉移在單一 `readwrite` transaction 內判斷與寫入（並行認領只有一個站台成功、同一 `requestId` 重送不重複建單）；`MessageBus` 通知後各視窗重讀權威狀態，重新整理與晚加入的視窗狀態一致；廚房站台以 Web Lock 宣告存活，關閉後其他站台可接手；`PeerDiscovery` 顯示在線視窗；叫號畫面可選用 Screen Wake Lock。附 demo 示範訂單與重設、真實多視窗瀏覽器測試。
- 瀏覽器測試的 `openTab({ newWindow: true })`：同一視窗內的背景分頁會暫停 `requestAnimationFrame`，需要同時觀察多個畫面的測試改在獨立視窗開啟。

## [3.2.0] - 2026-11-24

### 新增

- Phase 5（#7）延伸架構評估（[ADR 0107](./docs/decisions/0107-sharedworker-and-cross-device-transport-evaluation.md)、[評估報告](./docs/coordination-phase5-evaluation.md)）：完成 `SharedWorker` vs Web Locks Leader 比較、`lib/webrtc-service.js` 檢核、跨裝置 Transport Adapter（信令／認證／授權／防偽／一致性）邊界定義與位於 `tests/` 的可重現 PoC（未更動 `lib/core.js` 與 `lib/coordination.js` 生產程式碼，決策為 `SharedWorker` 與改造 `WebRTCService` No-Go、跨裝置 Relay Adapter Conditional Go）。
- `DurableTaskQueue`、`TaskQueueError` 與儲存配接器（`lib/task-queue.js`，[ADR 0106](./docs/decisions/0106-durable-task-queue-and-cluster-lab.md)）：基於 `vanilla_coordination_tasks` IndexedDB 實作單一 `readwrite` transaction 原子認領、`(namespace, idempotencyKey)` 去重與命名空間隔離、`leaseId` 寫入防護、可選非搶奪式 Web Locks 孤兒快收、`registerHandler(type, fn, { version })` 版本檢查、指數退避重試與 `maxAttempts` 上限、`purge`／`clearNamespace` 清理，以及不支援 IndexedDB 時明確回報 `supported: false`。
- `BrowserClusterPage`（`components/pages/lab/BrowserClusterPage.js`，`#/lab/browser-cluster`）：opt-in 啟動的真實多分頁叢集整合實驗室，串接 `MessageBus`、`LeaderElection`、`PeerDiscovery`、`RpcChannel`（`cluster.ping`／`cluster.stats`）、`DurableTaskQueue`（`chunk.checksum`／`transform.normalize`）、明確標註為靜態展示模擬的 `MockSharedConnection`，以及無障礙與響應式表格佈局。
- `PeerDiscovery`（`lib/peer-discovery.js`，[ADR 0105](./docs/decisions/0105-peer-discovery-and-shared-connection.md)）：提供跨執行環境節點探索、能力宣告與更新、`__peer:hello`/`heartbeat`/`leave` 生命週期、過期掃描（`peer-expire`）與凍結恢復重連（`rejoined`），嚴格限定心跳過期僅供觀測且絕不代表 Web Lock 已釋放。
- `SharedConnection` 與 `buildConnectionScope`（`lib/shared-connection.js`，[ADR 0105](./docs/decisions/0105-peer-discovery-and-shared-connection.md)）：整合 `LeaderElection`、`MessageBus` 與 `RpcChannel`，以正規化 URL＋`identityKey`＋`configKey` 隔離同 scope 單一即時連線；支援 WebSocket 透過 RPC 轉發 `send()`（不自動重試）、SSE 嚴格單向（`canSend === false`，`send()` 回傳 `UNSUPPORTED_OPERATION`）與 `lastEventId` 追蹤、指數退避重連、`onResync` 與跨分頁訂閱聯集同步。
- `LeaderElection`（`lib/leader-election.js`，[ADR 0104](./docs/decisions/0104-leader-election-and-rpc.md)）：以具 `namespace` + `scope` 隔離的 Web Locks `exclusive` 鎖為唯一互斥依據，支援非阻塞 `start()`、主動 `release()` / `stop()`、關閉／重載自動接管、選用僅作觀測之 heartbeat、背景凍結（`releaseOnFreeze`）與不支援 API 明確回報；由 `lib/coordination.js` 與 `lib/vanilla-sdk.js` 匯出。
- `RpcChannel`、`RpcError` 與 `RPC_ERROR_CODES`（`lib/rpc-channel.js`）：基於 `MessageBus` 提供方法白名單註冊、明確 `target`／唯一 provider 路由、`correlationId`、`timeoutMs`、`AbortSignal`、錯誤序列化、重複回應事件、不自動重試副作用方法及 `dispose()` 清理，並擴充 `coordination-demo.html` 雙分頁 RPC／選舉示範與真實多分頁自動化測試。
- `lib/coordination.js`：獨立、零副作用的跨執行環境協作入口，統一匯出 Phase 1（`BroadcastService`、`MessageBus`、`createMessageBus`、`getCoordinationCapabilities`、`ENVELOPE_VERSION`、`createEnvelope`、`validateEnvelope`）、Phase 2（`LeaderElection`、`createLeaderElection`、`RpcChannel`、`createRpcChannel`、`RpcError`、`RPC_ERROR_CODES` 等）與 Phase 3（`PeerDiscovery`、`createPeerDiscovery`、`SharedConnection`、`createSharedConnection`、`buildConnectionScope`、`SharedConnectionError`、`SHARED_CONNECTION_ERROR_CODES` 等）API（[ADR 0103](./docs/decisions/0103-browser-coordination-foundation.md)、[ADR 0104](./docs/decisions/0104-leader-election-and-rpc.md)、[ADR 0105](./docs/decisions/0105-peer-discovery-and-shared-connection.md)）；`lib/vanilla-sdk.js` 同步重新匯出協作類別與工廠函式。
- `BroadcastService`（拆分為無副作用類別模組 `lib/broadcast-channel.js`）：支援 `namespace`、v1 版本化信封、輸入驗證、capability detection（不支援 `BroadcastChannel` 時不拋錯）、可注入 `transport` 與 `close()`/`dispose()` 資源清理；`lib/broadcast-service.js` 保留預設單例維持向下相容。
- `MessageBus`（`lib/message-bus.js`）：提供 `publish`／`subscribe`／`unsubscribe`、本地與遠端投遞控制（預設 `local: false, remote: true`）、萬用主題 `'*'`、`receive` 篩選與錯誤隔離。
- `Store.prototype.dispose()` 與實例隔離選項（`options.broadcast`、`options.sync`、`options.acceptLegacy`）；`applySnapshot(snapshot, { replace })` 支援完整快照替換語意。
- 最小雙分頁示範頁面 `coordination-demo.html`、指南 [coordination.md](./docs/coordination.md)，以及 `tests/browser-runner.mjs` 的多頁籤真實瀏覽器協作測試。
- 文件頁支援子目錄的文件，ADR 可在站內閱讀（`#/docs/decisions/README`、`#/docs/decisions/<編號>-…`）；以 `/` 結尾的網址視為該目錄的 README。文件內指向 `docs/` 底下 `.md` 的相對連結，依目前文件所在的目錄轉成站內連結。

### 修正

- `Store` 跨分頁同步改以 `storageKey` 隔離，修復多個不同 `storageKey` 的 `Store` 互相污染；頂層 `delete` 改為在遠端真正執行刪除而非寫入 `undefined`；不同鍵並行更新以增量合併寫回 `localStorage`，同鍵衝突採 Lamport clock + sender LWW 收斂，並阻擋 `__proto__` 等不安全鍵名。
- 頁尾「架構決策 (ADR)」連結指向不存在的 `docs/decisions/` 目錄頁，開啟後顯示「無法載入文件: decisions」。
- `docService.getDoc()` 拒絕不是文件 id 的名稱（例如含 `..`），不發出請求。
- 前端互動與離線快取：修復非同步表單／對話框輸入保留、導覽可及性與裝置資源釋放，補齊 Service Worker 離線快取隔離（含 `lib/broadcast-channel.js` 啟動相依）與內容雜湊同步。

---

## [3.1.0] - 2026-11-04

### 新增

- `<x-route>` 的 `<template>` 寫法：內容只在路由啟用時建立、停用時移除，頁面在進入與離開時各收到一次 `connectedCallback`／`disconnectedCallback`（[ADR 0102](./docs/decisions/0102-route-owned-page-lifecycle.md)）。不寫 `<template>` 的舊寫法行為不變。
- `router.refresh()`：網址沒變、但守衛條件改變時讓 `<x-switch>` 重新比對；`vanilla-sdk.js` 在 `authService` 的 `auth-change` 時自動呼叫。
- `data-persistent` 可直接標在 `render()` 每次輸出的元素上（例如 `<x-switch data-persistent="routes">`），重繪時保留原本的節點。

### 修正

- `<x-switch>` 會停用巢狀 `<x-switch>` 裡的路由；現在只管理屬於自己的路由。
- morph 在前面的兄弟是重建的自訂元素時，會搬動後面被保留的節點，整棵子樹因此重跑 `disconnectedCallback`／`connectedCallback`。

### 變更

- 展示站：所有路由改用 `<template>` 寫法，`App` 重繪（主題、語系、選單、登入狀態）不再重建目前的頁面；實驗室子頁改為各自延遲載入，不再一次預載 39 個模組；停在受保護頁面時登出會導向登入頁。

---

## [3.0.0] - 2026-11-04

### ⚠️ 破壞性變更

- **`BaseComponent` 重繪改為 DOM morphing**（[ADR 0100](./docs/decisions/0100-dom-morphing-updates.md)）。一般元素在重繪後保留同一個節點，綁在上面的監聽器繼續有效；子元件（自訂元素）照舊重建。
  - **遷移**：覆寫 `update()` 並在其中重新 `addEventListener` 的元件，現在每次重繪都會多疊一個監聽器。改為在 `afterFirstRender()` 綁一次，最好對元件本身做事件委派（`event.target.closest(...)`）。需要舊行為時可設定 `static morphUpdates = false`。
- **`<x-switch>` 不再內建登入判斷**（[ADR 0101](./docs/decisions/0101-core-entry-point.md)）。`auth-required` 路由改呼叫 `router.authGuard(route)`，預設一律放行；導向的頁面由 `router.loginPath`（預設 `/login`）決定。
  - **遷移**：透過 `lib/vanilla-sdk.js` 使用時不需處理，SDK 載入時會自動接上 `authService`。直接 import `components/route/` 或 `lib/core.js` 時，請在啟動時設定：
    ```javascript
    router.authGuard = () => authService.isAuthenticated;
    ```
- **路由比對規則統一為 `matchRoute()`**（`lib/router.js`，見 [router.md](./docs/router.md)）。非 `exact` 的前綴比對改以路徑段為界：`/lab` 符合 `/lab/x`，不再符合 `/labx`；結尾 `/*` 同時符合前綴本身；比對不分大小寫。
  - **遷移**：依賴「字串前綴」比對（例如以 `/lab` 同時接住 `/labx`）的路由要改寫樣式。

### 新增

- `lib/core.js`：只含核心的入口，不載入任何展示用 service；測試會檢查它的相依圖與匯出清單。
- `VERSION`（`lib/version.js`），由 `core.js`、`vanilla-sdk.js` 匯出，`VanillaSDK.version` 也可取得。
- 路由參數：`:name` 樣式的值放在 `route.params`，`<x-route>` 的 `match` 事件一併帶出。
- `router.authGuard`、`router.loginPath`。
- 本機一次執行 CI 全部檢查的 `scripts/check.sh`（只檢查，不提交）。
- 零依賴的瀏覽器測試（headless Chrome，根目錄與子路徑各一次）：元件行為、全站路由與文件冒煙測試、主題／語系／登入登出與實驗室音量滑桿互動。
- 文件的 Markdown 解析器支援表格、引用、有序與巢狀清單、h4–h6、分隔線與清單項目內的代碼塊；文件內的相對連結在站內轉為文件頁或 GitHub 上的檔案。
- `pwaService.registerPeriodicSync(tag, minInterval)`：註冊定期背景同步，先檢查支援度與權限。

### 修正

- `appStore` 巢狀屬性的變更也會寫入 `localStorage`、發出 `change` 並跨分頁同步；收到其他分頁的 Undo／Redo 快照會正確套用。
- 文件頁 XSS：網址帶入的文件名稱與 Markdown 內的原始 HTML 一律轉義，連結擋下 `javascript:` 等危險 scheme。
- Shadow DOM 元件內的 Lucide 圖示不會渲染；圖示改為只掃描元件自身內容。
- 依實際部署路徑設定 `<base>`，在 repo 根目錄啟動伺服器時資源不再 404。
- `BaseComponent.css` 改為回傳 `SafeHTML`，放進 `html` 模板時不再被轉義成文字（`x-chart`、`x-isolated-card` 的樣式因此失效）。
- `i18n.t()` 的參數為 `0` 或 `false` 時照實輸出，不再變成空字串。
- 實驗室：音量滑桿拋出 `ReferenceError`、藍牙連線沒有開啟裝置選擇視窗、影像工作室下載的是未套用濾鏡的原圖、定期背景同步呼叫不存在的方法、GitHub 搜尋的語音搜尋呼叫不存在的 `once()`、WebCodecs 未處理 `{ supported: false }`、MIDI 聯動未先取得 MIDI 存取權。
- 進入實驗室子頁時子頁面元件被建立多次（從其他頁切入時為 3 次）：`<page-lab>` 預載子頁面模組後不再重繪，預載只在第一次進入時執行。
- `paymentService.checkout()` 的總額沿用商品的幣別，不再固定為 USD。
- `manifest.json` 的 `share_target.action` 改為 `./index.html#/lab/web-share`，系統分享時不再開到 manifest 本身；背景下載的通知點擊會聚焦已開啟的實驗室分頁。

### 變更

- Service Worker 改為網路優先，離線時才回退快取；快取版本依檔案內容自動產生（[ADR 0097](./docs/decisions/0097-network-first-sw-versioning.md)），移除「發現新版本」提示。
- 移除會自動 commit 並推送 master 的 `scripts/sync.sh`。
- 逐份核對文件與程式，修正 36 份文件中過時或錯誤的描述與範例；`media-streams.md`、`web-payment.md` 併入 `media-capture.md`、`payment-request.md` 後移除。

---

## 2.6.1 以前

見 git tag（`v1.1.0` 至 `v2.6.1`）與對應的 commit 訊息。
