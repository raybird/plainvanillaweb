# ADR 0063: 實作基於 CRDT 的數據一致性策略

## 狀態
已提議 (Proposed)

## 背景
`plainvanillaweb` 支援跨分頁同步與離線操作。然而，目前的 `sync-service` 僅能處理簡單的隊列，無法處理並發衝突。例如，分頁 A 在離線時修改了標題，分頁 B 在線修改了同一標題，當 A 上線後會覆蓋 B 的改動。

## 決策
引入 **CRDT (Conflict-free Replicated Data Types)** 邏輯。
1. **數據模型**：採用 `LWW-Register` (Last Write Wins Register) 作為基礎模型。
2. **唯一性識別**：每個數據異動附加 `Hybrid Logical Clock (HLC)` 模擬的時間戳記與隨機 `nodeId`。
3. **合併算法**：實作 `merge` 函數，確保無論數據到達的順序為何，所有節點最終都會收斂至相同的狀態。
4. **存儲整合**：將 CRDT 狀態持久化於 IndexedDB，確保離線後重啟依然能正確追溯。

## 後果
- **優點**：極致的系統強韌性、真正的 P2P 協作基礎、解決數據丟失問題。
- **缺點**：數據 Payload 會因為需要攜帶 Metadata 而略微增加。
