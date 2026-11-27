/**
 * POS v2 店員裝置的角色畫面（#16）：點餐、廚房、叫號直接沿用第一代元件，只把工作階段換成
 * `RemotePosSession`（A8：第一代元件只做相容的擴充）。還沒連上主機、沒有授權或角色不符時，
 * 改顯示連線面板。
 */
import { html } from '../../../../lib/html.js';
import { isKioskMode } from '../../../../app/kiosk.js';
import { PosOrderPage } from '../pos/PosOrderPage.js';
import { PosKitchenPage } from '../pos/PosKitchenPage.js';
import { PosDisplayPage } from '../pos/PosDisplayPage.js';
import { LINK_STATE } from './peer-link.js';
import { JOIN_PATH, ROLE_LABEL, STAFF_ROLE_PATHS, buildRemoteHash } from './pos-v2-remote.js';
import { REMOTE_PHASE, RemotePosSession } from './remote-pos-session.js';

/** @param {typeof import('../pos/pos-page.js').PosRolePage} Base */
const remoteStaffPage = (Base) => class extends Base {
    static Session = RemotePosSession;
    static titlePrefix = 'POS v2';
    static hubPath = JOIN_PATH;
    static hubLabel = '重新配對';
    static unsupportedText = '此瀏覽器不支援 WebRTC 或 WebSocket，無法作為 POS v2 的遠端裝置。';

    /** 範例內連結要帶上房間與信令，裝置才連得到同一個主機 */
    link(path) {
        const session = this.session;
        if (!session?.roomId || !session.sig) return super.link(path);
        return buildRemoteHash(path, { roomId: session.roomId, sig: session.sig, namespace: session.namespace, kiosk: isKioskMode(location.hash) });
    }

    async onAction(name, dataset) {
        if (name === 'retry-link') {
            this.session?.retry();
            return;
        }
        await super.onAction(name, dataset);
    }

    renderStatusPill(snapshot) {
        const connection = snapshot?.connection;
        const ready = connection?.phase === REMOTE_PHASE.READY;
        return html`<span class="pos-pill" data-online="${String(ready)}" data-link-state="${connection?.link ?? ''}">${ready ? '已連上主機' : connection?.label ?? '連線中…'}</span>`;
    }

    renderHeaderExtra() {
        const device = this.session?.device;
        return html`${device?.label ? html`<span class="pos-pill" data-device-label>${device.label}</span>` : ''}${super.renderHeaderExtra()}`;
    }

    renderBody(snapshot) {
        const connection = snapshot.connection;
        if (connection.phase === REMOTE_PHASE.READY) {
            return html`
                ${snapshot.error ? html`<p class="pos-alert" data-level="error">${snapshot.error.message}</p>` : ''}
                ${super.renderBody(snapshot)}
            `;
        }
        return html`<div class="pos-card" data-remote-phase="${connection.phase}">${this.renderConnection(connection)}</div>`;
    }

    renderConnection(connection) {
        const join = html`<a class="btn btn-primary" href="${this.link(JOIN_PATH)}">前往配對</a>`;
        switch (connection.phase) {
            case REMOTE_PHASE.MISSING:
                return html`<p>這個網址缺少房間或信令資訊。請用手機相機掃管理主機上的配對 QR Code。</p>`;
            case REMOTE_PHASE.UNPAIRED:
                return html`<p>這台裝置還沒有配對到這個主機。</p>${join}`;
            case REMOTE_PHASE.REVOKED:
                return html`<p class="pos-alert" data-level="warn">管理端已撤銷這台裝置的授權，請重新配對。</p>${join}`;
            case REMOTE_PHASE.WRONG_ROLE: {
                const role = connection.actualRole;
                return html`<p>這台裝置配對的角色是「${ROLE_LABEL[role] ?? role}」。</p>
                    ${STAFF_ROLE_PATHS[role] ? html`<a class="btn btn-primary" href="${this.link(STAFF_ROLE_PATHS[role])}">前往${ROLE_LABEL[role]}畫面</a>` : ''}`;
            }
            default:
                if (connection.link === LINK_STATE.FAILED) {
                    return html`
                        <p class="pos-alert" data-level="error" data-need-turn="${String(Boolean(connection.needTurn))}">
                            ${connection.label}。${connection.needTurn ? '裝置和主機可能不在同一個網路，或網路擋下了直連；需要 TURN 伺服器才能連線。' : ''}
                        </p>
                        <button type="button" class="btn" data-action="retry-link">重試</button>`;
                }
                return html`<p class="pos-muted">${connection.label}</p>`;
        }
    }
};

export class PosV2OrderPage extends remoteStaffPage(PosOrderPage) {}
export class PosV2KitchenPage extends remoteStaffPage(PosKitchenPage) {}
export class PosV2DisplayPage extends remoteStaffPage(PosDisplayPage) {}

customElements.define('page-pos-v2-order', PosV2OrderPage);
customElements.define('page-pos-v2-kitchen', PosV2KitchenPage);
customElements.define('page-pos-v2-display', PosV2DisplayPage);
