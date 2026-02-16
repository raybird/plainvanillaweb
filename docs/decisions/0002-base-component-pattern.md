# ADR 0002: 極簡組件模式 (BaseComponent Pattern)

## 上下文
原生 Web Components 的 `connectedCallback` 與 `innerHTML` 更新邏輯散落在各處，代碼冗餘且難以維護。

## 決策
引入 `BaseComponent` 基類，規範 `render()` 方法與 `update()` 觸發機制。

## 後果
- **優點**: 減少子組件重複代碼，強制分離「渲染邏輯」與「生命週期邏輯」。
- **優點**: 維持 100% 原生 DOM 操作，不引入 VDOM 複雜度。
- **缺點**: 略微增加了物件繼承的深度。
