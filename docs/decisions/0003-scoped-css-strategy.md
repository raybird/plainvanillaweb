# ADR 0003: CSS 封裝策略 (Scoped CSS Strategy)

## 上下文
在原生 Web Components 中，Shadow DOM 提供最強的 CSS 隔離，但會增加與全域樣式（如主題變數）整合的複雜度。

## 決策
目前選擇 **不使用 Shadow DOM**，而是採用 **CSS 變數 + BEM 命名規範**。

## 理由
- 易於整合全域的 Dark Mode 主題。
- 效能最高，減少瀏覽器解析多個 Shadow Root 的開銷。
- 保持「Plain Vanilla」的極簡透明度。
