# 原生支付整合 (Payment Request API)

Payment Request API 旨在標準化網頁上的結帳流程，消除繁瑣的表單填寫，提供一致且流暢的支付體驗。

## 1. 核心概念

- **PaymentRequest**: 這是 API 的核心物件，負責管理支付方式、交易詳情與選項。
- **PaymentMethodData**: 定義支援的付款方式識別碼（如 Google Pay `https://google.com/pay`、Apple Pay `https://apple.com/apple-pay`）與其設定。
- **PaymentDetailsInit**: 包含商品列表（`displayItems`）、總金額（`total`）與運費選項。

### 核心優勢

- **快速結帳**：自動填入瀏覽器儲存的地址與付款資訊，使用者不必重複填寫表單。
- **一致體驗**：使用原生的系統介面，提升信任感。
- **開發簡化**：不再需要自行維護複雜的付款表單與驗證邏輯。

## 2. 實作流程

### 初始化請求

> ⚠️ `basic-card` 已於 Chrome 100 (2022) 起被各大瀏覽器移除，請改用 URL 型付款方式
> （如 Google Pay `https://google.com/pay`、Apple Pay `https://apple.com/apple-pay`）。

```javascript
const methods = [{
    supportedMethods: 'https://google.com/pay',
    data: { /* Google Pay merchant 設定 */ }
}];
const details = {
    total: { label: '總計', amount: { currency: 'TWD', value: '100.00' } }
};
const request = new PaymentRequest(methods, details);

// 先以 canMakePayment() 確認是否有可用付款方式，再啟用結帳按鈕
if (await request.canMakePayment()) {
    // 顯示／啟用結帳按鈕
}
```

### 顯示支付介面
```javascript
const response = await request.show();
// 此時瀏覽器會彈出原生的支付視窗
```

### 處理支付結果
```javascript
// 模擬傳送 response 至後端驗證
await sendToBackend(response.toJSON());

// 通知瀏覽器支付結果 (關閉視窗)
await response.complete('success');
```

## 3. 本專案的實踐

在「實驗室 (Lab)」中，我們展示了：
1.  **模擬購物車**：建立一個包含多個項目的訂單。
2.  **原生結帳**：先以 `canMakePayment()` 偵測，有可用付款方式時才啟用按鈕並呼叫 `request.show()`；本範本無商家憑證，多數環境下按鈕會停用。
3.  **流程模擬**：演示從「發起請求」到「完成支付」的生命週期，後端驗證以 1 秒延遲模擬，未串接真實金流。

## 4. 注意事項

- **HTTPS**: 此 API 僅在安全上下文下可用。
- **第三方整合**: 實際串接 Google Pay 或 Apple Pay 時，需在 `methods` 的 `data` 中填入對應的商家 ID 與設定。
- **幣別**: `total` 與 `displayItems` 的幣別必須一致，API 不做匯率換算；本專案的 `paymentService.checkout()` 會沿用商品的幣別。
- **後端整合**: 前端僅負責收集支付資訊，實際扣款仍需透過 Stripe、PayPal 等支付閘道的 SDK 或 API 在後端完成。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
