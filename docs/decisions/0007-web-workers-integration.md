# ADR 0007: Web Workers 服務化整合 (Web Workers Service)

## 上下文
對於重型運算（如大數據處理或複雜演算法），在主線程執行會導致 UI 卡頓 (Jank)。

## 決策
將 Web Worker 封裝為 `BaseService` 的子類別，透過事件驅動與 UI 層溝通。

## 後果
- **優點**: 確保 UI 始終維持 60 FPS 流暢度。
- **優點**: 維持了 Vanilla 的 Service 導向架構。
- **缺點**: Worker 腳本無法直接存取 DOM 或 localStorage。
