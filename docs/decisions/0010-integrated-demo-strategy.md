# ADR 0010: 整合範例策略 (Integrated Demo Strategy)

## 上下文
各個獨立的技術點（Worker, Store, Error Boundary）分開展示難以呈現系統全貌。

## 決策
實作一個 `Dashboard` 頁面，將所有機制放在同一個畫面上互動。

## 後果
- **優點**: 提供最強大的「人機共學」教材。
- **優點**: 方便進行綜合回歸測試。
- **缺點**: Dashboard 代碼耦合度較高（因為它本來就是為了整合）。
