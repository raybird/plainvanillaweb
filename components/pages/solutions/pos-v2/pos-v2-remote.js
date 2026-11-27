/**
 * POS v2 遠端裝置的共用部分（#16，協定規格第 2、4、5 節）：網址參數、本機授權的存放，
 * 以及把信令、WebRTC 與 RPC 組成一條「連到主機」的連線。
 *
 * `PosV2Remote` 事件：`state`（連線狀態改變）、`open`（DataChannel 開啟、可以送 RPC；每次重連都會再觸發）、
 * `push`（主機推送）、`gap`（推送跳號，應 `sync`）。
 */
import { BaseService } from '../../../../lib/base-service.js';
import { buildSolutionHash, resolveNamespace, solutionStorageName } from '../solution-kit.js';
import { LINK_STATE, PeerLink } from './peer-link.js';
import { PEER_ERROR_CODES, PosV2RpcClient } from './pos-v2-rpc-client.js';
import { PosError } from './pos-v2-model.js';
import { SignalingClient, normalizeSignalingUrl } from './signaling-client.js';

export const POS_V2_SLUG = 'pos-v2';
export const DEFAULT_NAMESPACE = `solution-${POS_V2_SLUG}`;

/** 已配對店員裝置的角色畫面 */
export const STAFF_ROLE_PATHS = Object.freeze({
    order: '/solutions/pos-v2/order',
    kitchen: '/solutions/pos-v2/kitchen',
    display: '/solutions/pos-v2/display',
});

export const JOIN_PATH = '/solutions/pos-v2/join';
/** 顧客端：店家入口、桌牌、訂單查詢 */
export const HOME_PATH = '/solutions/pos-v2/home';
export const TABLE_PATH = '/solutions/pos-v2/table';
export const TRACK_PATH = '/solutions/pos-v2/track';

export const ROLE_LABEL = Object.freeze({ order: '點餐', kitchen: '廚房', display: '叫號' });

export const LINK_STATE_LABEL = Object.freeze({
    [LINK_STATE.IDLE]: '尚未連線',
    [LINK_STATE.SIGNALING]: '連線信令中…',
    [LINK_STATE.WAITING_HOST]: '等待主機上線…',
    [LINK_STATE.CONNECTING]: '和主機建立直連中…',
    [LINK_STATE.OPEN]: '已連上主機',
    [LINK_STATE.RETRYING]: '和主機的連線中斷，重新連線中…',
    [LINK_STATE.FAILED]: '無法和主機建立直連',
    [LINK_STATE.STOPPED]: '已停止',
});

const ROOM_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * 讀出網址的 hash query（`room`、`sig`、`ns` 與其他參數）。`room` 或 `sig` 格式不對時視為沒有。
 * @param {string} [hash]
 * @returns {{ roomId: string | null, sig: string | null, namespace: string, params: URLSearchParams }}
 */
export function readRemoteParams(hash = globalThis.location?.hash ?? '') {
    const raw = String(hash).replace(/^#/, '');
    const index = raw.indexOf('?');
    const params = new URLSearchParams(index === -1 ? '' : raw.slice(index + 1));
    const room = params.get('room');
    let sig = null;
    try {
        sig = params.get('sig') ? normalizeSignalingUrl(params.get('sig')) : null;
    } catch {
        sig = null;
    }
    return { roomId: room && ROOM_PATTERN.test(room) ? room : null, sig, namespace: resolveNamespace(POS_V2_SLUG, hash), params };
}

/**
 * 組出遠端裝置的網址 hash：帶上房間、信令與（非預設時的）namespace。
 * @param {string} path
 * @param {{ roomId: string, sig: string, namespace?: string, kiosk?: boolean, extra?: Record<string, string> }} options
 */
export function buildRemoteHash(path, { roomId, sig, namespace = DEFAULT_NAMESPACE, kiosk = false, extra = {} }) {
    const base = buildSolutionHash(path, { ns: namespace === DEFAULT_NAMESPACE ? undefined : namespace, kiosk });
    const [route, query = ''] = base.split('?');
    const params = new URLSearchParams(query);
    params.set('room', roomId);
    params.set('sig', sig);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    return `${route}?${params}`;
}

/**
 * 店員裝置的授權存在 localStorage，依房間分開（協定規格 5.1）。連同配對時的信令網址一起存：
 * 網址帶了不同的信令時不自動送出授權（審查 S5：任何人都能拿公開桌牌上的房間編號配上自己的信令做成連結）。
 */
export const credentialStorageKey = (namespace, roomId) => `${solutionStorageName(namespace, 'credential')}:${roomId}`;

/** @returns {{ credential: { kind: string, id: string, secret: string }, role: string, station: string | null, label: string, sig?: string } | null} */
export function loadStaffCredential(namespace, roomId) {
    try {
        const value = JSON.parse(localStorage.getItem(credentialStorageKey(namespace, roomId)) ?? 'null');
        return value?.credential?.id && value.credential.secret ? value : null;
    } catch {
        return null;
    }
}

export function saveStaffCredential(namespace, roomId, { credential, role, station = null, label = '', sig }) {
    localStorage.setItem(credentialStorageKey(namespace, roomId), JSON.stringify({ credential, role, station, label, sig }));
}

export function clearStaffCredential(namespace, roomId) {
    localStorage.removeItem(credentialStorageKey(namespace, roomId));
}

/** 顧客的入桌授權：一支手機同一個房間只記一份（最後加入的那張桌）；連同入桌時的信令網址一起存 */
export const tableCredentialStorageKey = (namespace, roomId) => `${solutionStorageName(namespace, 'table')}:${roomId}`;

/** @returns {{ credential: { kind: string, id: string, secret: string }, tableId: string, diningSessionId: string, sig?: string } | null} */
export function loadTableCredential(namespace, roomId) {
    try {
        const value = JSON.parse(localStorage.getItem(tableCredentialStorageKey(namespace, roomId)) ?? 'null');
        return value?.credential?.id && value.credential.secret && value.tableId ? value : null;
    } catch {
        return null;
    }
}

export function saveTableCredential(namespace, roomId, value) {
    localStorage.setItem(tableCredentialStorageKey(namespace, roomId), JSON.stringify(value));
}

export function clearTableCredential(namespace, roomId) {
    localStorage.removeItem(tableCredentialStorageKey(namespace, roomId));
}

/** 訂單查詢授權（櫃檯交接的訂單 QR Code），最多保留 50 筆 */
export const watchStorageKey = (namespace, roomId) => `${solutionStorageName(namespace, 'watches')}:${roomId}`;
const MAX_WATCHES = 50;

/** @returns {Array<{ orderId: string, token: string }>} */
export function loadWatches(namespace, roomId) {
    try {
        const list = JSON.parse(localStorage.getItem(watchStorageKey(namespace, roomId)) ?? '[]');
        return Array.isArray(list) ? list.filter((w) => typeof w?.orderId === 'string' && typeof w.token === 'string').slice(-MAX_WATCHES) : [];
    } catch {
        return [];
    }
}

export function saveWatch(namespace, roomId, watch) {
    const list = loadWatches(namespace, roomId).filter((w) => w.orderId !== watch.orderId);
    list.push({ orderId: watch.orderId, token: watch.token });
    localStorage.setItem(watchStorageKey(namespace, roomId), JSON.stringify(list.slice(-MAX_WATCHES)));
}

export function removeWatches(namespace, roomId, orderIds) {
    const drop = new Set(orderIds);
    localStorage.setItem(watchStorageKey(namespace, roomId), JSON.stringify(loadWatches(namespace, roomId).filter((w) => !drop.has(w.orderId))));
}

/**
 * 待確認的送單（協定規格 7）：送出前存起來，收到成功或明確失敗的回覆才刪除；重連後以原 requestId 重送。
 * 同一個瀏覽器可能同時是店員裝置與顧客（測試時），以 `kind` 區分。
 */
export const pendingStorageKey = (namespace, roomId) => `${solutionStorageName(namespace, 'pending')}:${roomId}`;

/** @returns {Array<{ requestId: string, items: Array<{ productId: string, qty: number }>, createdAt: number, kind: string, credentialId: string | null }>} */
export function loadPending(namespace, roomId, kind) {
    try {
        const list = JSON.parse(localStorage.getItem(pendingStorageKey(namespace, roomId)) ?? '[]');
        return Array.isArray(list) ? list.filter((p) => typeof p?.requestId === 'string' && Array.isArray(p.items) && (!kind || p.kind === kind)) : [];
    } catch {
        return [];
    }
}

export function addPending(namespace, roomId, entry) {
    const list = loadPending(namespace, roomId).filter((p) => !(p.requestId === entry.requestId && p.kind === entry.kind));
    list.push(entry);
    localStorage.setItem(pendingStorageKey(namespace, roomId), JSON.stringify(list));
}

export function removePending(namespace, roomId, kind, requestId) {
    const list = loadPending(namespace, roomId).filter((p) => !(p.requestId === requestId && p.kind === kind));
    if (list.length) localStorage.setItem(pendingStorageKey(namespace, roomId), JSON.stringify(list));
    else localStorage.removeItem(pendingStorageKey(namespace, roomId));
}

/** 遠端裝置需要的瀏覽器能力 */
export const remoteSupported = () => typeof RTCPeerConnection === 'function' && typeof WebSocket === 'function' && typeof localStorage !== 'undefined';

/**
 * 到主機的一條連線：信令 → WebRTC → RPC。DataChannel 斷線或心跳判定主機失聯時自動重連，
 * 每次重新開啟都觸發 `open`，呼叫端在那裡重新 `auth`。
 */
export class PosV2Remote extends BaseService {
    /**
     * @param {{ sig: string, roomId: string, SignalingClientImpl?: typeof SignalingClient, PeerLinkImpl?: typeof PeerLink, linkOptions?: object }} options
     */
    constructor({ sig, roomId, SignalingClientImpl = SignalingClient, PeerLinkImpl = PeerLink, linkOptions = {} }) {
        super();
        this.signaling = new SignalingClientImpl({ url: sig, roomId, role: 'peer' });
        this.link = new PeerLinkImpl({ signaling: this.signaling, ...linkOptions });
        this.rpc = null;
        /** @type {{ state: string, reason?: string, needTurn?: boolean }} */
        this.linkState = { state: LINK_STATE.IDLE };
        this._offs = [];
        this._disposed = false;
    }

    get isOpen() {
        return this.rpc !== null && !this.rpc.closed;
    }

    start() {
        const link = this.link;
        this._offs.push(
            link.on('state', (detail) => {
                this.linkState = detail;
                this.emit('state', detail);
            }),
            link.on('open', ({ channel }) => this._attach(channel)),
            link.on('closed', () => this._dropRpc()),
        );
        link.start();
    }

    _attach(channel) {
        this._dropRpc();
        const rpc = new PosV2RpcClient({ channel });
        this.rpc = rpc;
        rpc.on('push', (detail) => this.emit('push', detail));
        rpc.on('gap', (detail) => this.emit('gap', detail));
        // 心跳判定主機失聯：DataChannel 的 close 可能很久才來，主動要求連線層重連
        rpc.on('closed', () => {
            if (this.rpc !== rpc) return;
            this.rpc = null;
            this.link.reconnect();
        });
        this.emit('open', { rpc });
    }

    _dropRpc() {
        const rpc = this.rpc;
        this.rpc = null;
        rpc?.close();
    }

    /**
     * @param {string} method
     * @param {object} [params]
     */
    request(method, params) {
        if (!this.rpc) return Promise.reject(new PosError(PEER_ERROR_CODES.HOST_UNAVAILABLE, '還沒有連上主機'));
        return this.rpc.request(method, params);
    }

    /** 直連失敗後使用者按下重試 */
    retry() {
        this.link.retry();
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        for (const off of this._offs) off();
        this._offs = [];
        this._dropRpc();
        this.link.stop();
    }
}
