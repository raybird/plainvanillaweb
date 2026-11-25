import { html } from '../../../../lib/html.js';
import { ORDER_STATUS } from './pos-model.js';
import { detectPosFeatures } from './pos-session.js';
import { PosRolePage } from './pos-page.js';

/**
 * 顧客叫號視窗：大字顯示備餐中與可取餐的號碼，櫃台按「已取餐」結案。
 * 支援 Screen Wake Lock 時可保持螢幕常亮（選用，需使用者點擊才會請求）。
 */
export class PosDisplayPage extends PosRolePage {
    static role = 'display';

    constructor() {
        super();
        this.state.wakeLock = false;
        this._wakeLock = null;
        this._onVisibility = () => {
            // 分頁回到前景時瀏覽器已釋放 Wake Lock，依使用者原本的選擇重新請求
            if (document.visibilityState === 'visible' && this.state.wakeLock && !this._wakeLock) this._requestWakeLock();
        };
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('visibilitychange', this._onVisibility);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('visibilitychange', this._onVisibility);
        this._wakeLock?.release().catch(() => {});
        this._wakeLock = null;
    }

    async _requestWakeLock() {
        try {
            this._wakeLock = await navigator.wakeLock.request('screen');
            this._wakeLock.addEventListener('release', () => {
                this._wakeLock = null;
            });
        } catch (err) {
            this.state.wakeLock = false;
            this.notify(`無法保持螢幕常亮：${err.message}`, 'warn');
        }
    }

    async onAction(name, dataset) {
        if (name === 'pickup') {
            const { result, order } = await this.session.act(dataset.order, 'pickup');
            this.notify(result === 'noop' ? `${order.number} 已經取餐` : `${order.number} 已取餐`);
        } else if (name === 'wake-lock') {
            this.state.wakeLock = !this.state.wakeLock;
            if (this.state.wakeLock) await this._requestWakeLock();
            else {
                await this._wakeLock?.release().catch(() => {});
                this._wakeLock = null;
            }
        }
    }

    renderBody({ orders }) {
        const preparing = orders.filter((o) => o.status === ORDER_STATUS.PENDING || o.status === ORDER_STATUS.PREPARING);
        const ready = orders.filter((o) => o.status === ORDER_STATUS.READY);
        const wakeLockSupported = detectPosFeatures().supported.wakeLock;
        return html`
            <style>
                .pos-display { display: grid; gap: 1rem; grid-template-columns: 1fr 1fr; }
                @media (max-width: 640px) { .pos-display { grid-template-columns: 1fr; } }
                .pos-display h3 { font-size: 1.3rem; margin: 0 0 0.75rem; }
                .pos-board { display: flex; flex-wrap: wrap; gap: 0.75rem; }
                .pos-board-number { display: flex; flex-direction: column; align-items: center; gap: 0.35rem; min-width: 6.5rem; padding: 0.75rem; border-radius: 12px; border: 1px solid var(--border-color); background: var(--surface-color); }
                .pos-board-number span { font-size: 2.4rem; font-weight: 800; font-variant-numeric: tabular-nums; }
                .pos-display [data-column="ready"] .pos-board-number { border-color: var(--primary-color); }
                .pos-display [data-column="ready"] .pos-board-number span { color: var(--primary-color); }
            </style>
            <div class="pos-display">
                <section class="pos-card" data-column="preparing" aria-label="備餐中">
                    <h3>備餐中</h3>
                    <div class="pos-board">
                        ${preparing.length ? preparing.map((o) => html`<div class="pos-board-number" data-order-number="${o.number}" data-status="${o.status}"><span>${o.number}</span></div>`)
                            : html`<p class="pos-empty">目前沒有備餐中的訂單。</p>`}
                    </div>
                </section>
                <section class="pos-card" data-column="ready" aria-label="請取餐">
                    <h3>請取餐</h3>
                    <div class="pos-board">
                        ${ready.length ? ready.map((o) => html`
                            <div class="pos-board-number" data-order-number="${o.number}" data-status="${o.status}">
                                <span>${o.number}</span>
                                <button type="button" class="btn" data-action="pickup" data-order="${o.id}">已取餐</button>
                            </div>
                        `) : html`<p class="pos-empty">目前沒有待取的餐點。</p>`}
                    </div>
                </section>
            </div>
            ${wakeLockSupported ? html`
                <div class="pos-actions">
                    <button type="button" class="btn" data-action="wake-lock" aria-pressed="${String(this.state.wakeLock)}">
                        ${this.state.wakeLock ? '取消螢幕常亮' : '保持螢幕常亮'}
                    </button>
                </div>
            ` : ''}
        `;
    }
}

customElements.define('page-pos-display', PosDisplayPage);
