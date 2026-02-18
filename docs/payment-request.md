# 原生支付整合 (Payment Request API)

Payment Request API 旨在標準化網頁上的結帳流程，消除繁瑣的表單填寫，提供一致且流暢的支付體驗。

## 1. 核心概念

- **PaymentRequest**: 這是 API 的核心物件，負責管理支付方式、交易詳情與選項。
- **PaymentMethod**: 定義支援的支付手段（如信用卡、Google Pay、Apple Pay）。
- **PaymentDetails**: 包含商品列表、總金額與運費選項。

## 2. 實作流程

### 初始化請求
```javascript
const methods = [{ supportedMethods: 'basic-card' }];
const details = {
    total: { label: '總計', amount: { currency: 'USD', value: '10.00' } }
};
const request = new PaymentRequest(methods, details);
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
2.  **原生結帳**：點擊按鈕後直接呼叫瀏覽器的支付 UI。
3.  **流程模擬**：完整演示從「發起請求」到「完成支付」的生命週期。

## 4. 注意事項

- **HTTPS**: 此 API 僅在安全上下文下可用。
- **後端整合**: 前端僅負責收集支付資訊，實際扣款仍需透過 Stripe、PayPal 等支付閘道的 SDK 或 API 在後端完成。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
