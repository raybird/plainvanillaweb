import { html, unsafe } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { paymentService } from "../../../lib/payment-service.js";

export class PaymentPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            status: null,
            result: null,
            error: null,
            cart: [
                { label: 'Vanilla 專案大師課程', amount: { currency: 'TWD', value: '3000.00' } },
                { label: '無框架精神紀念 T-Shirt', amount: { currency: 'TWD', value: '500.00' } }
            ]
        });
    }

    async handleCheckout() {
        try {
            this.state.error = null;
            this.state.result = null;
            this.state.status = '正在喚起原生金流介面...';

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
            this.state.status = null;
            this.state.error = err.name === 'AbortError' ? '使用者取消了結帳。' : (err.message || '結帳失敗');
        }
    }

    render() {
        const total = this.state.cart.reduce((sum, i) => sum + parseFloat(i.amount.value), 0);
        const isSupported = paymentService.isSupported;

        return html`
            <div class="lab-card">
                <h3>💳 原生支付 (Payment Request API)</h3>
                <p><small>無需第三方金流 SDK，直接喚出瀏覽器原生的 Apple Pay、Google Pay 或信用卡結帳介面。</small></p>

                <h4 style="margin: 1.5rem 0 0.5rem;">🛒 購物車</h4>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                    ${this.state.cart.map(item => html`
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 0.6rem 0;">${item.label}</td>
                            <td style="padding: 0.6rem 0; text-align: right; white-space: nowrap;">${item.amount.currency} $${item.amount.value}</td>
                        </tr>
                    `)}
                    <tr>
                        <td style="padding: 0.8rem 0; font-weight: bold; font-size: 1.1rem;">總計</td>
                        <td style="padding: 0.8rem 0; font-weight: bold; font-size: 1.1rem; text-align: right;">TWD $${total.toFixed(2)}</td>
                    </tr>
                </table>

                <div class="btn-group" style="margin-top: 1.5rem;">
                    <button 
                        class="btn btn-primary"
                        onclick="this.closest('page-lab-payment').handleCheckout()"
                        ${unsafe(isSupported ? '' : 'disabled')}>
                        ${isSupported ? '💳 立即結帳 (Pay Now)' : '⚠️ 此瀏覽器不支援 Payment Request API'}
                    </button>
                </div>

                ${this.state.status ? html`
                    <div style="margin-top: 1rem; padding: 0.8rem 1rem; background: #f0fdf4; border-left: 3px solid #10b981; border-radius: 4px; font-size: 0.9rem; color: #065f46;">
                        ${this.state.status}
                    </div>
                ` : ''}

                ${this.state.error ? html`
                    <div style="margin-top: 1rem; padding: 0.8rem 1rem; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px; font-size: 0.9rem; color: #991b1b;">
                        ❌ ${this.state.error}
                    </div>
                ` : ''}

                ${this.state.result ? html`
                    <div style="margin-top: 1.5rem;">
                        <p style="font-size: 0.85rem; color: #64748b;">✅ 收到的買家資訊 (模擬)：</p>
                        <pre style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 0.8rem; border-radius: 6px; font-size: 0.8rem; overflow-x: auto;">${JSON.stringify(this.state.result, null, 2)}</pre>
                    </div>
                ` : ''}
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}

customElements.define("page-lab-payment", PaymentPage);
