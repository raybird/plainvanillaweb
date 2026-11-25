import { BaseComponent } from '../../../../lib/base-component.js';
import { html } from '../../../../lib/html.js';
import { isKioskMode } from '../../../../app/kiosk.js';
import { buildSolutionHash } from '../solution-kit.js';
import { PosError } from './pos-model.js';
import { POS_ROLES, PosSession } from './pos-session.js';

/** 金額顯示（新台幣整數元） */
export const formatMoney = (value) => `NT$ ${Number(value).toLocaleString('zh-TW')}`;

/** 時間顯示（時:分:秒） */
export const formatTime = (ts) => new Date(ts).toLocaleTimeString('zh-TW', { hour12: false });

/**
 * POS 各視窗的共同外框：建立／釋放 `PosSession`、顯示標頭（角色、namespace、連線狀態）、
 * 提示訊息，以及 `[data-action]` 的事件委派（只在元件上綁一次，ADR 0100）。
 *
 * 子類別設定 `static role`，實作 `renderBody(snapshot)` 與 `onAction(name, dataset)`。
 * 快照不放進 reactive state：它含 Set，而且每次都整份替換，直接存在欄位再排程重繪即可。
 */
export class PosRolePage extends BaseComponent {
    /** @type {'hub' | 'order' | 'kitchen' | 'display' | 'admin'} */
    static role = 'hub';

    constructor() {
        super();
        this.initReactiveState({ notice: null, busy: false });
        /** @type {import('./pos-session.js').PosSnapshot | null} */
        this.snapshot = null;
        this.startError = null;
    }

    connectedCallback() {
        super.connectedCallback();
        if (!PosSession.supported) return;
        this.session = new PosSession({
            role: this.constructor.role,
            onChange: (snapshot) => {
                this.snapshot = snapshot;
                this.scheduleUpdate();
            },
        });
        this.session.start().catch((err) => {
            this.startError = err;
            this.scheduleUpdate();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.session?.dispose();
        this.session = null;
    }

    afterFirstRender() {
        this.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-action]');
            if (!button || !this.contains(button) || button.disabled) return;
            event.preventDefault();
            try {
                await this.onAction(button.dataset.action, button.dataset);
            } catch (err) {
                this.notify(err);
            }
        });
    }

    /**
     * 顯示一則提示；`PosError` 顯示為警告（例如其他站台已認領），其他錯誤顯示為錯誤。
     * @param {Error | string} messageOrError
     * @param {'info' | 'warn' | 'error'} [level]
     */
    notify(messageOrError, level) {
        if (typeof messageOrError === 'string') {
            this.state.notice = { text: messageOrError, level: level ?? 'info' };
            return;
        }
        const err = messageOrError;
        this.state.notice = { text: err?.message ?? String(err), level: err instanceof PosError ? 'warn' : 'error', code: err?.code ?? null };
    }

    /** 範例內連結：保留 namespace 與目前的 kiosk 設定 */
    link(path) {
        return buildSolutionHash(path, { ns: this.session?.nsOption, kiosk: isKioskMode(location.hash) });
    }

    /** @param {string} _name @param {DOMStringMap} _dataset */
    async onAction(_name, _dataset) {}

    /** @param {import('./pos-session.js').PosSnapshot} _snapshot */
    renderBody(_snapshot) {
        return '';
    }

    /** 標頭右側的額外資訊（例如廚房站台） */
    renderHeaderExtra() {
        return '';
    }

    render() {
        const role = this.constructor.role;
        const meta = POS_ROLES[role] ?? { title: '入口', icon: '🏪' };
        const snapshot = this.snapshot;
        const notice = this.state.notice;
        let body;
        if (!PosSession.supported) {
            body = html`<p class="pos-alert" data-level="error">此瀏覽器不支援 IndexedDB 或 BroadcastChannel，無法執行 Multi-Window POS。</p>`;
        } else if (this.startError) {
            body = html`<p class="pos-alert" data-level="error">無法啟動：${this.startError.message}</p>`;
        } else if (!snapshot) {
            body = html`<p class="pos-muted">載入中…</p>`;
        } else {
            body = this.renderBody(snapshot);
        }
        return html`
            <style>
                .pos-page { display: flex; flex-direction: column; gap: 1rem; }
                .pos-header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color); }
                .pos-header h2 { margin: 0; font-size: 1.35rem; }
                .pos-header .pos-meta { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-left: auto; align-items: center; font-size: 0.8rem; color: var(--text-muted); }
                .pos-pill { padding: 0.1rem 0.6rem; border-radius: 999px; border: 1px solid var(--border-color); background: var(--surface-color); white-space: nowrap; }
                .pos-pill[data-online="false"] { border-color: var(--danger, #dc2626); color: var(--danger, #dc2626); }
                .pos-alert { margin: 0; padding: 0.6rem 0.9rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-color); }
                .pos-alert[data-level="warn"] { border-color: #d97706; }
                .pos-alert[data-level="error"] { border-color: var(--danger, #dc2626); }
                .pos-muted { color: var(--text-muted); }
                .pos-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
                .pos-card { padding: 1rem; border: 1px solid var(--card-border); border-radius: 12px; background: var(--card-bg); box-shadow: var(--card-shadow); color: var(--text-color); }
                .pos-card h3 { margin: 0 0 0.5rem; font-size: 1rem; }
                .pos-ticket { display: flex; flex-direction: column; gap: 0.35rem; }
                .pos-ticket-head { display: flex; align-items: baseline; gap: 0.5rem; }
                .pos-ticket-number { font-size: 1.4rem; font-weight: 800; font-variant-numeric: tabular-nums; }
                .pos-ticket ul { margin: 0; padding-left: 1.1rem; font-size: 0.9rem; }
                .pos-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
                .pos-empty { color: var(--text-muted); font-size: 0.9rem; }
            </style>
            <section class="pos-page" data-pos-role="${role}">
                <header class="pos-header">
                    <h2>${meta.icon} POS · ${meta.title}</h2>
                    <div class="pos-meta">
                        ${this.renderHeaderExtra()}
                        <span class="pos-pill" title="資料隔離用的 namespace">ns: ${this.session?.namespace ?? ''}</span>
                        <span class="pos-pill" data-online="${String(snapshot?.online ?? navigator.onLine)}">${(snapshot?.online ?? navigator.onLine) ? '連線中' : '離線（本機資料照常運作）'}</span>
                        ${role === 'hub' ? '' : html`<a href="${this.link('/solutions/pos')}">POS 入口</a>`}
                    </div>
                </header>
                <div aria-live="polite" class="pos-notice">
                    ${notice ? html`<p class="pos-alert" data-level="${notice.level}" data-code="${notice.code ?? ''}">${notice.text}</p>` : ''}
                </div>
                ${body}
            </section>
        `;
    }
}

/**
 * 訂單明細清單
 * @param {object} order
 */
export function renderItems(order) {
    return html`<ul>${order.items.map((line) => html`<li>${line.emoji} ${line.name} × ${line.qty}</li>`)}</ul>`;
}

/**
 * 重設 demo 資料並回報結果（入口頁與管理頁共用）
 * @param {PosRolePage} page
 */
export async function resetWithReport(page) {
    const report = await page.session.reset();
    const status = report.databases[page.session.dbName];
    if (status === 'blocked') page.notify('有其他視窗沒有釋放資料庫連線，請關閉其他 POS 視窗後再試一次。', 'warn');
    else if (report.errors.length) page.notify(report.errors[0]);
    else page.notify('已重設 demo 資料，菜單已重新載入。');
}
