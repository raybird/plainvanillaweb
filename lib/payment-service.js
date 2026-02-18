import { BaseService } from './base-service.js';

/**
 * PaymentService - 原生支付請求服務
 * 封裝 Payment Request API，提供標準化的結帳流程。
 */
export class PaymentService extends BaseService {
    constructor() {
        super();
        this.isSupported = !!window.PaymentRequest;
    }

    /**
     * 建立並顯示支付請求
     * @param {Array} items 商品列表 [{label, amount}]
     * @param {object} options 配置 { requestShipping, requestPayerName, ... }
     */
    async checkout(items, options = { requestPayerName: true, requestPayerEmail: true }) {
        if (!this.isSupported) {
            throw new Error('此瀏覽器不支援 Payment Request API');
        }

        const methods = [{
            supportedMethods: 'basic-card',
            data: {
                supportedNetworks: ['visa', 'mastercard', 'amex']
            }
        }];

        const details = {
            displayItems: items,
            total: {
                label: '總計',
                amount: { currency: 'USD', value: this._calculateTotal(items) }
            }
        };

        try {
            const request = new PaymentRequest(methods, details, options);
            
            // 顯示原生支付介面
            const response = await request.show();
            
            // 模擬後端驗證過程
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
        return new Promise(resolve => setTimeout(resolve, 1000));
    }
}

export const paymentService = new PaymentService();
