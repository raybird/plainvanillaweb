# 🤝 原生 CRDT 數據同步 (Conflict-free Data Sync)

在多設備或多分頁協作應用中，並發修改（Conflict）是最大的技術挑戰。本單元展示如何實作零相依的 **CRDT** 機制，確保數據在無伺服器協調的情況下達成最終一致性。

## 🌟 為什麼需要 CRDT？

傳統的數據同步通常依賴中央伺服器進行版本控制。然而，在離線優先或 P2P 環境中，會發生：
1.  **數據覆蓋**：最後一個上線的人覆蓋了別人的改動（Lost Updates）。
2.  **狀態不一致**：不同用戶看到的內容不相同。

`CRDT` (Conflict-free Replicated Data Types) 透過數學算法確保：無論數據更新的順序為何，只要所有更新都被接收，所有節點最終都會收斂至相同的狀態。

## 🛠️ 核心實作：LWW-Register

本專案實作了 **Last Write Wins (LWW) Register** 暫存器：
1.  **Metadata**: 每個數據異動都附帶 `timestamp` (時間戳記) 與 `nodeId` (節點 ID)。
2.  **Merge Logic**: 
    - 比較時間戳記，較大者勝。
    - 若時間相同，比較節點 ID（字母序），較大者勝。

```javascript
merge(other) {
    if (other.timestamp > this.timestamp) {
        this.value = other.value;
        this.timestamp = other.timestamp;
    } else if (other.timestamp === this.timestamp && other.nodeId > this.nodeId) {
        this.value = other.value;
    }
}
```

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面體驗即時協作筆記。試著開啟兩個分頁，模擬並發編輯，您將看到系統如何優雅地處理衝突並維持一致。
