import { BaseComponent } from '../../../../lib/base-component.js';
import { html } from '../../../../lib/html.js';
import { router } from '../../../../lib/router.js';
import { VERSION } from '../../../../lib/version.js';
import { resolveNamespace } from '../solution-kit.js';
import { ORDER_STATUS } from '../pos/pos-model.js';
import { HOST_ROLE, PosV2Host } from './pos-v2-host.js';
import { SIGNALING_STATE } from './signaling-client.js';
import {
    CLOUDFLARED_INSTALL_URL,
    WRANGLER_DOCS_URL,
    classifySigParam,
    clearSignalingUrl,
    describeTestFailure,
    loadSignalingUrl,
    readSigParam,
    saveSignalingUrl,
    selfHostCommands,
    testSignalingConnection,
} from './signaling-settings.js';

const ADMIN_PATH = '/solutions/pos-v2/admin';

const ROLE_LABEL = {
    [HOST_ROLE.STARTING]: '啟動中…',
    [HOST_ROLE.PRIMARY]: '主機（這個分頁）',
    [HOST_ROLE.READONLY]: '唯讀（主機在另一個分頁）',
    [HOST_ROLE.STOPPED]: '已停止',
};

const SIGNALING_LABEL = {
    [SIGNALING_STATE.IDLE]: '未連線',
    [SIGNALING_STATE.CONNECTING]: '連線中…',
    [SIGNALING_STATE.OPEN]: '已連上信令',
    [SIGNALING_STATE.RECONNECTING]: '重新連線中…',
    [SIGNALING_STATE.REJECTED]: '這個房間已被其他主機使用',
    [SIGNALING_STATE.REPLACED]: '另一個主機分頁取代了這個分頁',
    [SIGNALING_STATE.CLOSED]: '未連線',
};

/** 已連線裝置的身分說明 */
function describeConnection(conn) {
    if (conn.device) {
        const role = { order: '點餐', kitchen: '廚房', display: '叫號' }[conn.device.role] ?? conn.device.role;
        return `${role}${conn.device.station ? ` · ${conn.device.station}` : ''}${conn.device.label ? ` · ${conn.device.label}` : ''}`;
    }
    if (conn.table) return `顧客 · ${conn.table.tableId}`;
    if (conn.watches.length) return `查單 · ${conn.watches.length} 筆`;
    return '尚未驗證';
}

/**
 * POS v2 管理主機（#16）：主機分頁（Web Lock 單例，其他管理分頁唯讀）、信令設定（A9）、
 * 房間與已連線裝置。配對與桌位管理在 P5、P6 加入。
 *
 * 網址帶來的 `sig` 不會直接套用：信令伺服器在信任範圍內（ADR 0109 決策 5），
 * 任何人都能做出帶 `sig` 的連結，所以要使用者確認後才儲存。
 */
export class PosV2AdminPage extends BaseComponent {
    constructor() {
        super();
        this.namespace = resolveNamespace('pos-v2');
        this.commands = selfHostCommands();
        this.initReactiveState({
            saved: null,
            /** 網址帶來、等待確認的信令網址：{ kind: 'confirm', url } 或 { kind: 'invalid', raw, error } */
            pending: null,
            editing: false,
            /** { status: 'running' | 'ok' | 'fail', text } */
            test: null,
            notice: null,
            guideOpen: false,
        });
        /** 使用者已拒絕的網址；同一個頁面實例內不再詢問 */
        this.dismissedSig = null;
        this.testRun = 0;
        /** 主機狀態與資料不放進 reactive state：每次整份替換，存在欄位再排程重繪 */
        this.host = null;
        this.hostStatus = null;
        this.connections = [];
        this.data = null;
        this.startError = null;
        this.confirmRegenerate = false;
    }

    connectedCallback() {
        super.connectedCallback();
        this.state.saved = loadSignalingUrl(this.namespace);
        this.checkSigParam();
        // 停在同一頁時換網址（例如再點一次帶 sig 的連結）不會重建頁面，要自己重新檢查
        this._offRoute = router.on('route-change', () => this.checkSigParam());
        this.startHost();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._offRoute?.();
        this.testRun += 1;
        this.host?.dispose();
        this.host = null;
    }

    startHost() {
        const host = new PosV2Host({ namespace: this.namespace, signalingUrl: this.state.saved });
        this.host = host;
        host.on('status', (status) => {
            this.hostStatus = status;
            this.scheduleUpdate();
        });
        host.on('connections', (list) => {
            this.connections = list;
            this.scheduleUpdate();
        });
        host.on('changed', () => this.reload());
        host.start()
            .then(() => this.reload())
            .catch((err) => {
                this.startError = err;
                this.scheduleUpdate();
            });
    }

    /** 從 IndexedDB 重讀摘要；唯讀分頁靠主機的 pos-v2:changed 通知觸發 */
    async reload() {
        const host = this.host;
        if (!host) return;
        try {
            const [orders, tables] = await Promise.all([host.repository.listOrders(), host.repository.listTables()]);
            if (this.host !== host) return;
            this.data = { orders, tables };
            this.scheduleUpdate();
        } catch (err) {
            console.warn('[pos-v2] 讀取資料失敗', err);
        }
    }

    checkSigParam() {
        if (!router.match(ADMIN_PATH, { exact: true })) return;
        const result = classifySigParam(readSigParam(), this.state.saved);
        if (result.kind === 'confirm' && result.url === this.dismissedSig) this.state.pending = null;
        else this.state.pending = result.kind === 'confirm' || result.kind === 'invalid' ? result : null;
    }

    afterFirstRender() {
        this.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (!button || !this.contains(button) || button.disabled) return;
            event.preventDefault();
            this.onAction(button.dataset.action, button.dataset);
        });
        this.addEventListener('submit', (event) => {
            const form = event.target.closest('form[data-form="signaling"]');
            if (!form) return;
            event.preventDefault();
            this.saveFromInput(form.elements.sig.value);
        });
        // toggle 不會冒泡，用 capture 記下展開狀態，重繪時才不會被收合
        this.addEventListener('toggle', (event) => {
            if (event.target.matches?.('details[data-guide]')) this.state.guideOpen = event.target.open;
        }, true);
    }

    onAction(name, dataset) {
        switch (name) {
            case 'accept-sig':
                return this.useUrl(this.state.pending.url, '已改用連結帶來的信令網址。');
            case 'reject-sig':
                this.dismissedSig = this.state.pending?.url ?? null;
                this.state.pending = null;
                this.notify('沒有變更信令網址。');
                return;
            case 'edit':
                this.state.editing = true;
                return;
            case 'cancel-edit':
                this.state.editing = false;
                return;
            case 'clear':
                clearSignalingUrl(this.namespace);
                this.state.saved = null;
                this.state.test = null;
                this.state.editing = false;
                this.host?.setSignalingUrl(null);
                this.notify('已清除信令網址。');
                return;
            case 'reconnect':
                this.host?.reconnectSignaling();
                return;
            case 'regenerate':
                this.confirmRegenerate = true;
                this.scheduleUpdate();
                return;
            case 'cancel-regenerate':
                this.confirmRegenerate = false;
                this.scheduleUpdate();
                return;
            case 'confirm-regenerate':
                return this.runHostAction(async () => {
                    this.confirmRegenerate = false;
                    await this.host.regenerateRoom();
                    return '已重新產生房間。所有裝置與 QR Code 都要重新設定。';
                });
            case 'reset':
                return this.runHostAction(async () => {
                    const report = await this.host.resetData();
                    return report.errors?.length ? `重設時發生錯誤：${report.errors[0].message ?? report.errors[0]}` : '已重設 demo 資料（房間保留）。';
                });
            case 'test':
                return this.runTest();
            case 'copy':
                return this.copy(dataset.command);
        }
    }

    async runHostAction(run) {
        try {
            this.notify(await run());
        } catch (err) {
            this.notify(err.message, 'error');
        }
        this.reload();
    }

    saveFromInput(input) {
        try {
            this.useUrl(input, '已儲存信令網址。');
        } catch (err) {
            this.notify(err.message, 'error');
        }
    }

    useUrl(input, message) {
        this.state.saved = saveSignalingUrl(this.namespace, input);
        this.state.pending = null;
        this.state.editing = false;
        this.host?.setSignalingUrl(this.state.saved);
        this.notify(message);
        this.runTest();
    }

    async runTest() {
        const url = this.state.saved;
        if (!url) return;
        const run = ++this.testRun;
        this.state.test = { status: 'running', text: '連線測試中…' };
        const result = await testSignalingConnection(url);
        if (run !== this.testRun || url !== this.state.saved) return;
        this.state.test = result.ok
            ? { status: 'ok', text: `連線成功（${result.ms} ms）。` }
            : { status: 'fail', text: describeTestFailure(result) };
    }

    async copy(key) {
        const text = this.commands[key];
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            this.notify('已複製指令。');
        } catch {
            const pre = this.querySelector(`[data-command="${key}"]`);
            if (pre) getSelection()?.selectAllChildren(pre);
            this.notify('無法存取剪貼簿，已選取指令，請手動複製。', 'warn');
        }
    }

    notify(text, level = 'info') {
        this.state.notice = { text, level };
    }

    renderHost() {
        const status = this.hostStatus;
        if (this.startError) return html`<p class="pos-alert" data-level="error">主機無法啟動：${this.startError.message}</p>`;
        if (!status) return html`<p class="pos-muted">啟動中…</p>`;
        const primary = status.role === HOST_ROLE.PRIMARY;
        const orders = this.data?.orders ?? [];
        const openTables = (this.data?.tables ?? []).filter((t) => t.session?.status === 'open').length;
        const rejected = status.signalingState === SIGNALING_STATE.REJECTED;
        const replaced = status.signalingState === SIGNALING_STATE.REPLACED;
        return html`
            <dl class="pos-facts">
                <div><dt>這個分頁</dt><dd data-host-role="${status.role}">${ROLE_LABEL[status.role]}</dd></div>
                <div><dt>信令</dt><dd data-signaling-state="${primary ? status.signalingState : ''}">${primary ? (status.signalingUrl ? SIGNALING_LABEL[status.signalingState] : '尚未設定') : '由主機分頁連線'}</dd></div>
                <div><dt>房間</dt><dd><code data-room-id="${status.roomId ?? ''}">${status.roomId ? `${status.roomId.slice(0, 6)}…` : '—'}</code></dd></div>
                <div><dt>訂單</dt><dd data-order-count="${orders.length}">${orders.length} 筆（待處理 ${orders.filter((o) => o.status === ORDER_STATUS.PENDING).length}）</dd></div>
                <div><dt>開桌</dt><dd data-open-tables="${openTables}">${openTables} 桌</dd></div>
            </dl>
            ${status.role === HOST_ROLE.READONLY ? html`<p class="pos-alert" data-host-readonly>主機在同一台電腦的另一個分頁執行，這裡只顯示資料、不能操作；關閉主機分頁後，這個分頁會自動接手。</p>` : ''}
            ${primary && rejected ? html`<p class="pos-alert" data-level="error">這個房間已被其他主機綁定。若不是你自己的另一台電腦，請「重新產生房間」並重啟信令伺服器。</p>` : ''}
            ${primary && replaced ? html`
                <p class="pos-alert" data-level="warn">另一個使用同一房間的主機連上了信令（例如另一台電腦或瀏覽器）。這個分頁已停止接收裝置連線。
                <button type="button" class="btn" data-action="reconnect">改由這個分頁擔任主機</button></p>` : ''}
            ${primary ? html`
                <div class="pos-actions">
                    <button type="button" class="btn btn-danger" data-action="reset">重設 demo 資料</button>
                    <button type="button" class="btn btn-danger" data-action="regenerate">重新產生房間</button>
                </div>
                ${this.confirmRegenerate ? html`
                    <div class="pos-alert" data-level="warn" data-regenerate-confirm>
                        <p><strong>重新產生房間？</strong>所有已配對的裝置、已入桌的手機與已印出的 QR Code 都會失效，要重新設定。</p>
                        <div class="pos-actions">
                            <button type="button" class="btn btn-danger" data-action="confirm-regenerate">重新產生</button>
                            <button type="button" class="btn" data-action="cancel-regenerate">取消</button>
                        </div>
                    </div>` : ''}
            ` : ''}
        `;
    }

    renderConnections() {
        const list = this.connections;
        if (this.hostStatus?.role !== HOST_ROLE.PRIMARY) return '';
        return html`
            <section class="pos-card" aria-labelledby="pos-v2-conn-title">
                <h3 id="pos-v2-conn-title">已連線裝置（<span data-connection-count>${list.length}</span>）</h3>
                ${list.length ? html`
                    <ul class="pos-connections">
                        ${list.map((conn) => html`
                            <li data-connection="${conn.id}" data-bad-messages="${conn.badMessages}">
                                <span>${describeConnection(conn)}</span>
                                <span class="pos-muted">${conn.id.slice(0, 6)}${conn.badMessages ? ` · 不合格訊息 ${conn.badMessages}` : ''}${conn.paused ? ' · 推送暫停' : ''}</span>
                            </li>`)}
                    </ul>` : html`<p class="pos-muted">還沒有裝置連線。配對與桌牌 QR Code 在後續版本加入。</p>`}
            </section>
        `;
    }

    renderPending() {
        const { pending, saved } = this.state;
        if (!pending) return '';
        if (pending.kind === 'invalid') {
            return html`<p class="pos-alert" data-level="warn" data-sig-invalid>連結帶的信令網址無法使用（${pending.error}），已忽略。</p>`;
        }
        return html`
            <div class="pos-alert" data-level="warn" data-sig-confirm>
                <p><strong>要使用這個信令網址嗎？</strong></p>
                <p><code data-sig-pending>${pending.url}</code></p>
                <p class="pos-muted">信令伺服器負責所有裝置的連線握手，只使用你自己架設的伺服器。${saved ? html`目前使用 <code>${saved}</code>。` : ''}</p>
                <div class="pos-actions">
                    <button type="button" class="btn btn-primary" data-action="accept-sig">使用這個信令網址</button>
                    <button type="button" class="btn" data-action="reject-sig">不使用</button>
                </div>
            </div>
        `;
    }

    renderSignaling() {
        const { saved, editing, test } = this.state;
        if (saved && !editing) {
            return html`
                <p>信令網址：<code data-sig-saved>${saved}</code></p>
                <div class="pos-actions">
                    <button type="button" class="btn" data-action="test" ${test?.status === 'running' ? 'disabled' : ''}>連線測試</button>
                    <button type="button" class="btn" data-action="edit">變更</button>
                    <button type="button" class="btn btn-danger" data-action="clear">清除</button>
                </div>
                <p class="pos-test" data-sig-test="${test?.status ?? ''}" aria-live="polite">${test?.text ?? ''}</p>
            `;
        }
        return html`
            <form data-form="signaling" class="pos-sig-form">
                <label for="pos-v2-sig">信令網址</label>
                <input id="pos-v2-sig" name="sig" type="text" inputmode="url" autocomplete="off" spellcheck="false"
                    placeholder="wss://….trycloudflare.com 或 https://….workers.dev" value="${saved ?? ''}" required>
                <div class="pos-actions">
                    <button type="submit" class="btn btn-primary">儲存並測試</button>
                    ${saved ? html`<button type="button" class="btn" data-action="cancel-edit">取消</button>` : ''}
                </div>
                <p class="pos-muted">貼上 <code>https://</code> 網址會自動改成 <code>wss://</code>。</p>
            </form>
        `;
    }

    renderGuide() {
        return html`
            <p>專案不提供公共信令伺服器，請擇一自架。指令下載固定版本 <code data-guide-version>v${VERSION}</code> 的檔案，與這個頁面同版；可以先打開檔案檢查再執行。</p>
            <div class="pos-guide">
                <section class="pos-card" data-guide-option="node">
                    <h4>A. 這台電腦＋Quick Tunnel</h4>
                    <p class="pos-muted">需要 Node 22 以上與 <a href="${CLOUDFLARED_INSTALL_URL}" target="_blank" rel="noopener">cloudflared</a>，不需要 Cloudflare 帳號。</p>
                    <pre data-command="node">${this.commands.node}</pre>
                    <button type="button" class="btn" data-action="copy" data-command="node">複製指令</button>
                    <p class="pos-muted">終端機會印出已帶好信令網址的主機頁連結，用它開啟這一頁，或把印出的 <code>wss://</code> 網址貼到上方。Quick Tunnel 的網址每次啟動都不同。</p>
                </section>
                <section class="pos-card" data-guide-option="worker">
                    <h4>B. 自己的 Cloudflare Worker</h4>
                    <p class="pos-muted">需要 Cloudflare 帳號（免費方案即可）與 Node；<a href="${WRANGLER_DOCS_URL}" target="_blank" rel="noopener">wrangler 說明</a>。</p>
                    <pre data-command="worker">${this.commands.worker}</pre>
                    <button type="button" class="btn" data-action="copy" data-command="worker">複製指令</button>
                    <p class="pos-muted">部署完成後，把印出的 <code>https://pos-v2-signaling.….workers.dev</code> 貼到上方；Worker 首頁也有主機頁連結。網址固定，下次不用重設。</p>
                </section>
            </div>
            <p class="pos-muted">自己架設前端網站時，要把網站的網址加進信令伺服器的 Origin 白名單（<code>--allow-origin</code>，或 <code>wrangler.jsonc</code> 的 <code>ALLOWED_ORIGINS</code>）。</p>
        `;
    }

    render() {
        const { saved, notice, guideOpen } = this.state;
        return html`
            <style>
                .pos-page { display: flex; flex-direction: column; gap: 1rem; }
                .pos-header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color); }
                .pos-header h2 { margin: 0; font-size: 1.35rem; }
                .pos-header .pos-meta { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-left: auto; align-items: center; font-size: 0.8rem; color: var(--text-muted); }
                .pos-pill { padding: 0.1rem 0.6rem; border-radius: 999px; border: 1px solid var(--border-color); background: var(--surface-color); white-space: nowrap; }
                .pos-pill[data-ready="false"] { border-color: #d97706; }
                .pos-alert { margin: 0; padding: 0.6rem 0.9rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-color); }
                .pos-alert p { margin: 0.25rem 0; }
                .pos-alert[data-level="warn"] { border-color: #d97706; }
                .pos-alert[data-level="error"] { border-color: var(--danger, #dc2626); }
                .pos-muted { color: var(--text-muted); font-size: 0.9rem; }
                                .pos-card { padding: 1rem; border: 1px solid var(--card-border); border-radius: 12px; background: var(--card-bg); box-shadow: var(--card-shadow); color: var(--text-color); min-width: 0; }
                .pos-card h3, .pos-card h4 { margin: 0 0 0.5rem; font-size: 1rem; }
                .pos-card pre { margin: 0.5rem 0; padding: 0.75rem; overflow-x: auto; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-color); font-size: 0.8rem; line-height: 1.5; white-space: pre; }
                .pos-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
                .pos-guide { display: grid; gap: 1rem; }
                .pos-sig-form { display: flex; flex-direction: column; gap: 0.5rem; }
                .pos-sig-form input { width: 100%; box-sizing: border-box; padding: 0.5rem 0.6rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-color); font: inherit; }
                .pos-test[data-sig-test="ok"] { color: var(--success, #16a34a); }
                .pos-test[data-sig-test="fail"] { color: var(--danger, #dc2626); }
                .pos-card code { word-break: break-all; }
                .pos-facts { display: grid; gap: 0.5rem 1rem; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 0 0 0.75rem; }
                .pos-facts dt { font-size: 0.75rem; color: var(--text-muted); }
                .pos-facts dd { margin: 0; font-weight: 600; }
                .pos-connections { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.25rem; }
                .pos-connections li span + span { margin-left: 0.5rem; }
                details[data-guide] > summary { cursor: pointer; font-weight: 600; }
            </style>
            <section class="pos-page" data-pos-role="admin" data-pos-version="2">
                <header class="pos-header">
                    <h2>🛠️ POS v2 · 管理主機</h2>
                    <div class="pos-meta">
                        <span class="pos-pill" title="資料隔離用的 namespace">ns: ${this.namespace}</span>
                        <span class="pos-pill" data-ready="${String(Boolean(saved))}" data-sig-status>${saved ? '信令已設定' : '尚未設定信令'}</span>
                    </div>
                </header>
                <div aria-live="polite" class="pos-notice">
                    ${notice ? html`<p class="pos-alert" data-level="${notice.level}">${notice.text}</p>` : ''}
                </div>
                ${this.renderPending()}
                <section class="pos-card" aria-labelledby="pos-v2-host-title">
                    <h3 id="pos-v2-host-title">主機</h3>
                    ${this.renderHost()}
                </section>
                <section class="pos-card" aria-labelledby="pos-v2-sig-title">
                    <h3 id="pos-v2-sig-title">信令伺服器</h3>
                    <p class="pos-muted">店員裝置與顧客手機經由信令伺服器和這台主機建立直連；訂單資料只在 DataChannel 裡傳送，不經過信令伺服器。主機產生的 QR Code 都會帶上這個網址，其他裝置不用另外設定。</p>
                    ${this.renderSignaling()}
                </section>
                ${this.renderConnections()}
                ${saved ? html`
                    <details class="pos-card" data-guide ${guideOpen ? 'open' : ''}>
                        <summary>自架信令伺服器的步驟</summary>
                        ${this.renderGuide()}
                    </details>
                ` : html`
                    <section class="pos-card" data-guide-panel aria-labelledby="pos-v2-guide-title">
                        <h3 id="pos-v2-guide-title">自架信令伺服器</h3>
                        ${this.renderGuide()}
                    </section>
                `}
            </section>
        `;
    }
}

customElements.define('page-pos-v2-admin', PosV2AdminPage);
