import { BaseComponent } from '../../../../lib/base-component.js';
import { html } from '../../../../lib/html.js';
import { router } from '../../../../lib/router.js';
import { VERSION } from '../../../../lib/version.js';
import { resolveNamespace } from '../solution-kit.js';
import { ORDER_STATUS, STATUS_LABEL, summarizeOrders } from '../pos/pos-model.js';
import { formatMoney, formatTime } from '../pos/pos-page.js';
import { HOST_ROLE, PosV2Host } from './pos-v2-host.js';
import { HOME_PATH, JOIN_PATH, ROLE_LABEL as STAFF_ROLE_LABEL, TABLE_PATH, buildRemoteHash } from './pos-v2-remote.js';
import { qrCode } from './remote-page.js';
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

/** 下一個沒人用的廚房站台名稱：K1、K2… */
function nextStationName(devices) {
    const taken = new Set(devices.filter((d) => d.role === 'kitchen' && d.revokedAt == null).map((d) => d.station));
    let n = 1;
    while (taken.has(`K${n}`)) n++;
    return `K${n}`;
}

const formatClock = (ts) => new Date(ts).toLocaleTimeString('zh-TW', { hour12: false });

/** 已連線裝置的身分說明 */
function describeConnection(conn) {
    if (conn.device) {
        const role = STAFF_ROLE_LABEL[conn.device.role] ?? conn.device.role;
        return `${role}${conn.device.station ? ` · ${conn.device.station}` : ''}${conn.device.label ? ` · ${conn.device.label}` : ''}`;
    }
    if (conn.table) return `顧客 · ${conn.table.tableId}`;
    if (conn.watches.length) return `查單 · ${conn.watches.length} 筆`;
    return '尚未驗證';
}

/**
 * POS v2 管理主機（#16）：主機分頁（Web Lock 單例，其他管理分頁唯讀）、信令設定（A9）、
 * 房間與已連線裝置、店員裝置配對、桌位、營運統計與訂單明細（可取消待處理訂單）。
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
        /** 目前顯示的配對票 { roomId, token, code, expiresAt } */
        this.pairing = null;
        this.pairings = [];
        this._pairingTimer = null;
        /** 開桌或換新後的入桌碼（主機只存雜湊，碼只在這個分頁的記憶體裡）：tableId → { code, sessionId } */
        this.tableCodes = new Map();
        this.attempts = [];
        this.tableCardsOpen = false;
    }

    connectedCallback() {
        super.connectedCallback();
        this.state.saved = loadSignalingUrl(this.namespace);
        this.checkSigParam();
        // 停在同一頁時換網址（例如再點一次帶 sig 的連結）不會重建頁面，要自己重新檢查
        this._offRoute = router.on('route-change', () => this.checkSigParam());
        // 直接用瀏覽器列印（Ctrl+P）時桌牌區塊可能是收合的，收合的 details 內容不會印出：先展開
        this._onBeforePrint = () => {
            const details = this.querySelector('details[data-table-cards]');
            if (details && !details.open) details.open = true;
        };
        window.addEventListener('beforeprint', this._onBeforePrint);
        this.startHost();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._offRoute?.();
        window.removeEventListener('beforeprint', this._onBeforePrint);
        this.testRun += 1;
        this.host?.dispose();
        this.host = null;
        clearTimeout(this._pairingTimer);
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
        host.on('attempts', (list) => {
            this.attempts = list;
            this.scheduleUpdate();
        });
        host.on('pairings', (list) => {
            this.pairings = list;
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
            const [orders, tables, devices] = await Promise.all([host.repository.listOrders(), host.repository.listTables(), host.repository.listDevices()]);
            if (this.host !== host) return;
            this.data = { orders, tables, devices };
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
            this.onAction(button.dataset.action, button.dataset, button);
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
            if (event.target.matches?.('details[data-table-cards]')) this.tableCardsOpen = event.target.open;
        }, true);
    }

    onAction(name, dataset, button) {
        switch (name) {
            case 'create-pairing':
                return this.runHostAction(async () => {
                    const ticket = await this.host.createPairing();
                    this.pairing = { ...ticket, roomId: this.hostStatus?.roomId };
                    clearTimeout(this._pairingTimer);
                    this._pairingTimer = setTimeout(() => this.scheduleUpdate(), Math.max(0, ticket.expiresAt - Date.now()) + 50);
                    return `已產生配對 QR Code 與連線碼，${formatClock(ticket.expiresAt)} 前有效。`;
                });
            case 'approve': {
                const item = button.closest('[data-pairing]');
                const role = item.querySelector('select[name="role"]').value;
                const station = role === 'kitchen' ? item.querySelector('input[name="station"]').value.trim() : null;
                return this.runHostAction(async () => {
                    if (!role) throw new Error('先選擇這台裝置的角色（點餐、廚房或叫號），再按核准');
                    if (role === 'kitchen' && !station) throw new Error('廚房要指定站台名稱');
                    const device = await this.host.approvePairing(dataset.pairingId, { role, station });
                    return `已核准：${STAFF_ROLE_LABEL[device.role]}${device.station ? `（${device.station}）` : ''}${device.label ? ` · ${device.label}` : ''}。`;
                });
            }
            case 'reject':
                return this.runHostAction(async () => {
                    this.host.rejectPairing(dataset.pairingId);
                    return '已拒絕配對申請。';
                });
            case 'open-table':
            case 'rotate-code':
                return this.runHostAction(async () => {
                    const { session, code } = name === 'open-table'
                        ? await this.host.openTable(dataset.tableId)
                        : await this.host.rotateTableCode(dataset.tableId);
                    this.tableCodes.set(dataset.tableId, { code, sessionId: session.id });
                    return `${dataset.tableId} 桌${name === 'open-table' ? '已開桌' : '已換新入桌碼'}，入桌碼 ${code}。`;
                });
            case 'close-table':
                return this.runHostAction(async () => {
                    await this.host.closeTable(dataset.tableId);
                    this.tableCodes.delete(dataset.tableId);
                    return `${dataset.tableId} 桌已關桌，這次用餐的入桌授權不能再送單。`;
                });
            case 'cancel-order':
                return this.runHostAction(async () => {
                    const { result, order } = await this.host.cancelOrder(dataset.orderId);
                    return result === 'noop' ? `訂單 ${order.number} 已經取消` : `已取消訂單 ${order.number}`;
                });
            case 'print-tables':
                window.print();
                return;
            case 'revoke':
                return this.runHostAction(async () => {
                    await this.host.revokeDevice(dataset.deviceId);
                    return '已撤銷裝置授權。';
                });
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

    /** 遠端裝置網址：帶房間與信令，裝置掃碼後不用另外設定（A9） */
    remoteUrl(path, extra = {}) {
        const status = this.hostStatus;
        const hash = buildRemoteHash(path, { roomId: status.roomId, sig: status.signalingUrl, namespace: this.namespace, extra });
        return new URL(hash, document.baseURI).href;
    }

    renderPairing() {
        const status = this.hostStatus;
        if (status?.role !== HOST_ROLE.PRIMARY) return '';
        if (!status.signalingUrl || !status.roomId) {
            return html`<p class="pos-muted">先在下方設定信令網址，才能配對店員裝置。</p>`;
        }
        const pairing = this.pairing?.roomId === status.roomId ? this.pairing : null;
        const expired = pairing && Date.now() >= pairing.expiresAt;
        const devices = this.data?.devices ?? [];
        const suggestion = nextStationName(devices);
        let ticket = '';
        if (pairing && !expired) {
            const url = this.remoteUrl(JOIN_PATH, { pair: pairing.token });
            ticket = html`
                <div class="pos-pairing">
                    <a class="pos-qr" href="${url}" target="_blank" rel="noopener" aria-label="配對 QR Code（也可以點開連結）" data-pairing-url="${url}">${qrCode(url)}</a>
                    <div>
                        <p>用店員裝置的相機掃 QR Code，或在<a href="${this.remoteUrl(JOIN_PATH)}" target="_blank" rel="noopener" data-join-url>店員加入頁</a>輸入連線碼：</p>
                        <p class="pos-code" data-pairing-code="${pairing.code}">${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}</p>
                        <p class="pos-muted">${formatClock(pairing.expiresAt)} 前有效，期限內可以讓多台裝置申請；每次申請都要在下方核准。</p>
                    </div>
                </div>`;
        }
        return html`
            ${ticket}
            ${expired ? html`<p class="pos-muted" data-pairing-expired>配對碼已過期。</p>` : ''}
            <div class="pos-actions">
                <button type="button" class="btn ${pairing && !expired ? '' : 'btn-primary'}" data-action="create-pairing">${pairing && !expired ? '產生新的配對碼' : '產生配對 QR Code'}</button>
            </div>
            <h4>待核准（<span data-pairing-count>${this.pairings.length}</span>）</h4>
            <p class="pos-muted" data-role-hint>裝置的畫面（點餐、廚房、叫號）由這裡選的角色決定，裝置端不能自己改；選錯時在下方「已配對」清單撤銷後重新配對。</p>
            ${this.pairings.length ? html`
                <ul class="pos-approvals">
                    ${this.pairings.map((p) => html`
                        <li id="pos-v2-pairing-${p.id}" data-pairing="${p.id}">
                            <div><strong>${p.label || '未命名裝置'}</strong> <span class="pos-muted">${formatClock(p.requestedAt)} · ${p.connectionId.slice(0, 6)}</span></div>
                            <div class="pos-actions">
                                <select name="role" aria-label="角色" required>
                                    <option value="" selected disabled>選擇角色…</option>
                                    ${Object.entries(STAFF_ROLE_LABEL).map(([value, label]) => html`<option value="${value}">${label}</option>`)}
                                </select>
                                <input name="station" aria-label="廚房站台名稱" maxlength="40" value="${suggestion}" placeholder="站台（廚房才需要）">
                                <button type="button" class="btn btn-primary" data-action="approve" data-pairing-id="${p.id}">核准</button>
                                <button type="button" class="btn" data-action="reject" data-pairing-id="${p.id}">拒絕</button>
                            </div>
                        </li>`)}
                </ul>` : html`<p class="pos-muted">裝置送出申請後會出現在這裡。</p>`}
        `;
    }

    /** 營運統計與訂單明細（沿用第一代的 summarizeOrders）；取消待處理訂單只在主機分頁 */
    renderOrders() {
        const orders = this.data.orders;
        const summary = summarizeOrders(orders);
        const recent = [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
        const canCancel = this.hostStatus?.role === HOST_ROLE.PRIMARY;
        return html`
            <section class="pos-card" aria-labelledby="pos-v2-orders-title" data-orders-panel>
                <h3 id="pos-v2-orders-title">營運統計</h3>
                <div class="pos-stats" aria-label="統計">
                    ${Object.values(ORDER_STATUS).map((status) => html`
                        <div class="pos-stat" data-stat="${status}"><strong>${summary.counts[status]}</strong><span>${STATUS_LABEL[status]}</span></div>
                    `)}
                    <div class="pos-stat" data-stat="revenue"><strong>${formatMoney(summary.revenue)}</strong><span>營收（不含取消，未收款）</span></div>
                    <div class="pos-stat" data-stat="avg-prep"><strong>${summary.avgPrepMs === null ? '—' : `${(summary.avgPrepMs / 1000).toFixed(1)} 秒`}</strong><span>平均備餐時間</span></div>
                </div>
                ${summary.topItems.length ? html`
                    <p class="pos-muted" data-top-items>熱銷：${summary.topItems.map((item) => `${item.emoji} ${item.name} × ${item.qty}`).join('、')}</p>` : ''}
                <h4>訂單明細（最新 50 筆）</h4>
                ${recent.length ? html`
                    <div class="pos-table-wrap" tabindex="0" role="region" aria-label="訂單明細表">
                        <table class="pos-table">
                            <thead><tr><th>號碼</th><th>桌號</th><th>品項</th><th>金額</th><th>狀態</th><th>站台</th><th>更新</th><th></th></tr></thead>
                            <tbody>
                                ${recent.map((o) => html`
                                    <tr id="pos-v2-order-${o.id}" data-order-id="${o.id}" data-order-number="${o.number}" data-status="${o.status}">
                                        <td>${o.number}</td>
                                        <td>${o.tableId ?? '—'}</td>
                                        <td>${o.items.map((line) => `${line.name}×${line.qty}`).join('、')}</td>
                                        <td>${formatMoney(o.total)}</td>
                                        <td>${STATUS_LABEL[o.status]}</td>
                                        <td>${o.station ?? '—'}</td>
                                        <td>${formatTime(o.updatedAt)}</td>
                                        <td>${canCancel && o.status === ORDER_STATUS.PENDING ? html`<button type="button" class="btn" data-action="cancel-order" data-order-id="${o.id}">取消</button>` : ''}</td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                ` : html`<p class="pos-muted">還沒有訂單。</p>`}
            </section>
        `;
    }

    renderTables() {
        const status = this.hostStatus;
        const tables = this.data?.tables ?? [];
        if (!status || !tables.length) return '';
        const primary = status.role === HOST_ROLE.PRIMARY;
        const orders = this.data?.orders ?? [];
        const failures = new Map(this.attempts.map((a) => [a.target, a]));
        return html`
            <ul class="pos-approvals pos-tables">
                ${tables.map((table) => {
                    const session = table.session;
                    const open = session?.status === 'open';
                    const entry = this.tableCodes.get(table.id);
                    const code = open && entry?.sessionId === session.id ? entry.code : null;
                    const count = open ? orders.filter((o) => o.diningSessionId === session.id).length : 0;
                    const attempt = failures.get(`table:${table.id}`);
                    return html`
                        <li data-table="${table.id}" data-table-status="${open ? 'open' : 'closed'}" data-table-session="${open ? session.id : ''}" data-session-orders="${count}">
                            <div>
                                <strong>${table.name}</strong>
                                <span class="pos-muted">${open ? `用餐中 · 場次 ${session.id.slice(0, 6)} · ${count} 筆訂單` : '未開桌'}</span>
                                ${attempt?.failures ? html`<span class="pos-muted" data-table-failures="${attempt.failures}"> · 入桌碼錯誤 ${attempt.failures} 次${attempt.retryAfterMs ? '（冷卻中）' : ''}</span>` : ''}
                                ${code ? html`<div>入桌碼 <span class="pos-code pos-code-small" data-table-code="${code}">${code.slice(0, 3)} ${code.slice(3)}</span></div>`
                                    : open && primary ? html`<div class="pos-muted">入桌碼只在開桌或換新時顯示；要告訴顧客請按「換新入桌碼」。</div>` : ''}
                            </div>
                            ${primary ? html`
                                <div class="pos-actions">
                                    ${open ? html`
                                        <button type="button" class="btn" data-action="rotate-code" data-table-id="${table.id}">換新入桌碼</button>
                                        <button type="button" class="btn btn-danger" data-action="close-table" data-table-id="${table.id}">關桌</button>`
                                        : html`<button type="button" class="btn btn-primary" data-action="open-table" data-table-id="${table.id}">開桌</button>`}
                                </div>` : ''}
                        </li>`;
                })}
            </ul>
            ${primary && status.signalingUrl && status.roomId ? this.renderTableCards(tables) : ''}
        `;
    }

    /** 桌牌與店家入口的 QR Code：房間不變就一直有效（重設 demo 資料也保留），可以印出來放在桌上 */
    renderTableCards(tables) {
        const homeUrl = this.remoteUrl(HOME_PATH);
        return html`
            <details class="pos-table-cards-panel" data-table-cards ${this.tableCardsOpen ? 'open' : ''}>
                <summary>桌牌 QR Code（可列印）</summary>
                <p class="pos-muted">桌牌只帶桌號，顧客掃碼後還要輸入入桌碼才能點餐。「重新產生房間」後要重新列印。</p>
                <div class="pos-actions"><button type="button" class="btn" data-action="print-tables">列印桌牌</button></div>
                <div class="pos-table-cards" data-print-area>
                    <figure class="pos-table-card" data-home-card>
                        <a class="pos-qr" href="${homeUrl}" target="_blank" rel="noopener" data-home-url="${homeUrl}">${qrCode(homeUrl)}</a>
                        <figcaption>店家入口（選桌點餐）</figcaption>
                    </figure>
                    ${tables.map((table) => {
                        const url = this.remoteUrl(TABLE_PATH, { t: table.id });
                        return html`
                            <figure class="pos-table-card" data-table-card="${table.id}">
                                <a class="pos-qr" href="${url}" target="_blank" rel="noopener" data-table-url="${url}">${qrCode(url)}</a>
                                <figcaption>${table.name}</figcaption>
                            </figure>`;
                    })}
                </div>
            </details>
        `;
    }

    renderDevices() {
        const devices = (this.data?.devices ?? []).filter((d) => d.revokedAt == null);
        if (this.hostStatus?.role !== HOST_ROLE.PRIMARY || !devices.length) return '';
        const online = new Set(this.connections.map((c) => c.device?.id).filter(Boolean));
        return html`
            <h4>已配對（${devices.length}）</h4>
            <ul class="pos-approvals">
                ${devices.map((d) => html`
                    <li data-device="${d.id}" data-device-role="${d.role}" data-device-online="${String(online.has(d.id))}">
                        <div><strong>${STAFF_ROLE_LABEL[d.role] ?? d.role}${d.station ? ` · ${d.station}` : ''}</strong>${d.label ? ` · ${d.label}` : ''}
                            <span class="pos-muted">${online.has(d.id) ? '在線' : '離線'}</span></div>
                        <button type="button" class="btn btn-danger" data-action="revoke" data-device-id="${d.id}">撤銷</button>
                    </li>`)}
            </ul>
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
                    </ul>` : html`<p class="pos-muted">還沒有裝置連線。</p>`}
                ${this.renderDevices()}
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
                    <p class="pos-muted" data-guide-port>終端機顯示連接埠 8787 已被其他程式使用時，在第二行後面加上 <code>--port 8788</code>（或其他沒被使用的連接埠）再執行，其他步驟不變。</p>
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
                .pos-pairing { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin-bottom: 0.75rem; }
                .pos-pairing p { margin: 0.25rem 0; }
                /* QR Code 一律深色模組在淺色底上，深色主題也一樣，相機才掃得到 */
                .pos-qr { display: block; width: 180px; padding: 0; background: #fff; color: #000; border-radius: 8px; line-height: 0; }
                .pos-qr svg { width: 100%; height: auto; }
                .pos-qr-error { display: block; padding: 0.75rem; line-height: 1.4; font-size: 0.85rem; }
                .pos-code { font-size: 2rem; font-weight: 800; letter-spacing: 0.15em; font-variant-numeric: tabular-nums; }
                .pos-approvals { list-style: none; margin: 0 0 0.75rem; padding: 0; display: grid; gap: 0.5rem; }
                .pos-approvals li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; }
                .pos-approvals select, .pos-approvals input { font: inherit; padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-color); }
                .pos-approvals input { width: 9rem; }
                .pos-code-small { font-size: 1.3rem; }
                .pos-tables li > div:first-child { flex: 1; min-width: 220px; }
                .pos-table-cards-panel > summary { cursor: pointer; font-weight: 600; margin: 0.5rem 0; }
                .pos-table-cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); margin-top: 0.75rem; }
                .pos-table-card { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 0.35rem; text-align: center; font-weight: 700; }
                .pos-table-card .pos-qr { width: 150px; }
                @media print {
                    /* 只印桌牌：不含列印區的元素不占版面（只用 visibility 會多出空白頁），列印區的祖先保留但隱藏 */
                    body *:not(:has([data-print-area])):not([data-print-area]):not([data-print-area] *) { display: none !important; }
                    body * { visibility: hidden; }
                    [data-print-area], [data-print-area] * { visibility: visible; }
                    [data-print-area] { position: absolute; inset: 0 auto auto 0; width: 100%; grid-template-columns: repeat(3, 1fr); color: #000; }
                    .pos-table-card { break-inside: avoid; padding: 1rem; border: 1px dashed #999; }
                }
                [data-pairing-panel] h4, .pos-card .pos-connections + h4, [data-orders-panel] h4 { margin-top: 1rem; }
                .pos-stats { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
                .pos-stat { padding: 0.75rem; border-radius: 10px; border: 1px solid var(--border-color); background: var(--surface-color); }
                .pos-stat strong { display: block; font-size: 1.5rem; font-variant-numeric: tabular-nums; }
                .pos-stat span { font-size: 0.8rem; color: var(--text-muted); }
                .pos-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
                .pos-table th, .pos-table td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border-color); vertical-align: top; }
                .pos-table-wrap { overflow-x: auto; }
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
                ${this.hostStatus?.role === HOST_ROLE.PRIMARY ? html`
                    <section class="pos-card" aria-labelledby="pos-v2-pair-title" data-pairing-panel>
                        <h3 id="pos-v2-pair-title">店員裝置配對</h3>
                        ${this.renderPairing()}
                    </section>` : ''}
                ${this.data ? this.renderOrders() : ''}
                ${this.data?.tables?.length ? html`
                    <section class="pos-card" aria-labelledby="pos-v2-tables-title" data-tables-panel>
                        <h3 id="pos-v2-tables-title">桌位</h3>
                        ${this.renderTables()}
                    </section>` : ''}
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
