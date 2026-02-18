# 原生 Web 支付 (Payment Request API)

Payment Request API 旨在標準化結帳流程，讓使用者能透過瀏覽器儲存的信用卡或 Apple Pay/Google Pay 快速完成支付，無需重複填寫繁瑣表單。

## 1. 核心優勢

- **快速結帳**：自動填入儲存的地址與付款資訊。
- **一致體驗**：使用原生的系統介面，提升信任感。
- **開發簡化**：不再需要自行維護複雜的表單驗證邏輯。

## 2. 實作流程

### 檢查可用性
```javascript
const request = new PaymentRequest(methods, details);
if (await request.canMakePayment()) {
    // 顯示支付按鈕
}
```

### 發起請求
```javascript
const methods = [{ supportedMethods: 'basic-card' }];
const details = {
    total: { label: '總計', amount: { currency: 'TWD', value: '100.00' } }
};
const request = new PaymentRequest(methods, details);
const response = await request.show();
// 傳送 response 到後端驗證，成功後呼叫：
await response.complete('success');
```

## 3. 本專案的實踐

在「實驗室 (Lab)」中，我們提供了一個模擬結帳的範例：
1.  **商品定義**：展示如何結構化商品明細與金額。
2.  **流程模擬**：完整演示從點擊購買到完成支付的互動過程。
3.  **狀態回饋**：即時顯示 API 的回應結果與交易 ID。

## 4. 注意事項

- **安全性**：必須在 HTTPS 環境下運作。
- **第三方整合**：實際串接 Google Pay 或 Apple Pay 時，需在 `methods` 中指定對應的識別碼與商家 ID。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
