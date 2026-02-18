# ADR 0042: 原生儲存管理服務 (Native Storage Management Service)

## 上下文
在現代 PWA 應用中，數據的可靠性至關重要。瀏覽器預設會將 IndexedDB 與 LocalStorage 標記為「暫時性 (Best-effort)」，當硬碟空間不足時，瀏覽器可能會在不通知的情況下刪除數據。此外，使用者無法直觀了解應用程式佔用了多少空間。

## 決策
實作基於 **StorageManager API** 的 `StorageService`：
1.  **配額監控**: 利用 `navigator.storage.estimate()` 即時獲取 `usage` 與 `quota`，並轉換為易讀的 MB/GB 格式。
2.  **持久化請求**: 實作 `requestPersistence()`，透過 `navigator.storage.persist()` 向瀏覽器申請數據保護（持久化儲存）。
3.  **儀表板整合**: 在開發者控制台展示儲存指標與進度條，並提供一鍵請求持久化的按鈕。

## 後果
- **優點**: 顯著提升了離線數據的安全性與應用的穩定性。
- **優點**: 讓開發者與使用者對應用程式的資源佔用有更清晰的認識。
- **優點**: 展示了原生 Web API 在系統級資源管理上的成熟度。
- **缺點**: 持久化權限的授與完全取決於瀏覽器策略（部分瀏覽器會根據 PWA 安裝狀態或使用者互動頻率自動核准）。
