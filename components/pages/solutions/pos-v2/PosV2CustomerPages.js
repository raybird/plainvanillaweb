/**
 * POS v2 顧客端（#16，協定規格 2、5.2、5.3）：
 *
 * - `/home`：店家入口，列出已開放的桌號，另有「店員加入」入口。
 * - `/table?t=<桌號>`：桌邊點餐。沿用第一代點餐元件（菜單、購物車、送單、取餐號），工作階段換成
 *   `RemoteTableSession`；要先輸入入桌碼，之後可以加點，並看到自己的訂單與前面待備餐的筆數。
 * - `/track?o=<訂單>&k=<token>`：櫃檯交接的訂單查詢，只看得到那一筆。
 */
import { BaseComponent } from '../../../../lib/base-component.js';
import { html } from '../../../../lib/html.js';
import { PosOrderPage } from '../pos/PosOrderPage.js';
import { formatMoney } from '../pos/pos-page.js';
import { LINK_STATE } from './peer-link.js';
import { ORDER_STATUS, POS_V2_ERROR_CODES } from './pos-v2-model.js';
import {
    HOME_PATH,
    JOIN_PATH,
    LINK_STATE_LABEL,
    PosV2Remote,
    TABLE_PATH,
    buildRemoteHash,
    readRemoteParams,
    remoteSupported,
    removeWatches,
    saveWatch,
} from './pos-v2-remote.js';
import { REMOTE_PHASE, RemoteTableSession } from './remote-pos-session.js';
import { recoverableOrderPage, remotePage } from './remote-page.js';

/** 錯誤碼對應給顧客看的說明 */
function describeCustomerError(err) {
    switch (err?.code) {
        case POS_V2_ERROR_CODES.CODE_INVALID:
            return '入桌碼不正確，請向店員確認。';
        case POS_V2_ERROR_CODES.RATE_LIMITED:
            return `錯誤次數太多，請 ${Math.ceil((err.retryAfterMs ?? 60000) / 1000)} 秒後再試。`;
        case POS_V2_ERROR_CODES.SESSION_CLOSED:
            return '這桌的用餐已結束，不能再送單。';
        default:
            return err?.message ?? String(err);
    }
}

/** 訂單進度的文字：待處理時顯示前面待備餐的筆數（協定規格 6.3 的 aheadCount） */
function progressText(order) {
    if (order.status === ORDER_STATUS.PENDING) {
        return order.aheadCount > 0 ? `等待備餐，前面還有 ${order.aheadCount} 筆` : '等待備餐，下一筆就是你';
    }
    return order.statusLabel ?? order.status;
}

function renderOrderProgress(order, attr = 'data-my-order') {
    return html`
        <li class="pos-progress" ${attr}="${order.number}" data-status="${order.status}" data-ahead="${order.status === ORDER_STATUS.PENDING ? String(order.aheadCount ?? '') : ''}">
            <span class="pos-ticket-number">${order.number}</span>
            <span class="pos-progress-text">${progressText(order)}</span>
            <span class="pos-muted">${order.items.map((line) => `${line.emoji} ${line.name} × ${line.qty}`).join('、')} · ${formatMoney(order.total)}</span>
        </li>`;
}

const PROGRESS_STYLE = `
    .pos-progress-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .pos-progress { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.75rem; padding: 0.6rem 0.8rem; border: 1px solid var(--border-color); border-radius: 10px; }
    .pos-progress .pos-ticket-number { font-size: 1.6rem; font-weight: 800; font-variant-numeric: tabular-nums; }
    .pos-progress-text { font-weight: 600; }
    .pos-progress[data-status="ready"] { border-color: var(--primary-color); }
    .pos-progress[data-status="ready"] .pos-progress-text { color: var(--primary-color); }
    .pos-progress .pos-muted { flex-basis: 100%; font-size: 0.85rem; }
`;

// ---------- 桌邊點餐 ----------

export class PosV2TablePage extends recoverableOrderPage(remotePage(PosOrderPage)) {
    static Session = RemoteTableSession;
    static meta = { title: '桌邊點餐', icon: '📱' };
    static hubPath = HOME_PATH;
    static hubLabel = '店家入口';

    afterFirstRender() {
        super.afterFirstRender();
        this.addEventListener('submit', async (event) => {
            const form = event.target.closest('form[data-form="table-code"]');
            if (!form) return;
            event.preventDefault();
            if (this.state.busy) return;
            this.state.busy = true;
            try {
                await this.session.join(form.elements.code.value);
                form.reset();
                this.notify(`已加入 ${this.session.tableName}，可以開始點餐。`);
            } catch (err) {
                this.state.notice = { text: describeCustomerError(err), level: 'warn', code: err?.code ?? null };
            } finally {
                this.state.busy = false;
            }
        });
    }

    async onAction(name, dataset) {
        try {
            await super.onAction(name, dataset);
        } catch (err) {
            if (err?.code === POS_V2_ERROR_CODES.SESSION_CLOSED) {
                this.state.notice = { text: describeCustomerError(err), level: 'warn', code: err.code };
                return;
            }
            throw err;
        }
    }

    renderHeaderExtra() {
        const session = this.session;
        return session?.tableId ? html`<span class="pos-pill" data-table-pill="${session.tableId}">${session.tableName}</span>` : '';
    }

    renderCodeForm(intro) {
        return html`
            <form data-form="table-code" class="pos-card pos-code-form">
                <p>${intro}</p>
                <label>入桌碼（6 位數，請向店員索取）
                    <input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
                </label>
                <button type="submit" class="btn btn-primary" ${this.state.busy ? 'disabled' : ''}>加入這桌</button>
            </form>`;
    }

    renderMyOrders(orders) {
        if (!orders.length) return '';
        const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
        return html`
            <section class="pos-card" aria-labelledby="pos-v2-my-orders" data-my-orders>
                <h3 id="pos-v2-my-orders">我的訂單</h3>
                <ul class="pos-progress-list">${sorted.map((order) => renderOrderProgress(order))}</ul>
            </section>`;
    }

    renderBody(snapshot) {
        const session = this.session;
        const phase = snapshot.connection.phase;
        const style = html`<style>${PROGRESS_STYLE}
            .pos-code-form { display: flex; flex-direction: column; gap: 0.6rem; max-width: 420px; }
            .pos-code-form p { margin: 0; }
            .pos-code-form label { display: flex; flex-direction: column; gap: 0.35rem; font-weight: 600; }
            .pos-code-form input { font: inherit; font-size: 1.4rem; letter-spacing: 0.2em; padding: 0.5rem 0.7rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-color); }
        </style>`;
        if (phase === REMOTE_PHASE.NEED_CODE) {
            return html`${style}
                <div data-remote-phase="${phase}">
                    ${session.tableOpen === false ? html`<p class="pos-alert" data-level="warn" data-table-closed>${session.tableName} 目前沒有開放點餐，請洽店員。</p>` : ''}
                    ${this.renderCodeForm(`歡迎光臨 ${session.tableName}。輸入入桌碼後就能點餐，同桌的人可以共用同一組入桌碼。`)}
                </div>`;
        }
        if (phase === REMOTE_PHASE.CLOSED) {
            return html`${style}
                <div data-remote-phase="${phase}" data-session-status="closed">
                    <p class="pos-alert" data-level="warn">這桌的用餐已結束，不能再送單。若店員重新為你開桌，請輸入新的入桌碼。</p>
                    ${this.renderMyOrders(snapshot.orders)}
                    ${this.renderCodeForm('輸入新的入桌碼')}
                </div>`;
        }
        if (phase === REMOTE_PHASE.READY) {
            return html`${style}
                <div data-remote-phase="${phase}" data-session-status="open">
                    ${super.renderBody(snapshot)}
                    ${this.renderMyOrders(snapshot.orders)}
                </div>`;
        }
        return super.renderBody(snapshot);
    }
}

// ---------- 獨立的小頁面（店家入口、訂單查詢） ----------

/**
 * 不需要授權、只要連上主機的頁面：連線狀態、提示與事件委派。子類別實作 `onOpen()`、`renderContent()`。
 */
class RemoteCustomerPage extends BaseComponent {
    static title = '';

    constructor() {
        super();
        this.initReactiveState({ link: { state: LINK_STATE.IDLE }, notice: null });
        this.params = readRemoteParams();
        this.remote = null;
    }

    get ready() {
        return Boolean(this.params.roomId && this.params.sig) && remoteSupported();
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this.ready) return;
        const remote = new PosV2Remote({ sig: this.params.sig, roomId: this.params.roomId });
        this.remote = remote;
        remote.on('state', (detail) => {
            this.state.link = detail;
        });
        remote.on('open', () => {
            this.state.link = { state: LINK_STATE.OPEN };
            this.onOpen().catch((err) => this.notify(describeCustomerError(err), 'warn', err?.code));
        });
        remote.on('push', (detail) => this.onPush(detail));
        remote.start();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.remote?.dispose();
        this.remote = null;
    }

    afterFirstRender() {
        this.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (!button || !this.contains(button) || button.disabled) return;
            event.preventDefault();
            if (button.dataset.action === 'retry-link') this.remote?.retry();
            else this.onAction(button.dataset.action, button.dataset);
        });
    }

    /** 範例內連結：帶上房間、信令與 namespace */
    link(path, extra) {
        return buildRemoteHash(path, { roomId: this.params.roomId, sig: this.params.sig, namespace: this.params.namespace, extra });
    }

    notify(text, level = 'info', code = null) {
        this.state.notice = { text, level, code };
    }

    async onOpen() {}

    onPush() {}

    onAction() {}

    renderContent() {
        return '';
    }

    renderLink() {
        const link = this.state.link;
        if (link.state === LINK_STATE.OPEN) return '';
        if (link.state === LINK_STATE.FAILED) {
            return html`
                <p class="pos-alert" data-level="error" data-need-turn="${String(Boolean(link.needTurn))}">${LINK_STATE_LABEL[link.state]}。${link.needTurn ? '手機和店家主機可能不在同一個網路，或網路擋下了直連；需要 TURN 伺服器才能連線。' : ''}</p>
                <button type="button" class="btn" data-action="retry-link">重試</button>`;
        }
        return html`<p class="pos-muted" data-link-state="${link.state}">${LINK_STATE_LABEL[link.state] ?? link.state}</p>`;
    }

    render() {
        const notice = this.state.notice;
        let body;
        if (!this.params.roomId || !this.params.sig) {
            body = html`<p class="pos-alert" data-level="error" data-remote-phase="missing">這個網址缺少店家資訊。請用手機相機掃店內的 QR Code。</p>`;
        } else if (!remoteSupported()) {
            body = html`<p class="pos-alert" data-level="error">此瀏覽器不支援 WebRTC 或 WebSocket。</p>`;
        } else {
            body = html`${this.renderLink()}${this.state.link.state === LINK_STATE.OPEN ? this.renderContent() : ''}`;
        }
        return html`
            <style>
                .pos-v2-customer { display: flex; flex-direction: column; gap: 1rem; max-width: 640px; }
                .pos-v2-customer h2 { margin: 0; font-size: 1.35rem; }
                .pos-v2-customer .pos-alert { margin: 0; padding: 0.6rem 0.9rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-color); }
                .pos-v2-customer .pos-alert[data-level="warn"] { border-color: #d97706; }
                .pos-v2-customer .pos-alert[data-level="error"] { border-color: var(--danger, #dc2626); }
                .pos-v2-customer .pos-muted { color: var(--text-muted); }
                .pos-v2-customer .pos-card { padding: 1rem; border: 1px solid var(--card-border); border-radius: 12px; background: var(--card-bg); box-shadow: var(--card-shadow); color: var(--text-color); }
                .pos-v2-customer .pos-card h3 { margin: 0 0 0.5rem; font-size: 1rem; }
                .pos-table-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
                .pos-table-list a { display: block; padding: 0.9rem; text-align: center; font-weight: 700; border: 1px solid var(--border-color); border-radius: 10px; text-decoration: none; color: var(--text-color); background: var(--surface-color); }
                .pos-table-list a:hover, .pos-table-list a:focus-visible { border-color: var(--primary-color); }
                ${PROGRESS_STYLE}
            </style>
            <section class="pos-v2-customer">
                <h2>${this.constructor.title}</h2>
                <div aria-live="polite">${notice ? html`<p class="pos-alert" data-level="${notice.level}" data-code="${notice.code ?? ''}">${notice.text}</p>` : ''}</div>
                ${body}
            </section>
        `;
    }
}

export class PosV2HomePage extends RemoteCustomerPage {
    static title = '🏪 歡迎光臨';

    constructor() {
        super();
        this.tables = null;
    }

    async onOpen() {
        const { tables } = await this.remote.request('table.listOpen');
        this.tables = tables;
        this.scheduleUpdate();
    }

    onAction(name) {
        if (name === 'refresh-tables') this.onOpen().catch((err) => this.notify(describeCustomerError(err), 'warn'));
    }

    renderContent() {
        const tables = this.tables;
        return html`
            <section class="pos-card" aria-labelledby="pos-v2-home-tables">
                <h3 id="pos-v2-home-tables">選擇你的桌號</h3>
                ${tables === null ? html`<p class="pos-muted">讀取中…</p>` : tables.length ? html`
                    <ul class="pos-table-list">
                        ${tables.map((table) => html`<li><a href="${this.link(TABLE_PATH, { t: table.id })}" data-open-table="${table.id}">${table.name}</a></li>`)}
                    </ul>` : html`<p class="pos-muted" data-no-open-tables>目前沒有開放點餐的桌位，請洽店員。</p>`}
                <p><button type="button" class="btn" data-action="refresh-tables">重新整理</button></p>
                <p class="pos-muted">選桌後要輸入店員提供的入桌碼。也可以直接掃桌上的 QR Code。</p>
            </section>
            <p class="pos-muted">店員：<a href="${this.link(JOIN_PATH)}" data-staff-join>店員加入</a>（輸入管理主機上的連線碼）</p>
        `;
    }
}

export class PosV2TrackPage extends RemoteCustomerPage {
    static title = '🧾 訂單進度';

    constructor() {
        super();
        this.orderId = this.params.params.get('o');
        this.token = this.params.params.get('k');
        this.order = null;
    }

    async onOpen() {
        if (!this.orderId || !this.token) {
            this.notify('這個查詢連結不完整。', 'error');
            return;
        }
        try {
            const result = await this.remote.request('order.watch', { orderId: this.orderId, token: this.token });
            saveWatch(this.params.namespace, this.params.roomId, { orderId: this.orderId, token: this.token });
            this.order = result.order;
            this.state.notice = null;
            this.scheduleUpdate();
        } catch (err) {
            if (err?.code === POS_V2_ERROR_CODES.UNAUTHORIZED) {
                removeWatches(this.params.namespace, this.params.roomId, [this.orderId]);
                this.notify('這個查詢連結無效或已過期（例如店家重新產生了房間）。', 'error', err.code);
                return;
            }
            throw err;
        }
    }

    onPush({ topic, data }) {
        if (topic !== 'myOrders') return;
        const order = data.orders.find((o) => o.id === this.orderId);
        if (!order) return;
        this.order = order;
        this.scheduleUpdate();
    }

    renderContent() {
        const order = this.order;
        if (!order) return '';
        return html`
            <section class="pos-card" aria-label="訂單 ${order.number}">
                <ul class="pos-progress-list">${renderOrderProgress(order, 'data-track-order')}</ul>
                <p class="pos-muted">取餐號碼出現在叫號螢幕的「請取餐」時，請到櫃台取餐。這個頁面只顯示這一筆訂單。</p>
            </section>
        `;
    }
}

customElements.define('page-pos-v2-table', PosV2TablePage);
customElements.define('page-pos-v2-home', PosV2HomePage);
customElements.define('page-pos-v2-track', PosV2TrackPage);
