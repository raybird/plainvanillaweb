# Modern Web Guidance 全 repo 前端審查

日期：2026-11-18。程式基準：`8cd1324`。以下原始審查以該提交為基準。修復與複查結果見文末。

## 結論與範圍

優先修正互動正確性、快取隔離與資源生命週期，再進行載入與 CSS 優化。原生 ES Modules、Custom Elements、單例 services、hash router 與零依賴／零建置架構可保留；目前沒有證據支持為了現代化而更換框架或引進打包器。

本次涵蓋入口、App、BaseComponent／morph、router／route／switch、HTML 模板與 Markdown、安全邊界、表單、modal、notification、theme、history、store、虛擬列表、全域 CSS，以及 SW／workers 與主要平台 services。平台側重點包括 PWA、Serial、Bluetooth、NFC、MIDI、Speech、File System、Media、Stream Processor、WebGPU、Worker、WebRTC、Audio、Image、Prefetch、Performance。自動瀏覽器冒煙測試走訪所有列出的 51 個路由及 52 份文件。

這是跨 repo 的原始碼與 Chromium 行為審查，不是每個硬體 API 的實機驗收，也不是 Safari／Firefox 相容性認證。沒有量測真實裝置的 CWV、記憶體曲線或 Lighthouse 分數；以下將已重現、靜態確認與待量測的機會分開。

## 指引與掃描

- 執行 `npx -y modern-web-guidance@latest legacy-scan . --json`：52 條規則、38 個指南，命中 4 處。工具明示僅涵蓋約 20% 指南；4 處不等於只有 4 個問題。
- 廣泛審查使用一次 `list`；再以 `search "measure core web vitals"`、`search "safe enter submit"` 查詢特定題目。
- 完整讀取：`js`、`dialog`、`forms`、`accessibility`、`custom-elements`、`dark-mode-toggle`、`responsive-design`、`security`、`performance`、`same-document-transitions`、`ime-safe-enter-submit`、`full-session-analytics`、`interaction-paint-timing`。
- `full-session-analytics` 的上報管線不對應目前的本機展示需求，不列為必做；較新的 soft-navigation 指標只適合能力偵測後的選配增強。

## 高優先：可影響現有操作

### A01：重繪清空未綁定的輸入值（已於 Chromium 重現）

位置：`lib/morph.js:149`、`components/pages/Login.js:60`、`components/pages/lab/FormsPage.js:60`。

`syncFormState()` 每次都以新模板的 `defaultValue` 覆寫目前 `.value`。登入頁沒有將輸入寫回模板；`loading` 或錯誤狀態重繪會把帳密清空。表單示範在 `input` 更新驗證狀態後，也把剛輸入的字清空，內部 control 卻仍保留值。

重現結果：登入輸入 `typed-user`／`typed-password` 後設定 `loading=true`，兩個 DOM 值均變為空字串；Forms 輸入 `admin` 後，DOM 為空字串、control 值為 `admin`。

建議：明確區分由狀態控制與保留 DOM 值的欄位。可先在頁面層補齊受控欄位契約，或設計 morph 僅在模板明確要求改值時同步；不要直接取消全部 value 同步，因現有瀏覽器測試明確要求受控欄位跟隨模板。密碼狀態不得持久化或寫入日誌。

驗收：輸入、貼上、自動填入、顯示 pending／登入失敗及切換語系後輸入仍符合契約；明確 reset 及外部值更新仍生效；既有受控欄位測試保留。

### A02：非同步表單驗證競態與 pending 放行（Node 重現）

位置：`lib/form-engine.js:35`、`:102`、`:112`；`components/pages/lab/FormsPage.js:44`。

每次驗證沒有版本號或取消機制；舊值較慢回覆，會覆寫新值的結果。`FormGroup.valid` 只看 `valid`，忽略 `pending`；`validateAll()` 不回傳可等待的完成結果，提交端立刻判斷有效性。

重現：先驗證 `old` 再驗證 `new`，先完成新請求、再讓舊請求回錯誤，最後得到 `{value:'new', errors:{stale:true}}`。另一案例得到 `{pending:true, valid:true}`。

建議：捕獲該次 value，加驗證序號，僅最新回覆能提交狀態；每個完成／短路路徑一致更新 pending。`validateAll()` 回傳 Promise，提交等待最新驗證完成；pending 不得視為可提交。Forms 宣告必填 email control 卻沒有 email 輸入，也應補齊或移除該控制項。

驗收：舊請求最後回覆不影響新值；非同步檢查未完成時不發成功通知；空值、錯誤、拒絕及連續提交結果一致。

### A03：Skip link 與 hash router 衝突（Chromium 重現）

位置：`app/App.js:126`、`lib/router.js` 的 `currentPath`／`handleHashChange()`。

`href="#main-content"` 改變的是 router 使用的 hash；點擊後路徑成為 `main-content`，落到 404。實測 `{hash:'#main-content', notFound:true}`。

建議：在 skip link 專用事件中阻止 URL 變更，將焦點移至既有 `main[tabindex="-1"]` 並依需要捲動；或定義能明確區別錨點與路由的契約。不要只讓 router 忽略此次變化而留下無法重新整理的 hash。

驗收：鍵盤啟用後 URL／目前路由不變，焦點進主內容；根目錄與 `/plainvanillaweb/` 均正確。

### A04：對話框關閉未完成 Promise，狀態也未同步（Chromium 重現）

位置：`components/Modal.js:34`、`:46`、`:61`；`lib/modal-service.js:27`、`:44`、`:60`。

原生 `close` listener 只清 `_options`，沒有執行取消結果或清 service `_current`。Esc 的原生關閉會使 `confirm()` 永遠 pending；程式直接關閉、重疊開啟、App 重繪移除 modal 也沒有一致的收尾契約。`alert()` 只有確認回呼，同樣要定義原生 dismiss 的結果。

測試原生 `.close()` 路徑後，得到 `{settled:false, currentStillSet:true}`；Esc 的正常關閉也走此 listener。另 `<dialog>` 缺少連到標題的 `aria-labelledby`，且未指定安全的初始焦點。

建議：集中於單一 close／settle 流程，所有關閉方式恰好完成一次；定義重疊 open 採排隊或取消前一筆；App 重繪時保留 modal 容器或確實清理。保留原生 `showModal()` 的焦點與 inert 行為，不加手動 focus trap。補名稱與必要捲動隔離。

驗收：確認、取消、Esc、程式 close、重疊 open、容器移除均不留下 pending Promise／stale current，回呼不重複；螢幕閱讀器能讀到標題。

### A05：SW 清除同 origin 其他應用的快取（靜態確認）

位置：`sw.js:34`。

activate 遍歷 `caches.keys()`，刪除所有名稱不等於目前版本的 cache。CacheStorage 不按 SW scope 隔離；GitHub Pages 同 origin 的其他子路徑專案、其他用途的 caches 也會被刪除。

建議：使用含應用識別／部署 scope 的 cache namespace，僅清理本應用舊版本。離線讀取也改從當前 app cache 開始，而不是無限制 `caches.match()`。不要在修正時順便清除整個 origin storage。

驗收：預先放入本應用舊 cache、新 cache 與另一應用 cache；activate 僅刪除第一個。不同 query 的資料不得因全域 `ignoreSearch:true` 互相命中。

## 中優先：可靠性、可及性與相容性

### A06：Background Fetch 探測錯 namespace（靜態＋官方文件確認）

位置：`lib/pwa-service.js:80`、`:106`、`:114`。

guard 查 `window.backgroundFetch`，實際 API 是 `ServiceWorkerRegistration.backgroundFetch`，會在具備 API 的環境誤判不支援。`getFetch()`／`getFetchIds()` 則未做同樣保護。

建議：取得 ready registration 後查該物件能力；將支援、未安裝／未就緒、使用者拒絕與執行失敗分開。實驗功能可以明確顯示不支援，不需要強加 polyfill。

驗收：支援環境會呼叫 registration 的 manager；缺少能力時顯示明確訊息，不拋 undefined property 錯誤。[MDN API 定義](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/backgroundFetch)（查證：2026-11-18）。

### A07：效能面板的 0 可能代表未採樣，CWV 定義也需更新

位置：`lib/performance-service.js:10`、`:35`、`:46`、`:58`。

只監聽未來 `load`，正常先開首頁再進延遲載入的效能頁就收不到。Chromium 實測 navigation entry `loadEventEnd` 約 230 ms，但 service `loadTime`／`domReady` 均為 0。observer 不支援也被空 catch 隱藏，與真實零值混淆。

此外仍用 FID，CLS 是整段生命週期累加；若稱為標準 CWV，應改採 INP 與最大 session window CLS。這是指標正確性，不能以這次測試的 CLS 數字直接宣稱網站 CWV 好壞。

建議：初始化立即讀既有 navigation entry，需要時再監聽 load；用 `null`／status 表示未採樣或不支援。先明確區分硬導覽指標與 hash 路由耗時；維持零依賴時可實作必要演算法，或明標「簡化展示」而非標準分數。

驗收：load 前後初始化均有正確資料；不支援不顯示 0 ms；兩個相隔超過 1 秒的 shift 群組以最大視窗計算。依官方定義，CLS 視窗間隔少於 1 秒、每窗最長 5 秒；INP 已取代 FID。[CLS](https://web.dev/articles/cls)、[INP 公告](https://web.dev/blog/inp-cwv-march-12)（查證：2026-11-18）。

### A08：頁面重訪留下 singleton 訂閱（靜態確認）

位置：`components/pages/lab/PWAAdvancedPage.js:20`、`components/pages/lab/PerformancePage.js:26`、`lib/base-service.js:19`。

connected 註冊匿名 callback，沒有 disconnected 退訂；service 的 `_listenersMap` 持有 callback，callback 捕獲已移除的頁面。重訪後可重複通知並更新舊 DOM。`HistoryPage.js:35` 也沒有清 `_saveTimeout`，離開後可把已清空的歷史重新寫入。

建議：保存 `on()` 回傳的 unsubscribe，在 disconnected 執行；重連時重建；清除 timeout／rAF／observer。可沿用 Dashboard 等既有正確模式。

驗收：進出各頁 10 次，listener 數不持續增長，單一 service 事件只通知目前頁面一次；離開 History 後不再新增快照。

### A09：手機導覽只位移隱藏，鍵盤仍可進入（靜態確認）

位置：`index.css:753`、`app/App.js:134`、`:142`。

關閉側欄只 `translateX(-100%)`，連結仍在 Tab 順序及 accessibility tree。開關沒有 `aria-expanded`／`aria-controls`，開啟後也無明確 Esc／焦點返回行為。

建議：先決定 mobile drawer 是否為 modal；依語意採原生 modal dialog 或非 modal disclosure。關閉狀態移出焦點順序與 AT，桌面 breakpoint 必須恢復；不要只加 `aria-hidden` 而留下可聚焦子元素。

驗收：手機關閉時 Tab 不進隱藏連結，開啟後狀態可被讀出，關閉回原按鈕；放大與旋轉後桌面導覽仍可操作。

### A10：表單名稱、錯誤與全域通知缺少 AT 語意（靜態確認）

位置：`components/pages/Login.js:59`、`components/pages/lab/FormsPage.js:59`、`components/Notification.js:35`。

label 沒有 `for`／input id 對應，帳密缺 autocomplete；Forms 缺 `aria-invalid`、錯誤描述關聯與完整表單 submit 語意。全域 toast 沒有持續存在的 status/live region；成功與錯誤只視覺顯示。Forms 每個 input 都立即產生錯誤狀態，亦需與 touched／blur／submit 時機一致。

建議：原生 label／form／submit 優先，補 autocomplete 與錯誤關聯；建立穩定 polite status 區，只有急迫錯誤用 assertive。錯誤提交聚焦第一個無效欄位。

驗收：AT 能讀出欄位名稱、錯誤與操作結果；Enter 可提交；輸入未完成時不連續朗讀錯誤。

### A11：路由動畫未尊重 reduced motion，缺少切頁焦點策略

位置：`components/route/switch.js:24`、`components/Notification.js:38`。

主題切換有 reduced-motion guard，但路由 `startViewTransition()` 沒有；全域 CSS 也沒有對應停用規則。route 啟用／停用與異步載入後，未見一致的主內容焦點移交策略。

建議：共用 motion policy；reduced motion 直接更新 DOM，toast 等非必要動畫也停用。完整路由內容載入後才將焦點交給標題／main，避免背景 refresh 或巢狀 switch 搶焦點。目前巢狀 switch 各自啟動全文件 transition，也應由單一導航協調，避免互相跳過。

驗收：模擬 reduced motion，切頁無非必要動畫；鍵盤切頁焦點有新頁上下文；快速連點與 Lab 巢狀導覽不重複轉場。

### A12：WebRTC Enter 送出未避開 IME（靜態確認）

位置：`components/pages/lab/WebRTCPage.js:312`。

`event.key==='Enter'` 直接送出，中文／日文輸入法確認候選字可能提前送出訊息。

建議：優先原生 form submit；保留快捷鍵時檢查 `isComposing`，依目標 Safari 版本採指南建議的 229 或 composition timestamp 防護，且避免重複 implicit submit。

驗收：組字中的 Enter 不送出，組字完成後一般 Enter 只送一次；送出按鈕仍可用。此項尚未連接第二個 WebRTC peer 做實際訊息驗收。

### A13：串流停止與 Serial 關閉流程不完整（靜態風險，需專項重現）

位置：`lib/serial-service.js:42`、`:61`、`:69`；`lib/stream-processor-service.js:10`、`:37`、`:66`。

Serial 的 `pipeTo()` Promise 未等待／捕捉，disconnect 取消 reader 後直接關 port；read loop 又使用可被清空的 `this.reader`。可能留下 locked stream、拒絕未處理或重入讀取。影格管線 `stop()` 只 abort 自建 signal，不能打斷 pending `reader.read()`；若讀到 frame 才發現 abort，break 會跳過 `frame.close()`。只偵測 Processor 卻立即使用 Generator，也不是完整能力判定。

建議：以區域 reader／writer 及完成 Promise 管理關閉；stop 主動 cancel／abort，所有路徑 finally 釋放 lock／frame，完成後再 close port／track。參考 [Chrome Serial 關閉流程](https://developer.chrome.com/docs/capabilities/serial)（查證：2026-11-18）。

驗收：待決 read、正常停止、拔除裝置、transformer 拋錯與連續 start/stop 都能收斂，無未處理拒絕、鎖或影格殘留。本次未操作真實硬體／攝影機，不宣稱已量到洩漏。

## 較低優先與需量測的改善機會

### A14：深色主題與手機可視高度

位置：`index.html:4`、`lib/theme-service.js:25`、`index.css:275`、`:281`。

只有 JS 設 data-theme，沒有 `color-scheme`，也無首屏還原已保存主題的最小啟動處理。原生控制項／捲軸可與背景主題不一致；慢載入時可能先畫錯主題。固定側欄 `100vh` 可能受手機工具列遮擋。

建議：保留現有 token／data-theme 架構，將實際主題同步到原生 `color-scheme`；先畫 CSS 系統預設，再盡早套用保存值。可視側欄採適合的 `dvh`，需要穩定最小高度處評估 `svh`；不是全 repo 盲目替換 vh。

驗收：系統／明／暗三態、重新整理、封鎖 storage、跨頁籤及手機工具列伸縮；原生 input／select 與背景一致。收益需真實裝置畫面確認。

### A15：掃描命中的錯誤鏈與快照複製

位置：`lib/midi-service.js:32`、`lib/history-service.js:25`、`:55`、`:74`。

MIDI 包裝錯誤遺失原始 error，適合保留外層訊息並補 `{cause:err}`。History 的 3 處 JSON round-trip 應依輸入契約改為 `structuredClone()`；已查看的 Dashboard 傳 `_baseState`，HistoryPage 傳字串，並非直接傳 reactive Proxy，故保留為合理優化候選。

限制：不能對所有狀態盲換。BaseComponent.state 是 Proxy，`structuredClone(proxy)` 會拋 `DataCloneError`；如果 SDK 要接受 Proxy 或刻意 JSON normalization，應先定義解包／序列化契約。不要為讓掃描歸零破壞 API。

驗收：Date／Map／循環引用與一般物件依文件契約處理；不可複製值有明確失敗行為；現有 history 測試維持通過。

### A16：載入、快取容量與安全部署的後續工作

- `index.html` 載入三個字型家族與多個 weights；`index.js` 靜態載入 Home／Lab，根 App 又等候 i18n。建議先以 slow-network trace 確認首屏瓶頸，再精簡實際使用字重、對必要 ESM 使用 modulepreload、提供 shell／錯誤狀態；不預設需要 bundler。
- `sw.js` 對所有同 origin GET 的 200 basic response 寫 cache，沒有 app path／resource allowlist、容量或期限。將可快取資源與 query 語意收窄，避免外部 API／不同 query 資料被不當離線回覆。現有 network-first 是新鮮度取捨，不因指南示範 cache-first 就改掉；逐檔 network-first 也不保證部署中途的一整組版本原子性。
- `BaseComponent` 每次 update 都 render／解析整棵模板，而 custom elements 預設重建。這是已由 ADR／測試固定的行為，不能直接當 bug。先量測長頁／高頻更新與 IME，再評估局部更新；`content-visibility` 只適合量測後確認昂貴的長頁區塊。
- `lib/html.js` 對一般插值 escape 是好基礎，但不等於 URL、CSS 或 inline JavaScript 的 contextual sanitizer；`unsafe()` 是明確信任邊界。大量 inline handlers 使嚴格 CSP 無法直接啟用。先盤點輸入來源、改事件委派與 URL allowlist，再依實際 hosting 做分階段 CSP／Trusted Types；沒有證據支持直接宣稱所有 innerHTML 都是可利用 XSS。
- GitHub Pages 部署限制、動態 `<base>`、Playground iframe 與硬體展示會影響 security headers 設計；不可直接照抄 `base-uri 'none'` 或封鎖 camera／microphone 的通用配置。本次沒檢查正式站 HTTP headers，不將「repo 沒看到」當成「線上未設定」。

## 保留的既有設計

- 原生 dialog／popover、能力偵測與明確不支援訊息，符合實驗室用途。
- hash router 的既有 matcher、延遲 import、route-owned lifecycle、data-persistent 與 morph 的節點保留，已有 ADR 與測試；本次不建議為追新 API 而改寫。
- 模板預設轉義，Markdown 先 escape 再小範圍放行並限制 URL scheme，優於任意 HTML 直接插入。
- Store 已有 raw／Proxy 分離，CPU 計算與備份已有 worker；MediaPage 有 stream cleanup，可沿用其模式。
- 主題切換已有 reduced-motion guard；文件表格已有 keyboard-scroll region。應補齊一致性而非推倒重建。

## 驗證證據與缺口

1. `node --test tests/*.test.js`：14／14 測試檔通過（runner 摘要為 14 tests）。
2. `node tests/browser-runner.mjs`：根目錄與 `/plainvanillaweb/` 各 24／24 元件測試通過，並各走訪 51 路由、52 文件與既有互動測試，整體通過。runner 明確繞過 SW，所以不能驗證 A05 或離線策略。
3. 臨時 Chromium 行為探針：A01 的兩個頁面、A03、A04 的 native close、A07 的 late-init 均重現。使用 repo 既有 CDP helper、獨立 profile／本機 server；未寫入 repo 測試或使用者 browser profile。腳本位於 `/tmp/pvw-modern-audit.mjs`（暫存，不是永久測試）。
4. Node 非同步驗證探針：A02 的 stale response 與 pending-valid 均重現。
5. 其他項目為原始碼追蹤與指南比對；未執行實體 Serial／WebRTC 雙端／輸入法跨瀏覽器／AT／行動裝置專項測試。

## 建議執行順序與方案

推薦漸進修補：維持目前架構，依 A01–A05 補回歸案例並修正；接著 A06–A13 補平台與可及性契約；最後用量測決定 A14–A16 的效能工作。優點是變更可隔離且與零依賴目標相容，代價是仍需維護小型框架核心。

另一方案是重寫渲染／狀態引擎以取得細粒度更新與統一表單處理；可能降低全模板重繪，但會牽動 SDK、ADR、頁面生命週期與現有測試。現在沒有量測證據證明收益足以抵銷相容性成本，因此不推薦作為第一步。

每批以具體行為測試作驗收；硬體能力用可控 mock 驗證流程，再做實機測試。完成一批後檢查根目錄／子路徑與離線情境；不要把一次全面重構當成必要前置條件。


## 修復與複查

| 原始項目 | 已採用的修正 |
| --- | --- |
| A01–A04 | DOM morph 保留未變動預設值的即時輸入。表單只採用最新驗證，提交等待 async 結果。Skip link 保持路由並聚焦主內容。原生 modal 關閉一律完成對應的 Promise。 |
| A05–A06、A16 快取 | Service Worker 以部署範圍隔離快取，精確匹配請求，預先快取首頁模組，限制執行期間的靜態資源快取。Background Fetch 自 registration 檢查能力。 |
| A07–A08 | 延遲載入也能取得 Navigation Timing。效能面板區分無資料與零，依最大時間窗計算 CLS，並將最慢觀測互動標記為 Event Timing。頁面移除時解除訂閱與計時器。 |
| A09–A12 | 手機導覽的隱藏狀態移出 Tab 順序，Esc 返回開關。表單標籤、錯誤與通知具可及語意。轉場遵循減少動態效果。WebRTC 和 Serial 改用原生表單提交。 |
| A13 | 在停止或離開頁面時解除串流鎖、釋放影格和裝置。 |
| A14–A15 | 深色主題同步至原生控制項和首屏，側欄使用動態視窗高度。MIDI 保留 Error cause，History 採 structuredClone 並保留 JSON 相容路徑。 |
| A16 載入與信任邊界 | 移除未用的字型家族和字重，鍵盤聚焦可觸發模組預載。預覽 iframe 使用 sandbox，Markdown 的代碼標記不能插入網址屬性，一般物件不能自行聲明為 SafeHTML。 |

複查補修了虛擬列表資料換新、搜尋晚回覆與語音訂閱、首次 Undo、相機權限晚到、WebCodecs 啟動／停止競態、WebRTC 離頁收尾，以及路由守衛撤銷存取後舊頁面未即時移除的問題。Playground 範例改在預覽畫面顯示按鈕結果，配合隔離後的瀏覽器限制。[HTML iframe 規範](https://html.spec.whatwg.org/dev/iframe-embed-object.html)。

重新執行 modern-web-guidance 的舊式寫法掃描，只剩 History 的 JSON fallback。這條路徑只在結構化複製不支援該輸入時使用，並有 Proxy 相容性回歸測試。

真實裝置的 Web API、跨瀏覽器與輔助科技驗證、真實使用者效能量測，以及正式站 CSP／Trusted Types 部署仍需獨立驗證。

最終驗證使用 `./scripts/check.sh`，單元測試、語法、Service Worker 版本、ADR 索引全部通過。根目錄與 `/plainvanillaweb/` 各通過 27 項元件測試、51 個路由與 52 份文件冒煙測試，以及新增的手機導覽、Skip link、Playground 沙箱和清除 HTTP 快取後的離線重載。
