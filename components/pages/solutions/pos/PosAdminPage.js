import { html } from '../../../../lib/html.js';
import { ORDER_STATUS, STATUS_LABEL, summarizeOrders } from './pos-model.js';
import { POS_ROLES } from './pos-session.js';
import { PosRolePage, formatMoney, formatTime, resetWithReport } from './pos-page.js';

/**
 * 管理統計視窗：各狀態數量、營收、平均備餐時間、熱銷品項、在線視窗與訂單明細；
 * 可取消待處理訂單、產生示範訂單與重設 demo 資料。
 */
export class PosAdminPage extends PosRolePage {
    static role = 'admin';

    async onAction(name, dataset) {
        if (name === 'cancel') {
            const { result, order } = await this.session.act(dataset.order, 'cancel');
            this.notify(result === 'noop' ? `訂單 ${order.number} 已經取消` : `已取消訂單 ${order.number}`);
        } else if (name === 'seed') {
            await this.session.seedDemoOrders(3);
            this.notify('已產生 3 張示範訂單');
        } else if (name === 'reset') {
            await resetWithReport(this);
        }
    }

    renderBody({ orders, peers }) {
        const summary = summarizeOrders(orders);
        const recent = [...orders].reverse().slice(0, 50);
        const maxQty = Math.max(1, ...summary.topItems.map((item) => item.qty));
        return html`
            <style>
                .pos-stats { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
                .pos-stat { padding: 0.75rem; border-radius: 10px; border: 1px solid var(--border-color); background: var(--surface-color); }
                .pos-stat strong { display: block; font-size: 1.5rem; font-variant-numeric: tabular-nums; }
                .pos-stat span { font-size: 0.8rem; color: var(--text-muted); }
                .pos-bar { display: grid; grid-template-columns: 7rem 1fr 2.5rem; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
                .pos-bar-track { height: 0.6rem; border-radius: 999px; background: var(--surface-color); border: 1px solid var(--border-color); overflow: hidden; }
                .pos-bar-fill { height: 100%; background: var(--primary-color); }
                .pos-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
                .pos-table th, .pos-table td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border-color); vertical-align: top; }
                .pos-table-wrap { overflow-x: auto; }
            </style>
            <div class="pos-stats" aria-label="統計">
                ${Object.values(ORDER_STATUS).map((status) => html`
                    <div class="pos-stat" data-stat="${status}"><strong>${summary.counts[status]}</strong><span>${STATUS_LABEL[status]}</span></div>
                `)}
                <div class="pos-stat" data-stat="revenue"><strong>${formatMoney(summary.revenue)}</strong><span>營收（不含取消，未收款）</span></div>
                <div class="pos-stat" data-stat="avg-prep"><strong>${summary.avgPrepMs === null ? '—' : `${(summary.avgPrepMs / 1000).toFixed(1)} 秒`}</strong><span>平均備餐時間</span></div>
            </div>
            <div class="pos-grid">
                <section class="pos-card" aria-label="熱銷品項">
                    <h3>熱銷品項</h3>
                    ${summary.topItems.length ? summary.topItems.map((item) => html`
                        <div class="pos-bar">
                            <span>${item.emoji} ${item.name}</span>
                            <div class="pos-bar-track"><div class="pos-bar-fill" style="width: ${Math.round((item.qty / maxQty) * 100)}%"></div></div>
                            <span>${item.qty}</span>
                        </div>
                    `) : html`<p class="pos-empty">還沒有訂單。</p>`}
                </section>
                <section class="pos-card" aria-label="在線視窗">
                    <h3>在線視窗（${peers.length}）</h3>
                    <ul data-peers>
                        ${peers.map((peer) => html`<li data-peer-role="${peer.meta?.role ?? ''}">${POS_ROLES[peer.meta?.role]?.icon ?? '🏪'} ${POS_ROLES[peer.meta?.role]?.title ?? '入口'}${peer.meta?.station ? ` · ${peer.meta.station}` : ''}${peer.nodeId === this.session.nodeId ? '（本視窗）' : ''}</li>`)}
                    </ul>
                </section>
                <section class="pos-card" aria-label="Demo 資料">
                    <h3>Demo 資料</h3>
                    <p class="pos-muted">資料只存在這台機器的瀏覽器（IndexedDB：<code>${this.session.dbName}</code>）。</p>
                    <div class="pos-actions">
                        <button type="button" class="btn" data-action="seed">產生 3 張示範訂單</button>
                        <button type="button" class="btn btn-danger" data-action="reset">重設 demo 資料</button>
                    </div>
                </section>
            </div>
            <section class="pos-card" aria-label="訂單明細">
                <h3>訂單明細（最新 50 筆）</h3>
                ${recent.length ? html`
                    <div class="pos-table-wrap" tabindex="0" role="region" aria-label="訂單明細表">
                        <table class="pos-table">
                            <thead><tr><th>號碼</th><th>品項</th><th>金額</th><th>狀態</th><th>站台</th><th>更新</th><th></th></tr></thead>
                            <tbody>
                                ${recent.map((o) => html`
                                    <tr data-order-id="${o.id}" data-order-number="${o.number}" data-status="${o.status}">
                                        <td>${o.number}</td>
                                        <td>${o.items.map((line) => `${line.name}×${line.qty}`).join('、')}</td>
                                        <td>${formatMoney(o.total)}</td>
                                        <td>${STATUS_LABEL[o.status]}</td>
                                        <td>${o.station ?? '—'}</td>
                                        <td>${formatTime(o.updatedAt)}</td>
                                        <td>${o.status === ORDER_STATUS.PENDING ? html`<button type="button" class="btn" data-action="cancel" data-order="${o.id}">取消</button>` : ''}</td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                ` : html`<p class="pos-empty">還沒有訂單。</p>`}
            </section>
        `;
    }
}

customElements.define('page-pos-admin', PosAdminPage);
