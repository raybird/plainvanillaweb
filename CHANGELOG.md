# Changelog

版本依 [語意化版本](https://semver.org/lang/zh-TW/) 編號，範圍是核心（`lib/core.js` 匯出的 API）與 `lib/vanilla-sdk.js`；展示站（Lab、文件、Dashboard）的變動只在影響使用方式時列出。

固定版本的引用方式（jsDelivr 依 git tag 提供，內容不會再變）：

```javascript
import { BaseComponent, html, router } from 'https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v3.0.0/lib/core.js';
```

`https://raybird.github.io/plainvanillaweb/lib/...` 永遠是最新的 master，適合試用，不適合正式專案。

**發版步驟**：更新 `lib/version.js` 的 `VERSION` 與本檔最新一節 → 執行 `scripts/check.sh` → commit → 打 tag `v<VERSION>` 並推送。`tests/core.test.js` 會檢查 `VERSION` 與本檔最新一節一致。

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
- `paymentService.checkout()` 的總額沿用商品的幣別，不再固定為 USD。
- `manifest.json` 的 `share_target.action` 改為 `./index.html#/lab/web-share`，系統分享時不再開到 manifest 本身；背景下載的通知點擊會聚焦已開啟的實驗室分頁。

### 變更

- Service Worker 改為網路優先，離線時才回退快取；快取版本依檔案內容自動產生（[ADR 0097](./docs/decisions/0097-network-first-sw-versioning.md)），移除「發現新版本」提示。
- 移除會自動 commit 並推送 master 的 `scripts/sync.sh`。
- 逐份核對文件與程式，修正 36 份文件中過時或錯誤的描述與範例；`media-streams.md`、`web-payment.md` 併入 `media-capture.md`、`payment-request.md` 後移除。

---

## 2.6.1 以前

見 git tag（`v1.1.0` 至 `v2.6.1`）與對應的 commit 訊息。
