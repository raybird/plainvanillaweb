# ADR 0026: 組件反應式本地狀態 (Reactive Local State for Components)

## 上下文
在之前的實作中，`BaseComponent` 的子類別必須在修改內部狀態 (this.state) 後手動呼叫 `this.update()`。這種方式容易遺漏更新，且增加了樣板代碼。

## 決策
在 `BaseComponent` 中引入 `initReactiveState()` 方法。
1.  **Proxy 封裝**: 使用原生 JavaScript `Proxy` 對初始狀態進行封裝。
2.  **自動觸發**: 在 `set` 攔截器中，自動呼叫組件的 `this.update()` 方法。
3.  **語法簡潔**: 子組件只需透過 `this.state.key = value` 即可觸發 UI 更新，無需手動管理更新流程。

## 後果
- **優點**: 大幅減少開發者的心智負擔，確保 UI 始終與數據同步。
- **優點**: 使原生 Web Components 的開發體驗更接近主流反應式框架（如 Vue/React）。
- **缺點**: 簡單的 Proxy 實作目前僅支援頂層屬性的變更追蹤。若需要深層監聽 (Deep Watch)，未來需進一步優化。
