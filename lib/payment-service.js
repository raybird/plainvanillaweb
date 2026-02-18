import { BaseService } from './base-service.js';

/**
 * PaymentService - 原生 Web 支付服務
 * 封裝 Payment Request API，提供標準化的結帳體驗。
 */
export class PaymentService extends BaseService {
    constructor() {
        super();
        this.currentRequest = null;
    }

    /**
     * 檢查是否支援支付請求
     */
    async canMakePayment(methods, details) {
        if (!window.PaymentRequest) return false;
        try {
            const request = new PaymentRequest(methods, details);
            return await request.canMakePayment();
        } catch (err) {
            console.error('[PaymentService] Check Error:', err);
            return false;
        }
    }

    /**
     * 發起支付請求
     * @param {Array} methods 支付方式 (e.g. [{supportedMethods: 'basic-card'}])
     * @param {Object} details 交易明細 (total, displayItems)
     * @param {Object} options 選項 (requestShipping, etc.)
     */
    async showPayment(methods, details, options = {}) {
        if (!window.PaymentRequest) {
            throw new Error('此瀏覽器不支援 Payment Request API');
        }

        try {
            this.currentRequest = new PaymentRequest(methods, details, options);
            
            // 監聽運送地址變更 (若有)
            this.currentRequest.onshippingaddresschange = (ev) => {
                this.emit('shipping-address-change', { request: this.currentRequest, event: ev });
            };

            const response = await this.currentRequest.show();
            this.emit('payment-success', { response });
            return response;
        } catch (err) {
            if (err.name === 'AbortError') {
                this.emit('payment-cancelled');
                return null;
            }
            console.error('[PaymentService] Show Error:', err);
            throw err;
        }
    }
}

export const paymentService = new PaymentService();
