# ADR 0012: 基於 IndexedDB 的進階快取策略 (IndexedDB-based Advanced Caching)

## 上下文
專案目前使用 `LocalStorage` 進行狀態持久化與 API 快取。然而，`LocalStorage` 有 5MB 的容量限制，且操作是同步的，這在處理大型 API 響應（如 GitHub 搜尋結果）或高頻率讀寫時可能導致 UI 阻塞。

## 決策
引入 `IDBService`，利用原生的 `IndexedDB` 進行大容量數據持久化。
1. **非同步操作**: 所有的讀寫皆為非同步，避免阻塞主線程。
2. **大容量**: 支援 50MB 以上的存儲空間（視瀏覽器而定）。
3. **TTL 支持**: 延續 ADR 0008 的過期管理機制。
4. **職責分離**: 
   - `LocalStorage` (via `Store`): 用於存放輕量配置（主題、計數、最後搜尋關鍵字）。
   - `IndexedDB` (via `IDBService`): 用於存放大型 API 響應快取。

## 後果
- **優點**: 顯著提升處理大量數據時的應用程序穩定性與效能。
- **優點**: 更好的離線支援，能緩存更多歷史搜尋結果。
- **缺點**: IndexedDB API 較為複雜，需要透過 Promise 封裝以簡化使用。
