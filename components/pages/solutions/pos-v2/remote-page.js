/**
 * POS v2 遠端畫面的共同部分（#16）：把第一代 `PosRolePage` 系列元件的工作階段換成遠端版本，
 * 標頭顯示和主機的連線狀態，還沒連上、沒有授權或角色不符時改顯示連線面板。
 */
import { html, unsafe } from '../../../../lib/html.js';
import { isKioskMode } from '../../../../app/kiosk.js';
import { LINK_STATE } from './peer-link.js';
import { JOIN_PATH, ROLE_LABEL, STAFF_ROLE_PATHS, buildRemoteHash } from './pos-v2-remote.js';
import { REMOTE_PHASE, RemotePosSession } from './remote-pos-session.js';
import { encodeQr, qrToSvg } from './qr-code.js';

/** 產生過的 QR Code SVG：主機頁每次重繪都會畫桌牌，同一個網址不要重算（遮罩要試 8 次） */
const qrCache = new Map();
const QR_CACHE_LIMIT = 64;

/**
 * 網址的 QR Code（SVG 只含 qrToSvg 產生的路徑，可以直接插入）。超過容量時改顯示說明。
 * 容器要淺色底、深色字（`.pos-qr`），深色主題也一樣，相機才掃得到。
 * @param {string} text
 */
export function qrCode(text) {
    let svg = qrCache.get(text);
    if (svg === undefined) {
        try {
            svg = qrToSvg(encodeQr(text));
        } catch (err) {
            return html`<span class="pos-qr-error">${err.message}；請改用連結。</span>`;
        }
        if (qrCache.size >= QR_CACHE_LIMIT) qrCache.delete(qrCache.keys().next().value);
        qrCache.set(text, svg);
    }
    return unsafe(svg);
}

/** QR Code 容器的樣式 */
export const QR_STYLE = `
    .pos-qr { display: block; width: 180px; max-width: 100%; background: #fff; color: #000; border-radius: 8px; line-height: 0; }
    .pos-qr svg { width: 100%; height: auto; }
    .pos-qr-error { display: block; padding: 0.75rem; line-height: 1.4; font-size: 0.85rem; }
`;

const ONLINE_PHASES = new Set([REMOTE_PHASE.READY, REMOTE_PHASE.NEED_CODE, REMOTE_PHASE.CLOSED]);

/** @param {typeof import('../pos/pos-page.js').PosRolePage} Base */
export const remotePage = (Base) => class extends Base {
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
        // 連上主機且授權正常（顧客還在輸入入桌碼、或用餐已結束也算）；被撤銷、角色不符時不算
        const online = connection?.link === LINK_STATE.OPEN && ONLINE_PHASES.has(connection.phase);
        return html`<span class="pos-pill" data-online="${String(online)}" data-link-state="${connection?.link ?? ''}">${online ? '已連上主機' : connection?.label ?? '連線中…'}</span>`;
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
