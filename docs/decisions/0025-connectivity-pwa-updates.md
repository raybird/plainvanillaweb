# ADR 0025: 連線狀態與 PWA 更新管理 (Connectivity & SW Update Management)

## 上下文
作為一個現代網頁應用與教學平台，使用者需要清楚地知道當前的網路連線狀態（Online/Offline）。此外，由於 PWA 的快取機制，當開發者推出新版本時，使用者往往需要一個明確的提示來重新整理頁面以獲取最新內容。

## 決策
1. **實作 ConnectivityService**: 封裝 `window.addEventListener('online/offline')`，並透過 EventTarget 廣播連線變更。
2. **優化 sw.js**: 
    - 使用 `self.skipWaiting()` 讓新版本的 Service Worker 立即進入 Active 狀態。
    - 使用 `self.clients.claim()` 讓新 SW 立即接管當前開啟的所有頁面。
3. **前端更新偵測**: 在 `index.js` 監聽 `updatefound` 事件。當新版本下載並安裝完成後，透過通知系統提示使用者。
4. **UI 反饋**: 整合至現有的通知系統，當連線斷開、恢復或有新版本時，自動發送對應的通知。

## 後果
- **優點**: 提供更完善的使用者體驗 (UX)，確保使用者意識到網路狀況與版本更新。
- **優點**: 強化了 PWA 的生命週期管理，使其更接近原生應用的行為。
- **優點**: 作為教學範例，展示了瀏覽器事件與 Service Worker 生命週期的深度整合。
- **缺點**: `skipWaiting` 可能在某些極端情況下導致頁面資產版本不一致（若頁面在更新過程中發起新請求），但在本專案規模下影響極小。
