import { html } from '../../../../lib/html.js';
import { ORDER_STATUS } from './pos-model.js';
import { PosRolePage, formatTime, renderItems } from './pos-page.js';

/**
 * 廚房視窗：認領待處理訂單、完成備餐；站台關閉後其他站台可以接手它的訂單。
 * 可以同時開多個廚房視窗（多個站台），同一張單只會被一個站台認領。
 */
export class PosKitchenPage extends PosRolePage {
    static role = 'kitchen';

    /** 訂單卡片標頭的額外資訊（POS v2 #16 用來顯示桌號）；第一代沒有 */
    renderTicketExtra(_order) {
        return '';
    }

    renderHeaderExtra() {
        return this.session?.stationId ? html`<span class="pos-pill" data-station="${this.session.stationId}">站台 ${this.session.stationId}</span>` : '';
    }

    async onAction(name, dataset) {
        if (!['claim', 'ready', 'takeover'].includes(name)) return;
        const extra = name === 'takeover' ? { fromStation: dataset.station } : {};
        const { result, order } = await this.session.act(dataset.order, name, extra);
        const verb = { claim: '已認領', ready: '已完成', takeover: '已接手' }[name];
        this.notify(result === 'noop' ? `訂單 ${order.number} 已經是這個狀態，不需重複操作` : `${verb}訂單 ${order.number}`);
    }

    renderBody({ orders, activeStations }) {
        const me = this.session.stationId;
        const pending = orders.filter((o) => o.status === ORDER_STATUS.PENDING);
        const mine = orders.filter((o) => o.status === ORDER_STATUS.PREPARING && o.station === me);
        const others = orders.filter((o) => o.status === ORDER_STATUS.PREPARING && o.station !== me);
        const ticket = (order, actions) => html`
            <article class="pos-card pos-ticket" data-order-id="${order.id}" data-order-number="${order.number}" data-status="${order.status}" data-station="${order.station ?? ''}">
                <div class="pos-ticket-head">
                    <span class="pos-ticket-number">${order.number}</span>
                    <span class="pos-muted">${formatTime(order.createdAt)}</span>
                    ${this.renderTicketExtra(order)}
                </div>
                ${renderItems(order)}
                ${actions}
            </article>
        `;
        // 沒有 Web Locks 時無法得知站台是否已關閉：接手按鈕一律顯示，由人工確認該站台真的不在了
        const stationClosed = (station) => (activeStations ? !activeStations.has(station) : true);
        return html`
            <style>
                .pos-kitchen { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); align-items: start; }
                .pos-column { display: flex; flex-direction: column; gap: 0.75rem; }
                .pos-column > h3 { margin: 0; font-size: 1rem; }
            </style>
            <div class="pos-kitchen">
                <section class="pos-column" data-column="pending" aria-label="待處理">
                    <h3>待處理（${pending.length}）</h3>
                    ${pending.length ? pending.map((order) => ticket(order, html`
                        <div class="pos-actions"><button type="button" class="btn btn-primary" data-action="claim" data-order="${order.id}">認領</button></div>
                    `)) : html`<p class="pos-empty">沒有待處理的訂單。</p>`}
                </section>
                <section class="pos-column" data-column="mine" aria-label="本站備餐中">
                    <h3>本站備餐中（${mine.length}）</h3>
                    ${mine.length ? mine.map((order) => ticket(order, html`
                        <div class="pos-actions"><button type="button" class="btn btn-success" data-action="ready" data-order="${order.id}">備餐完成</button></div>
                    `)) : html`<p class="pos-empty">先從「待處理」認領訂單。</p>`}
                </section>
                <section class="pos-column" data-column="others" aria-label="其他站台備餐中">
                    <h3>其他站台（${others.length}）</h3>
                    ${others.length ? others.map((order) => {
                        const closed = stationClosed(order.station);
                        return ticket(order, html`
                            <p class="pos-muted" data-station-state="${closed ? 'closed' : 'active'}">
                                ${order.station} ${activeStations ? (closed ? '已關閉' : '備餐中') : '（無法偵測站台狀態）'}
                            </p>
                            ${closed ? html`<div class="pos-actions"><button type="button" class="btn" data-action="takeover" data-order="${order.id}" data-station="${order.station}">接手</button></div>` : ''}
                        `);
                    }) : html`<p class="pos-empty">沒有其他站台的訂單。</p>`}
                </section>
            </div>
        `;
    }
}

customElements.define('page-pos-kitchen', PosKitchenPage);
