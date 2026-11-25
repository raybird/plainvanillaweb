import { html } from '../../../../lib/html.js';
import { buildSolutionHash, openSolutionWindow } from '../solution-kit.js';
import { ORDER_STATUS, STATUS_LABEL, summarizeOrders } from './pos-model.js';
import { POS_ROLES, detectPosFeatures } from './pos-session.js';
import { PosRolePage, formatMoney, resetWithReport } from './pos-page.js';

/**
 * Multi-Window POS 入口：說明、依角色開啟視窗、目前概況、示範訂單與重設。
 */
export class PosHubPage extends PosRolePage {
    static role = 'hub';

    constructor() {
        super();
        /** 被瀏覽器擋下的視窗：改顯示連結讓使用者自己開 */
        this.state.blocked = [];
    }

    async onAction(name, dataset) {
        if (name === 'open') {
            this._open([dataset.role]);
        } else if (name === 'open-all') {
            this._open(Object.keys(POS_ROLES));
        } else if (name === 'seed') {
            await this.session.seedDemoOrders(3);
            this.notify('已產生 3 張示範訂單');
        } else if (name === 'reset') {
            await resetWithReport(this);
        }
    }

    /** @param {string[]} roles */
    _open(roles) {
        const blocked = [];
        for (const role of roles) {
            const { window: opened } = openSolutionWindow(POS_ROLES[role].path, { name: `pos-${role}`, ns: this.session?.nsOption });
            if (!opened) blocked.push(role);
        }
        this.state.blocked = blocked;
        if (blocked.length) this.notify('瀏覽器擋下了彈出視窗，請改用下方連結在新分頁開啟。', 'warn');
    }

    renderBody({ orders }) {
        const summary = summarizeOrders(orders);
        const { missing } = detectPosFeatures();
        const ns = this.session.nsOption;
        return html`
            <style>
                .pos-roles { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
                .pos-role { display: flex; flex-direction: column; gap: 0.5rem; }
                .pos-role .icon { font-size: 1.6rem; }
                .pos-role a { font-size: 0.85rem; }
                .pos-steps { margin: 0; padding-left: 1.25rem; }
                .pos-summary { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; }
            </style>
            <p>
                同一台機器上的四個視窗協同處理訂單：點餐送單、廚房認領與完成、叫號畫面通知取餐、管理視窗看統計。
                所有資料存在這台瀏覽器的 IndexedDB，視窗之間以 MessageBus 通知後各自重讀，因此重新整理、關閉再開、晚開啟的視窗都會看到一致的狀態。
            </p>
            <p class="pos-alert" data-level="warn">展示用範例：不處理真實付款，也不收集個資。正式商用需要權限控管、後端交易與跨裝置同步，詳見 <a href="#/docs/solutions/pos">文件</a>。</p>
            ${missing.length ? html`<p class="pos-alert" data-level="warn">此瀏覽器缺少選用能力：${missing.join('、')}。核心流程仍可使用。</p>` : ''}

            <div class="pos-actions">
                <button type="button" class="btn btn-primary" data-action="open-all">開啟全部四個視窗</button>
                <button type="button" class="btn" data-action="seed">產生 3 張示範訂單</button>
                <button type="button" class="btn btn-danger" data-action="reset">重設 demo 資料</button>
            </div>

            <div class="pos-roles">
                ${Object.entries(POS_ROLES).map(([role, meta]) => html`
                    <article class="pos-card pos-role" data-role="${role}">
                        <span class="icon" aria-hidden="true">${meta.icon}</span>
                        <h3>${meta.title}</h3>
                        <div class="pos-actions">
                            <button type="button" class="btn" data-action="open" data-role="${role}">開新視窗</button>
                        </div>
                        <a href="${buildSolutionHash(meta.path, { ns, kiosk: true })}" target="_blank" rel="noopener" data-role-link="${role}" ${this.state.blocked.includes(role) ? 'data-blocked' : ''}>在新分頁開啟（kiosk）</a>
                        <a href="${buildSolutionHash(meta.path, { ns })}" data-role-inline="${role}">在本分頁開啟</a>
                    </article>
                `)}
            </div>

            <section class="pos-card" aria-label="目前概況">
                <h3>目前概況</h3>
                <div class="pos-summary">
                    ${[ORDER_STATUS.PENDING, ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.PICKED_UP].map((status) => html`
                        <span data-summary="${status}">${STATUS_LABEL[status]}：<strong>${summary.counts[status]}</strong></span>
                    `)}
                    <span>營收：<strong>${formatMoney(summary.revenue)}</strong></span>
                </div>
            </section>

            <section class="pos-card" aria-label="展示流程">
                <h3>建議的展示流程</h3>
                <ol class="pos-steps">
                    <li>開啟全部四個視窗（或開兩個廚房視窗，模擬兩個站台）。</li>
                    <li>在點餐視窗送出訂單，廚房與叫號畫面立刻出現新單。</li>
                    <li>兩個廚房同時按「認領」：只有一個站台成功，另一個收到「已由其他站台處理」。</li>
                    <li>完成備餐後，叫號畫面移到「請取餐」，按「已取餐」結案，管理視窗統計同步更新。</li>
                    <li>重新整理任一視窗，或關掉再開：狀態從 IndexedDB 恢復。關掉正在備餐的廚房後，另一個站台可以「接手」。</li>
                    <li>在開發者工具切到離線：所有流程照常運作，因為資料與協作都在本機。</li>
                </ol>
            </section>
        `;
    }
}

customElements.define('page-pos-hub', PosHubPage);
