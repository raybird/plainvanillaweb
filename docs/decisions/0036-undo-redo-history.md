# ADR 0036: 原生撤銷/重做歷史服務 (Native Undo/Redo History Service)

## 上下文
在複雜的 Web 應用中，使用者常需要撤銷先前的操作。傳統框架（如 Redux）利用不可變狀態輕鬆實作此功能，但在 Vanilla 環境中需要手動實作狀態管理與追蹤。

## 決策
實作基於 **快照模式 (Snapshot Pattern)** 的 `HistoryService`：
1.  **快照機制**: 在 `appStore` 發生變更時，自動（或手動觸發）對底層狀態進行深拷貝快照並存入 `undoStack`。
2.  **雙棧管理**: 維持 `undoStack` 與 `redoStack`。執行 `undo` 時，將當前狀態存入 `redoStack`；執行 `redo` 時則反之。
3.  **Store 整合**: 擴充 `Store` 加入 `applySnapshot()` 方法，允許直接將底層數據替換為快照內容，並發送特殊變更事件通知 UI。
4.  **防迴圈機制**: 透過 `isSnapshot` 標記，避免 Dashboard 在還原歷史時記錄新的快照。HistoryService 在移動堆疊之前先以 `structuredClone()` 建立快照，避免複製失敗時遺失歷史。對仍使用可 JSON 序列化 Proxy 狀態的呼叫端，保留舊的 JSON 快照備援。

## 後果
- **優點**: 零依賴實作了高級狀態管理功能，大幅提升應用的互動價值。
- **優點**: 作為教學範例，清楚展示了設計模式（快照與命令模式）在原生 JS 中的應用。
- **缺點**: 對於超大型狀態對象，頻繁的深拷貝可能會有性能影響（但對本專案規模來說可忽略）。
