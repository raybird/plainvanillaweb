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
            supported: null, // null = 偵測中, true/false = canMakePayment 結果
            cart: [
                { label: 'Vanilla 專案大師課程', amount: { currency: 'TWD', value: '3000.00' } },
                { label: '無框架精神紀念 T-Shirt', amount: { currency: 'TWD', value: '500.00' } }
            ]
        });
    }

    async connectedCallback() {
        super.connectedCallback();
        // 以 canMakePayment() 非同步偵測「是否真的有可用付款方式」
        this.state.supported = await paymentService.isAvailable();
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
        const supported = this.state.supported; // null=偵測中, true/false

        // 依偵測結果決定按鈕文案與禁用狀態
        const btnDisabled = supported !== true;
        const btnLabel = supported === null
            ? '⏳ 偵測可用付款方式中…'
            : supported
                ? '💳 立即結帳 (Pay Now)'
                : '⚠️ 此環境無可用付款方式';

        return html`
            <div class="lab-card">
                <h3>💳 原生支付 (Payment Request API)</h3>
                <p><small>無需第三方金流 SDK，直接喚出瀏覽器原生的 Apple Pay、Google Pay 結帳介面。</small></p>

                <div style="margin: 0.8rem 0; padding: 0.7rem 1rem; background: var(--warning-subtle); border-left: 3px solid var(--warning); border-radius: 4px; font-size: 0.82rem; color: var(--warning);">
                    ⚠️ <strong>教學 Demo</strong>：本範本無後端與商家憑證，付款流程為模擬。
                    <code>basic-card</code> 已被瀏覽器移除，此處改用 Google Pay；要真正喚起原生介面，
                    需在支援的環境並設定 merchant（故多數情況下按鈕會停用）。
                </div>

                <h4 style="margin: 1.5rem 0 0.5rem;">🛒 購物車</h4>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                    ${this.state.cart.map(item => html`
                        <tr style="border-bottom: 1px solid var(--border-color);">
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
                        ${unsafe(btnDisabled ? 'disabled' : '')}>
                        ${btnLabel}
                    </button>
                </div>

                ${this.state.status ? html`
                    <div style="margin-top: 1rem; padding: 0.8rem 1rem; background: var(--success-subtle); border-left: 3px solid var(--success); border-radius: 4px; font-size: 0.9rem; color: var(--success);">
                        ${this.state.status}
                    </div>
                ` : ''}

                ${this.state.error ? html`
                    <div style="margin-top: 1rem; padding: 0.8rem 1rem; background: var(--danger-subtle); border-left: 3px solid var(--danger); border-radius: 4px; font-size: 0.9rem; color: var(--danger);">
                        ❌ ${this.state.error}
                    </div>
                ` : ''}

                ${this.state.result ? html`
                    <div style="margin-top: 1.5rem;">
                        <p style="font-size: 0.85rem; color: var(--text-muted);">✅ 收到的買家資訊 (模擬)：</p>
                        <pre style="background: var(--surface-color); border: 1px solid var(--border-color); padding: 0.8rem; border-radius: 6px; font-size: 0.8rem; overflow-x: auto;">${JSON.stringify(this.state.result, null, 2)}</pre>
                    </div>
                ` : ''}
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}

customElements.define("page-lab-payment", PaymentPage);
