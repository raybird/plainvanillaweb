import { html } from '../../../../lib/html.js';
import { MAX_QTY_PER_ITEM, STATUS_LABEL } from './pos-model.js';
import { PosRolePage, formatMoney } from './pos-page.js';

/**
 * 點餐視窗：選品項、送出訂單、顯示取餐號碼。
 * 同一次送出使用固定的 requestId：連按兩下或送出失敗後重試，都不會產生第二張單。
 */
export class PosOrderPage extends PosRolePage {
    static role = 'order';

    constructor() {
        super();
        /** @type {Record<string, number>} productId → 數量 */
        this.state.cart = {};
        this.state.lastOrderId = null;
        this._requestId = null;
    }

    /** 購物車第一次變動時產生 requestId，送出成功後才換新的 */
    _ensureRequestId() {
        this._requestId ??= crypto.randomUUID();
    }

    async onAction(name, dataset) {
        // 購物車整份替換：reactive state 的 Proxy 沒有 delete 攔截，刪除鍵不會觸發重繪
        const cart = { ...this.state.cart };
        if (name === 'add' || name === 'inc') {
            this._ensureRequestId();
            cart[dataset.product] = Math.min((cart[dataset.product] ?? 0) + 1, MAX_QTY_PER_ITEM);
            this.state.cart = cart;
        } else if (name === 'dec') {
            const qty = (cart[dataset.product] ?? 0) - 1;
            if (qty > 0) cart[dataset.product] = qty;
            else delete cart[dataset.product];
            this.state.cart = cart;
        } else if (name === 'clear') {
            this.state.cart = {};
        } else if (name === 'submit') {
            await this.submit();
        }
    }

    async submit() {
        const items = Object.entries(this.state.cart).map(([productId, qty]) => ({ productId, qty }));
        if (!items.length || this.state.busy) return;
        this._ensureRequestId();
        this.state.busy = true;
        try {
            const { result, order } = await this.session.placeOrder(items, this._requestId);
            this.state.cart = {};
            this.state.lastOrderId = order.id;
            this._requestId = null;
            this.notify(result === 'noop' ? `這筆訂單已經送出過了，取餐號碼 ${order.number}` : `已送出，取餐號碼 ${order.number}`);
        } finally {
            this.state.busy = false;
        }
    }

    renderBody({ products, orders }) {
        const cart = this.state.cart;
        const byId = new Map(products.map((p) => [p.id, p]));
        const lines = Object.entries(cart).filter(([id]) => byId.has(id)).map(([id, qty]) => ({ ...byId.get(id), qty }));
        const total = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
        const last = orders.find((order) => order.id === this.state.lastOrderId);
        const categories = [...new Set(products.map((p) => p.category))];
        return html`
            <style>
                .pos-order { display: grid; gap: 1rem; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); align-items: start; }
                @media (max-width: 760px) { .pos-order { grid-template-columns: 1fr; } }
                .pos-menu { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
                .pos-menu button { display: flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; padding: 0.75rem; min-height: 96px; border-radius: 12px; border: 1px solid var(--card-border); background: var(--card-bg); color: var(--text-color); cursor: pointer; text-align: left; font: inherit; }
                .pos-menu button:hover, .pos-menu button:focus-visible { border-color: var(--primary-color); }
                .pos-menu .emoji { font-size: 1.6rem; }
                .pos-menu .price { color: var(--text-muted); font-size: 0.85rem; }
                .pos-category { margin: 0.5rem 0 0.25rem; font-size: 0.85rem; color: var(--text-muted); }
                .pos-cart-line { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; border-bottom: 1px dashed var(--border-color); }
                .pos-cart-line .name { flex: 1; }
                .pos-cart-line button { min-width: 2rem; }
                .pos-total { display: flex; justify-content: space-between; font-weight: 700; margin: 0.75rem 0; }
                .pos-last { text-align: center; }
                .pos-last .pos-ticket-number { font-size: 2.5rem; }
            </style>
            <div class="pos-order">
                <div>
                    ${categories.map((category) => html`
                        <p class="pos-category">${category}</p>
                        <div class="pos-menu">
                            ${products.filter((p) => p.category === category).map((p) => html`
                                <button type="button" data-action="add" data-product="${p.id}" aria-label="加入 ${p.name}，${formatMoney(p.price)}">
                                    <span class="emoji" aria-hidden="true">${p.emoji}</span>
                                    <strong>${p.name}</strong>
                                    <span class="price">${formatMoney(p.price)}</span>
                                </button>
                            `)}
                        </div>
                    `)}
                </div>
                <aside class="pos-card" aria-label="購物車">
                    <h3>購物車</h3>
                    ${lines.length ? lines.map((line) => html`
                        <div class="pos-cart-line" data-cart-product="${line.id}">
                            <span class="name">${line.emoji} ${line.name}</span>
                            <button type="button" class="btn" data-action="dec" data-product="${line.id}" aria-label="減少 ${line.name}">−</button>
                            <span aria-label="數量">${line.qty}</span>
                            <button type="button" class="btn" data-action="inc" data-product="${line.id}" aria-label="增加 ${line.name}">＋</button>
                        </div>
                    `) : html`<p class="pos-empty">點選左側品項加入購物車。</p>`}
                    <div class="pos-total"><span>合計</span><span class="pos-cart-total">${formatMoney(total)}</span></div>
                    <div class="pos-actions">
                        <button type="button" class="btn btn-primary" data-action="submit" ${lines.length && !this.state.busy ? '' : 'disabled'}>送出訂單</button>
                        <button type="button" class="btn" data-action="clear" ${lines.length ? '' : 'disabled'}>清空</button>
                    </div>
                    <p class="pos-muted" style="font-size: 0.8rem;">展示用：不收款、不收集個資。</p>
                </aside>
            </div>
            ${last ? html`
                <div class="pos-card pos-last" data-last-order="${last.number}">
                    <p class="pos-muted">取餐號碼</p>
                    <div class="pos-ticket-number">${last.number}</div>
                    <p>目前狀態：<strong data-last-status="${last.status}">${STATUS_LABEL[last.status]}</strong> · ${formatMoney(last.total)}</p>
                </div>
            ` : ''}
        `;
    }
}

customElements.define('page-pos-order', PosOrderPage);
