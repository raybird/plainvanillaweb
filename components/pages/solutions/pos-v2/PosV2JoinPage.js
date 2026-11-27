import { BaseComponent } from '../../../../lib/base-component.js';
import { html } from '../../../../lib/html.js';
import { isKioskMode } from '../../../../app/kiosk.js';
import { LINK_STATE } from './peer-link.js';
import { POS_V2_ERROR_CODES } from './pos-v2-model.js';
import {
    LINK_STATE_LABEL,
    PosV2Remote,
    ROLE_LABEL,
    STAFF_ROLE_PATHS,
    buildRemoteHash,
    loadStaffCredential,
    readRemoteParams,
    remoteSupported,
    saveStaffCredential,
} from './pos-v2-remote.js';

const LABEL_KEY = 'vanilla_solution:pos-v2:device-label';

/**
 * POS v2 店員裝置配對（#16，協定規格 5.1）。掃配對 QR Code 進來時網址帶 `pair`（配對 token）；
 * 沒有 token 時（從店家入口按「店員加入」）輸入管理頁顯示的 6 位數連線碼。
 * 申請送出後等管理端核准；核准後把授權存在本機，並前往指定角色的畫面。
 */
export class PosV2JoinPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            /** connecting | form | pending | rejected */
            phase: 'connecting',
            link: { state: LINK_STATE.IDLE },
            notice: null,
            busy: false,
        });
        this.params = readRemoteParams();
        this.existing = this.params.roomId ? loadStaffCredential(this.params.namespace, this.params.roomId) : null;
        this.remote = null;
    }

    get token() {
        return this.params.params.get('pair') || null;
    }

    connectedCallback() {
        super.connectedCallback();
        const { roomId, sig } = this.params;
        if (!roomId || !sig || !remoteSupported()) return;
        const remote = new PosV2Remote({ sig, roomId });
        this.remote = remote;
        remote.on('state', (detail) => {
            this.state.link = detail;
            if (detail.state !== LINK_STATE.OPEN && this.state.phase === 'pending') {
                // 主機在連線中斷時丟棄待核准的申請，要重新申請
                this.state.phase = 'connecting';
                this.notify('和主機的連線中斷，連上後請重新申請。', 'warn');
            } else if (detail.state !== LINK_STATE.OPEN && this.state.phase === 'form') {
                this.state.phase = 'connecting';
            }
        });
        remote.on('open', () => {
            if (this.state.phase === 'connecting') this.state.phase = 'form';
        });
        remote.on('push', ({ topic, data }) => this.onPush(topic, data));
        remote.start();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.remote?.dispose();
        this.remote = null;
    }

    afterFirstRender() {
        this.addEventListener('submit', (event) => {
            const form = event.target.closest('form[data-form="pair"]');
            if (!form) return;
            event.preventDefault();
            this.request(form.elements.label.value, form.elements.code?.value);
        });
        this.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (!button || !this.contains(button) || button.disabled) return;
            event.preventDefault();
            if (button.dataset.action === 'retry-link') this.remote?.retry();
            else if (button.dataset.action === 'again') {
                this.state.phase = this.remote?.isOpen ? 'form' : 'connecting';
                this.state.notice = null;
            }
        });
    }

    async request(label, code) {
        if (this.state.busy) return;
        const name = String(label ?? '').trim();
        try {
            localStorage.setItem(LABEL_KEY, name);
        } catch {
            // 只是記住上次的名稱
        }
        this.state.busy = true;
        try {
            const params = this.token ? { token: this.token, label: name } : { code: String(code ?? '').trim(), label: name };
            this.pending = await this.remote.request('pair.request', params);
            this.state.phase = 'pending';
            this.notify('已送出申請，請管理端核准。');
        } catch (err) {
            this.notify(describeError(err), 'warn', err?.code);
        } finally {
            this.state.busy = false;
        }
    }

    onPush(topic, data) {
        if (data?.pairRequestId !== this.pending?.pairRequestId) return;
        if (topic === 'pair.rejected') {
            this.state.phase = 'rejected';
            this.notify('管理端拒絕了這個申請。', 'warn');
        } else if (topic === 'pair.approved') {
            const { roomId, sig, namespace } = this.params;
            saveStaffCredential(namespace, roomId, { credential: data.credential, role: data.role, station: data.station, label: data.label, sig });
            location.hash = buildRemoteHash(STAFF_ROLE_PATHS[data.role], { roomId, sig, namespace, kiosk: isKioskMode(location.hash) });
        }
    }

    notify(text, level = 'info', code = null) {
        this.state.notice = { text, level, code };
    }

    renderBody() {
        const { roomId, sig, namespace } = this.params;
        if (!roomId || !sig) {
            return html`<p class="pos-alert" data-level="error">這個網址缺少房間或信令資訊。請用手機相機掃管理主機上的配對 QR Code，或開啟店家入口的「店員加入」。</p>`;
        }
        if (!remoteSupported()) return html`<p class="pos-alert" data-level="error">此瀏覽器不支援 WebRTC 或 WebSocket，無法配對。</p>`;
        const link = this.state.link;
        const existing = this.existing && STAFF_ROLE_PATHS[this.existing.role] ? html`
            <p class="pos-muted" data-existing-role="${this.existing.role}">這台裝置已配對為「${ROLE_LABEL[this.existing.role]}」${this.existing.station ? `（${this.existing.station}）` : ''}。
            <a href="${buildRemoteHash(STAFF_ROLE_PATHS[this.existing.role], { roomId, sig, namespace })}">前往${ROLE_LABEL[this.existing.role]}畫面</a>；重新申請會換成新的授權。</p>` : '';
        switch (this.state.phase) {
            case 'connecting':
                return html`
                    ${existing}
                    ${link.state === LINK_STATE.FAILED ? html`
                        <p class="pos-alert" data-level="error" data-need-turn="${String(Boolean(link.needTurn))}">${LINK_STATE_LABEL[link.state]}。${link.needTurn ? '裝置和主機可能不在同一個網路，或網路擋下了直連；需要 TURN 伺服器才能連線。' : ''}</p>
                        <button type="button" class="btn" data-action="retry-link">重試</button>`
                        : html`<p class="pos-muted" data-link-state="${link.state}">${LINK_STATE_LABEL[link.state] ?? link.state}</p>`}`;
            case 'form':
                return html`
                    ${existing}
                    <form data-form="pair" class="pos-join-form">
                        <label>裝置名稱（管理端用來辨識）
                            <input name="label" maxlength="40" autocomplete="off" value="${readLabel()}" placeholder="例如：櫃台平板">
                        </label>
                        ${this.token ? '' : html`
                            <label>連線碼（管理頁顯示的 6 位數）
                                <input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
                            </label>`}
                        <button type="submit" class="btn btn-primary" ${this.state.busy ? 'disabled' : ''}>申請加入</button>
                    </form>`;
            case 'pending':
                return html`<p data-pair-pending>等待管理端核准…核准後會自動前往指定的畫面。</p>
                    <p class="pos-muted" data-role-hint>這台裝置是點餐、廚房還是叫號，由管理主機核准時指定，這裡不用設定；要換角色請管理端撤銷後重新申請。</p>`;
            case 'rejected':
                return html`<button type="button" class="btn" data-action="again">重新申請</button>`;
            default:
                return '';
        }
    }

    render() {
        const notice = this.state.notice;
        return html`
            <style>
                .pos-v2-join { display: flex; flex-direction: column; gap: 1rem; max-width: 520px; }
                .pos-v2-join h2 { margin: 0; font-size: 1.35rem; }
                .pos-join-form { display: flex; flex-direction: column; gap: 0.75rem; }
                .pos-join-form label { display: flex; flex-direction: column; gap: 0.35rem; font-weight: 600; }
                .pos-join-form input { font: inherit; padding: 0.55rem 0.7rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg, var(--surface-color)); color: var(--text-color); }
                .pos-v2-join .pos-alert { margin: 0; padding: 0.6rem 0.9rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-color); }
                .pos-v2-join .pos-alert[data-level="warn"] { border-color: #d97706; }
                .pos-v2-join .pos-alert[data-level="error"] { border-color: var(--danger, #dc2626); }
                .pos-v2-join .pos-muted { color: var(--text-muted); }
            </style>
            <section class="pos-v2-join" data-join-phase="${this.state.phase}">
                <h2>🤝 POS v2 · 店員裝置配對</h2>
                <p class="pos-muted">${this.token ? '這個配對連結 5 分鐘內有效。' : '輸入管理頁顯示的連線碼；連線碼 5 分鐘內有效。'}送出後由管理端核准並指定角色。</p>
                <div aria-live="polite">${notice ? html`<p class="pos-alert" data-level="${notice.level}" data-code="${notice.code ?? ''}">${notice.text}</p>` : ''}</div>
                ${this.renderBody()}
            </section>
        `;
    }
}

function readLabel() {
    try {
        return localStorage.getItem(LABEL_KEY) ?? '';
    } catch {
        return '';
    }
}

function describeError(err) {
    switch (err?.code) {
        case POS_V2_ERROR_CODES.CODE_INVALID:
            return '連線碼不正確。';
        case POS_V2_ERROR_CODES.RATE_LIMITED:
            return `錯誤次數太多，請 ${Math.ceil((err.retryAfterMs ?? 60000) / 1000)} 秒後再試。`;
        case POS_V2_ERROR_CODES.PAIRING_EXPIRED:
            return '配對碼已過期，請管理端重新產生。';
        default:
            return err?.message ?? String(err);
    }
}

customElements.define('page-pos-v2-join', PosV2JoinPage);
