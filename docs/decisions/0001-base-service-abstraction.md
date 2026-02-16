# ADR 0001: 服務層抽象化 (BaseService Abstraction)

## 上下文 (Context)
隨著專案規模擴大，出現了多個具備「事件分發」與「狀態管理」需求的服務 (Store, Router)。直接繼承 `EventTarget` 雖然可行，但缺乏統一的行為規範。

## 決策 (Decision)
建立 `BaseService` 作為所有服務層的基類。

## 後果 (Consequences)
- **優點**: 代碼更簡潔，具備統一的 `emit` 接口，方便 AI Agent 理解服務邏輯。
- **優點**: 易於在基類層級統一實作 Log 紀錄或除錯工具。
- **缺點**: 增加了一層類別繼承結構。
