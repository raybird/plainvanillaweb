# ADR 0097: Service Worker 改採網路優先，並依檔案內容自動產生快取版本

## 狀態
已接受 (Accepted)，2026-11-03。取代 [ADR 0016](./0016-pwa-support.md) 的快取策略部分與 [ADR 0058](./0058-sw-notification-debounce.md)。

## 背景
`sw.js` 原本採用 Stale-While-Revalidate，`CACHE_NAME` 靠人工修改（最後一次是 2026-07-05 的 `vanilla-cache-v7`），`index.html` 的 `index.js?v=` 也是手動填寫。2026-11-03 發布 base href、Store 與文件 XSS 修正時，實際遇到下列問題：

1. **更新不會觸發**：只要 `sw.js` 本身沒變，瀏覽器就不會安裝新版 Service Worker，也不會出現更新提示。
2. **要開兩次才看到新版**：第一次載入一律回傳快取裡的舊檔，新檔只在背景寫入快取；路由延遲載入的頁面模組要被開過一次，下次才會更新。
3. **新舊檔案混用**：每個檔案各自在背景更新，同一次載入可能拿到新的 `index.html` 配上舊的 `store.js`。
4. **只讓 HTML 走網路優先無法解決**：快取比對使用 `ignoreSearch`，新 HTML 帶的 `index.js?v=` 照樣會命中舊 JS，變成新 HTML 配舊 JS，比全部都舊更糟。

## 決策
1. **全部同源 GET 請求改為網路優先**：以 `fetch(request, { cache: 'no-cache' })` 一律向伺服器驗證，檔案沒變時只回 304；成功時寫入快取，失敗（離線）時才回退到快取，頁面導覽可回退到 `index.html`。
2. **安裝時略過 HTTP 快取**：預先快取核心資產時使用 `cache: 'reload'`，避免把 GitHub Pages 上仍在 `max-age=600` 有效期內的舊檔放進新版快取。
3. **版本號自動化**：新增 `scripts/update-sw-version.js`，依 git 追蹤中、網站會載入的檔案內容計算 SHA-256（排除 `tests/`、`scripts/`、`.github/`、`.agent/`、根目錄 `*.md` 與 `sw.js` 本身），寫入 `CACHE_NAME` 與 `index.js?v=`。CI 以 `--check` 檢查版本號與檔案內容一致，`scripts/sync.sh` 在提交前自動執行。
4. **移除「有新版本」通知**：上線時這次載入的已是最新檔案，新版 Service Worker 只是更新離線快取，不再請使用者重新整理；ADR 0058 的跨分頁防抖機制一併移除。

## 後果
- **優點**：上線後第一次載入就是一致的新版，不會新舊混用；發版不必記得手動改版本號，忘了執行腳本會被 CI 擋下；離線仍可使用。
- **缺點**：每次載入的每個檔案都要等一次網路往返（多半是 304），在慢速網路下首次渲染比直接讀快取慢；修改網站檔案後必須執行 `node scripts/update-sw-version.js` 並一併提交。
- **過渡期**：已安裝舊版 Service Worker 的使用者，第一次開啟時仍由舊版 Service Worker 處理請求（Stale-While-Revalidate），新版安裝後從下一次載入開始生效。
