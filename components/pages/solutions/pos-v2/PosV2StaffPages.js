/**
 * POS v2 店員裝置的角色畫面（#16）：點餐、廚房、叫號直接沿用第一代元件，只把工作階段換成
 * `RemotePosSession`（A8：第一代元件只做相容的擴充）。還沒連上主機、沒有授權或角色不符時，
 * 改顯示連線面板。點餐裝置送單後另外顯示訂單 QR Code，把查單交接給顧客手機（協定規格 5.3）。
 */
import { html } from '../../../../lib/html.js';
import { PosOrderPage } from '../pos/PosOrderPage.js';
import { PosKitchenPage } from '../pos/PosKitchenPage.js';
import { PosDisplayPage } from '../pos/PosDisplayPage.js';
import { TRACK_PATH, buildRemoteHash } from './pos-v2-remote.js';
import { QR_STYLE, qrCode, remotePage } from './remote-page.js';

export class PosV2OrderPage extends remotePage(PosOrderPage) {
    renderBody(snapshot) {
        const body = super.renderBody(snapshot);
        const session = this.session;
        const orderId = this.state.lastOrderId;
        const token = orderId ? session?.viewTokens.get(orderId) : null;
        const order = snapshot.orders.find((o) => o.id === orderId);
        if (!token || !order || snapshot.connection.phase !== 'ready') return body;
        const url = new URL(buildRemoteHash(TRACK_PATH, { roomId: session.roomId, sig: session.sig, namespace: session.namespace, extra: { o: orderId, k: token } }), document.baseURI).href;
        return html`
            ${body}
            <style>
                .pos-handover { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
                .pos-handover .pos-ticket-number { font-size: 2.5rem; }
                ${QR_STYLE}
            </style>
            <section class="pos-card pos-handover" data-handover="${order.number}" aria-label="給顧客的訂單 QR Code">
                <a class="pos-qr" href="${url}" target="_blank" rel="noopener" data-handover-url="${url}" aria-label="訂單 ${order.number} 的查詢 QR Code">${qrCode(url)}</a>
                <div>
                    <p class="pos-muted">請顧客用手機相機掃描，查看取餐進度</p>
                    <div class="pos-ticket-number">${order.number}</div>
                    <p class="pos-muted">這個 QR Code 只能查看這一筆訂單。</p>
                </div>
            </section>
        `;
    }
}

export class PosV2KitchenPage extends remotePage(PosKitchenPage) {
    renderTicketExtra(order) {
        return order.tableId ? html`<span class="pos-pill" data-ticket-table="${order.tableId}" data-ticket-session="${order.diningSessionId ?? ''}">${order.tableId} 桌</span>` : '';
    }
}

export class PosV2DisplayPage extends remotePage(PosDisplayPage) {}

customElements.define('page-pos-v2-order', PosV2OrderPage);
customElements.define('page-pos-v2-kitchen', PosV2KitchenPage);
customElements.define('page-pos-v2-display', PosV2DisplayPage);
