# 原生測試策略 (Vanilla Testing Strategy)

純原生專案不需要龐大的測試框架，我們建議採取以下分層策略：

## 1. Service 單元測試 (Node.js Native)
針對 `lib/store.js` 與 `lib/router.js`。由於這些 Service 不依賴 DOM，可直接在 Node.js 環境運行。

## 2. UI 整合測試 (E2E)
針對 Web Components。建議使用 **Playwright**，它能模擬真實瀏覽器行為，驗證組件渲染與事件觸發。

## 實作範例
本專案提供了一個 `tests/store.test.js` 展示如何驗證狀態管理邏輯。
