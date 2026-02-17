# 架構決策紀錄 (Architecture Decision Records)

本目錄紀錄了專案所有的重大技術決策。這不僅是為了人類開發者，更是為了讓協作的 AI Agent 能理解系統的設計意圖與約束。

## 決策索引 (Index)

- [**0001: 服務層抽象化 (BaseService)**](./0001-base-service-abstraction.md)
- [**0002: 極簡組件模式 (BaseComponent)**](./0002-base-component-pattern.md)
- [**0003: CSS 封裝策略 (Non-Shadow DOM)**](./0003-scoped-css-strategy.md)
- [**0004: AI 專用維護工具 (sync.sh)**](./0004-ai-maintenance-tooling.md)
- [**0005: CSS 變數封裝規範**](./0005-css-variables-encapsulation.md)

## ADR 格式規範
每一份 ADR 應包含：
1. **上下文 (Context)**：遇到的問題或背景。
2. **決策 (Decision)**：採取的具體方案。
3. **後果 (Consequences)**：該決策帶來的優缺點。
