import { BaseService } from './base-service.js';

/**
 * PaymentService - 原生支付請求服務 (Payment Request API)
 *
 * ⚠️ `basic-card` 付款方式已於 Chrome 100 (2022) 起被各大瀏覽器移除，
 * 故本服務改用 Google Pay 作為付款方式範例。Payment Request API 本身仍是
 * 有效標準，但要真正喚起原生介面，需要「已啟用的付款方式」(例如設定了
 * merchant 的 Google Pay / Apple Pay)。
 *
 * 本範本無後端與商家憑證，因此多數環境下 canMakePayment() 會回傳 false——
 * 這是誠實的結果，而非錯誤。請將本頁視為「API 用法教學 Demo」。
 */
export class PaymentService extends BaseService {
    constructor() {
        super();
        // 僅代表瀏覽器實作了 API 建構子，不代表有可用的付款方式 (用 isAvailable() 判斷後者)
        this.hasApi = typeof window !== 'undefined' && !!window.PaymentRequest;

        // 付款方式：Google Pay (TEST 環境；gateway 為示範值，正式使用需替換為真實 merchant 設定)
        this.paymentMethods = [{
            supportedMethods: 'https://google.com/pay',
            data: {
                environment: 'TEST',
                apiVersion: 2,
                apiVersionMinor: 0,
                allowedPaymentMethods: [{
                    type: 'CARD',
                    parameters: {
                        allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                        allowedCardNetworks: ['VISA', 'MASTERCARD']
                    },
                    tokenizationSpecification: {
                        type: 'PAYMENT_GATEWAY',
                        parameters: { gateway: 'example', gatewayMerchantId: 'exampleMerchantId' }
                    }
                }]
            }
        }];
    }

    /**
     * 非同步偵測是否真的有可用的付款方式。
     * 取代舊版僅檢查 `window.PaymentRequest` 是否存在的誤導性邏輯。
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        if (!this.hasApi) return false;
        try {
            const probe = new PaymentRequest(this.paymentMethods, {
                total: { label: 'probe', amount: { currency: 'USD', value: '0' } }
            });
            return await probe.canMakePayment();
        } catch (err) {
            console.warn('[PaymentService] canMakePayment 偵測失敗:', err);
            return false;
        }
    }

    /**
     * 建立並顯示支付請求
     * @param {Array} items 商品列表 [{label, amount}]
     * @param {object} options 配置 { requestPayerName, requestPayerEmail, ... }
     */
    async checkout(items, options = { requestPayerName: true, requestPayerEmail: true }) {
        if (!this.hasApi) {
            throw new Error('此瀏覽器不支援 Payment Request API');
        }

        const details = {
            displayItems: items,
            total: {
                label: '總計',
                amount: { currency: 'USD', value: this._calculateTotal(items) }
            }
        };

        try {
            const request = new PaymentRequest(this.paymentMethods, details, options);

            // 顯示原生支付介面
            const response = await request.show();

            // ⚠️ Demo：此處僅模擬後端驗證，本範本未串接任何真實金流
            await this._processPayment(response);

            // 完成支付
            await response.complete('success');

            this.emit('payment-success', {
                payer: response.payerName,
                email: response.payerEmail,
                details: response.details
            });

            return response;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('[PaymentService] Checkout Error:', err);
            }
            throw err;
        }
    }

    _calculateTotal(items) {
        return items.reduce((sum, item) => sum + parseFloat(item.amount.value), 0).toFixed(2);
    }

    async _processPayment(response) {
        // ⚠️ Demo only：模擬後端驗證延遲，無真實金流處理。
        return new Promise(resolve => setTimeout(resolve, 1000));
    }
}

export const paymentService = new PaymentService();
