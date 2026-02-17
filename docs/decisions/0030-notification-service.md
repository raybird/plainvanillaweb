# ADR 0030: 通知機制抽象化 (Notification Service Abstraction)

## 上下文
原本的通知機制直接耦合在 `appStore` 與 `NotificationArea` 組件中。組件不僅負責渲染，還負責定時移除通知的邏輯。這種設計導致通知邏輯難以在非組件環境中使用（如 Service 層），且不利於單元測試與擴展（如不同類型的通知）。

## 決策
實作 **`NotificationService`** 並重構通知系統：
1.  **邏輯集中化**: 通知、自動移除定時器、通知清單管理全部移至 `lib/notification-service.js`。
2.  **類型支持**: 引入 `success`, `error`, `warn`, `info` 等語義化方法與類型標記。
3.  **事件驅動**: 組件僅監聽 Service 的 `add` 與 `remove` 事件，保持組件的「純粹性」(Stateless rendering)。
4.  **解耦 Store**: 從 `appStore` 中移除通知狀態，將其視為一種瞬態服務而非持久化狀態。

## 後果
- **優點**: 邏輯更加清晰，易於維護與測試。
- **優點**: 任意 Service 或邏輯層現在都可以輕鬆觸發通知，無需依賴 DOM。
- **優點**: 方便未來實作更複雜的 UI 效果（如堆疊、動畫、手動關閉）。
- **缺點**: 增加了一個新的服務檔案與類別繼承。
