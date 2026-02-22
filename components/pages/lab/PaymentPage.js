import { html, unsafe } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { paymentService } from "../../../lib/payment-service.js";

export class PaymentPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            status: '等待結帳...',
            result: null,
            error: null,
            cart: [
                { label: 'Vanilla 專案大師課程', amount: { currency: 'TWD', value: '3000.00' } },
                { label: '無框架精神紀念 T-Shirt', amount: { currency: 'TWD', value: '500.00' } }
            ]
        });

        // 檢查瀏覽器是否支援
        if (!paymentService.isSupported) {
            this.state.error = '⚠️ 您的瀏覽器不支援 Payment Request API，或者您沒有在 HTTPS 網域下運行。';
            this.state.status = '無法使用';
        }
    }

    async handleCheckout() {
        try {
            this.state.status = '正在呼叫原生金流介面...';
            this.state.error = null;
            this.state.result = null;

            const response = await paymentService.checkout(this.state.cart, {
                requestPayerName: true,
                requestPayerEmail: true,
                requestPayerPhone: true
            });

            this.state.status = '✅ 支付成功！';
            this.state.result = {
                payerName: response.payerName,
                payerEmail: response.payerEmail,
                payerPhone: response.payerPhone,
                methodName: response.methodName
            };
        } catch (err) {
            this.state.status = '❌ 支付已取消或失敗';
            this.state.error = err.message || '結帳中斷';
            console.error('[PaymentPage] Checkout error:', err);
        }
    }

    render() {
        const total = this.state.cart.reduce((sum, item) => sum + parseFloat(item.amount.value), 0);

        return html`
            <style>
                .payment-container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 2rem;
                    background: var(--surface-color, #fff);
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                }
                .cart-items {
                    margin-bottom: 2rem;
                }
                .cart-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 1rem 0;
                    border-bottom: 1px solid #eee;
                }
                .cart-item:last-child {
                    border-bottom: none;
                }
                .cart-total {
                    display: flex;
                    justify-content: space-between;
                    font-size: 1.5rem;
                    font-weight: bold;
                    padding-top: 1rem;
                    border-top: 2px solid #ddd;
                    margin-bottom: 2rem;
                }
                .status-box {
                    padding: 1rem;
                    border-radius: 8px;
                    background: #f8fafc;
                    margin-top: 1.5rem;
                }
                .status-box.error {
                    background: #fef2f2;
                    color: #dc2626;
                }
                .status-box.success {
                    background: #f0fdf4;
                    color: #16a34a;
                }
                .checkout-btn {
                    width: 100%;
                    padding: 1rem;
                    font-size: 1.2rem;
                    background: var(--primary-color, #2563eb);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .checkout-btn:hover {
                    background: #1d4ed8;
                }
                .checkout-btn:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                }
                pre {
                    background: #1e293b;
                    color: #a6accd;
                    padding: 1rem;
                    border-radius: 6px;
                    overflow-x: auto;
                    font-size: 0.9rem;
                    margin-top: 1rem;
                }
            </style>

            <div class="payment-container">
                <h2>💳 原生結帳體驗 (Payment Request API)</h2>
                <p>無需整合龐大的第三方金流 SDK，直接在此頁面喚出您的 Apple Pay、Google Pay 或瀏覽器儲存的信用卡進行安全結帳。</p>
                
                <div class="cart-items">
                    <h3>您的購物車</h3>
                    ${this.state.cart.map(item => html`
                        <div class="cart-item">
                            <span>${item.label}</span>
                            <span>${item.amount.currency} $${item.amount.value}</span>
                        </div>
                    `)}
                    
                    <div class="cart-total">
                        <span>總計 (Total)</span>
                        <span>TWD $${total.toFixed(2)}</span>
                    </div>
                </div>

                <button 
                    class="btn btn-primary" 
                    style="width:100%; padding: 1rem; font-size: 1.2rem;"
                    onclick="this.closest('page-lab-payment').handleCheckout()"
                    ${unsafe(paymentService.isSupported ? '' : 'disabled')}>
                    💳 立即結帳 (Pay Now)
                </button>

                <div class="status-box ${this.state.error ? 'error' : this.state.result ? 'success' : ''}">
                    <strong>狀態：</strong> ${this.state.status}
                    ${this.state.error ? html`<br><small>${this.state.error}</small>` : ''}
                </div>

                ${this.state.result ? html`
                    <div style="margin-top: 2rem;">
                        <h3>收據資料 (模擬)</h3>
                        <p>原生 API 已成功收集到以下買家資訊：</p>
                        <pre>${JSON.stringify(this.state.result, null, 2)}</pre>
                    </div>
                ` : ''}
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}

customElements.define("page-lab-payment", PaymentPage);
