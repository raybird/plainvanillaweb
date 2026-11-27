/**
 * POS v2 信令 client（#16）：連上自架的信令伺服器（server/signaling.mjs 或 Cloudflare Worker 版），
 * 交換 WebRTC 握手訊息。協定見 docs/superpowers/plans/2026-11-26-pos-v2-protocol.md 第 3 節。
 *
 * - 斷線後依 1、2、4、8、16、30 秒退避重連，之後固定 30 秒；`retryNow()` 立即重試。
 * - 4001（房間已被其他主機使用）與 4002（被較新的主機分頁取代）不重連，狀態停在 rejected／replaced。
 * - 每 20 秒送 `{"t":"ping"}`；45 秒沒收到任何訊息就視為斷線並重連。
 * - 未連線時 `sendSignal()` 回傳 false 並發出 `send-failed`，不排隊。
 *
 * 事件（`on(type, cb)`）：`state` 以及伺服器訊息的型別：`welcome`、`host-ready`、`config`、`signal`、
 * `peer-joined`、`peer-left`、`host-online`、`host-offline`、`host-replaced`，伺服器的 `error` 訊息改名為 `server-error`。
 */
import { BaseService } from '../../../../lib/base-service.js';

export const SIGNALING_STATE = Object.freeze({
    IDLE: 'idle',
    CONNECTING: 'connecting',
    OPEN: 'open',
    RECONNECTING: 'reconnecting',
    REJECTED: 'rejected',
    REPLACED: 'replaced',
    CLOSED: 'closed',
});

export const SIGNALING_CLOSE = Object.freeze({
    HOST_REJECTED: 4001,
    HOST_REPLACED: 4002,
    RATE_LIMITED: 4008,
    ROOM_FULL: 4009,
});

export const RECONNECT_DELAYS_MS = Object.freeze([1000, 2000, 4000, 8000, 16000, 30000]);

const SERVER_EVENTS = new Set(['welcome', 'host-ready', 'config', 'signal', 'peer-joined', 'peer-left', 'host-online', 'host-offline', 'host-replaced']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * 把使用者輸入的信令網址整理成 `wss://host[/path]`。
 * `https://` 轉成 `wss://`、`http://` 轉成 `ws://`，沒有 scheme 時補 `wss://`。
 * 頁面在 https 下時，只有 localhost 可以用 `ws://`（其他會被瀏覽器當成混合內容擋下）。
 * @param {string} input
 * @param {{ pageProtocol?: string }} [options]
 * @returns {string}
 */
export function normalizeSignalingUrl(input, { pageProtocol = globalThis.location?.protocol ?? 'https:' } = {}) {
    let value = String(input ?? '').trim();
    if (!value) throw new TypeError('請輸入信令網址');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `wss://${value}`;
    value = value.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new TypeError('信令網址格式不正確');
    }
    if (url.protocol !== 'wss:' && url.protocol !== 'ws:') throw new TypeError('信令網址必須是 wss:// 或 https://');
    if (url.username || url.password || url.search || url.hash) throw new TypeError('信令網址不能包含帳號、查詢參數或 #');
    if (url.protocol === 'ws:' && pageProtocol === 'https:' && !LOOPBACK_HOSTS.has(url.hostname)) {
        throw new TypeError('https 頁面只能連 wss://（localhost 例外）');
    }
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * @param {string} sig normalizeSignalingUrl 的結果
 * @param {string} roomId
 * @param {'host' | 'peer'} role
 */
export function signalingEndpoint(sig, roomId, role) {
    return `${sig}/v1/rooms/${encodeURIComponent(roomId)}?role=${role}`;
}

/** 第 n 次（從 0 起算）重連前要等多久 */
export function reconnectDelay(attempt, delays = RECONNECT_DELAYS_MS) {
    return delays[Math.min(attempt, delays.length - 1)];
}

export class SignalingClient extends BaseService {
    /**
     * @param {{
     *   url: string, roomId: string, role: 'host' | 'peer', hostSecret?: string, hostInstance?: string,
     *   WebSocketImpl?: typeof WebSocket, timers?: { setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function },
     *   now?: () => number, delays?: readonly number[], keepaliveMs?: number, staleMs?: number,
     * }} options
     */
    constructor({
        url,
        roomId,
        role,
        hostSecret,
        hostInstance,
        WebSocketImpl = globalThis.WebSocket,
        timers = globalThis,
        now = () => Date.now(),
        delays = RECONNECT_DELAYS_MS,
        keepaliveMs = 20_000,
        staleMs = 45_000,
    }) {
        super();
        if (role !== 'host' && role !== 'peer') throw new TypeError(`role 必須是 host 或 peer：${role}`);
        if (role === 'host' && !hostSecret) throw new TypeError('主機需要 hostSecret');
        this.endpoint = signalingEndpoint(url, roomId, role);
        this.role = role;
        this._hostSecret = hostSecret;
        /** 主機頁這次載入的執行個體 id：信令重連時不變，peer 據此知道直連仍然有效 */
        this._hostInstance = hostInstance;
        this._WebSocket = WebSocketImpl;
        this._timers = timers;
        this._now = now;
        this._delays = delays;
        this._keepaliveMs = keepaliveMs;
        this._staleMs = staleMs;
        this._state = SIGNALING_STATE.IDLE;
        this._socket = null;
        this._attempt = 0;
        this._retryTimer = null;
        this._keepaliveTimer = null;
        this._lastMessageAt = 0;
        /** peer：伺服器指定的 peerId；主機：null */
        this.peerId = null;
        /** 伺服器提供的 RTCIceServer 清單 */
        this.iceServers = [];
    }

    get state() {
        return this._state;
    }

    /** 已連上且（主機）已取得主機席位 */
    get isOpen() {
        return this._state === SIGNALING_STATE.OPEN;
    }

    connect() {
        if (this._socket || this._state === SIGNALING_STATE.OPEN || this._state === SIGNALING_STATE.CONNECTING) return;
        this._clearRetry();
        this._setState(SIGNALING_STATE.CONNECTING, { attempt: this._attempt });
        let socket;
        try {
            socket = new this._WebSocket(this.endpoint);
        } catch (err) {
            this._scheduleReconnect({ code: 0, reason: err?.message ?? String(err) });
            return;
        }
        this._socket = socket;
        let opened = false;
        socket.addEventListener('open', () => {
            if (this._socket !== socket) return;
            opened = true;
            this._lastMessageAt = this._now();
            if (this.role === 'host') socket.send(JSON.stringify({ t: 'host-auth', secret: this._hostSecret, ...(this._hostInstance ? { instance: this._hostInstance } : {}) }));
            this._startKeepalive();
        });
        socket.addEventListener('message', (event) => {
            if (this._socket === socket) this._onMessage(event.data);
        });
        socket.addEventListener('close', (event) => {
            if (this._socket === socket) this._onClose(event.code, event.reason);
        });
        // 開啟後的 error 一定接著 close，交給 close 處理。連線失敗時瀏覽器也會再發 close，
        // 但 Node 22 的 WebSocket（undici）只發 error、readyState 停在 CONNECTING，所以在這裡直接當成關閉；
        // 之後才到的 close 因為已經不是目前的 socket 而被略過
        socket.addEventListener('error', () => {
            if (opened || this._socket !== socket) return;
            this._socket = null;
            try {
                socket.close();
            } catch {
                // 尚未連上
            }
            this._onClose(1006, 'connect failed');
        });
    }

    /** 主動停止，不再重連 */
    close() {
        this._clearRetry();
        this._stopKeepalive();
        const socket = this._socket;
        this._socket = null;
        if (socket) {
            try {
                socket.close(1000, 'client closed');
            } catch {
                // 已關閉
            }
        }
        this._setState(SIGNALING_STATE.CLOSED);
    }

    /** 等待重連中時立即重試（例如收到 host-online 或使用者按下重試） */
    retryNow() {
        if (this._state !== SIGNALING_STATE.RECONNECTING) return;
        this._clearRetry();
        this.connect();
    }

    /**
     * 送出握手訊息。peer 一律送給主機（`to` 會被忽略）；主機必須指定 `to`。
     * @param {object} data
     * @param {string} [to]
     * @returns {boolean} 是否已交給 WebSocket
     */
    sendSignal(data, to) {
        if (!this.isOpen || !this._socket) {
            this.emit('send-failed', { reason: 'not-open', state: this._state, data, to });
            return false;
        }
        if (this.role === 'host' && typeof to !== 'string') throw new TypeError('主機送出 signal 時必須指定 to');
        const message = this.role === 'host' ? { t: 'signal', to, data } : { t: 'signal', data };
        try {
            this._socket.send(JSON.stringify(message));
            return true;
        } catch (err) {
            this.emit('send-failed', { reason: 'send-error', error: err, data, to });
            return false;
        }
    }

    _onMessage(raw) {
        this._lastMessageAt = this._now();
        let message;
        try {
            message = JSON.parse(raw);
        } catch {
            return;
        }
        if (!message || typeof message !== 'object' || typeof message.t !== 'string') return;
        if (message.t === 'pong') return;
        if (message.t === 'welcome') {
            this.peerId = typeof message.peerId === 'string' ? message.peerId : null;
            if (Array.isArray(message.iceServers)) this.iceServers = message.iceServers;
            this._opened();
        } else if (message.t === 'host-ready') {
            this._opened();
        } else if (message.t === 'config' && Array.isArray(message.iceServers)) {
            this.iceServers = message.iceServers;
        }
        if (message.t === 'error') this.emit('server-error', message);
        else if (SERVER_EVENTS.has(message.t)) this.emit(message.t, message);
    }

    _opened() {
        this._attempt = 0;
        this._setState(SIGNALING_STATE.OPEN);
    }

    _onClose(code, reason) {
        this._socket = null;
        this._stopKeepalive();
        if (this._state === SIGNALING_STATE.CLOSED) return;
        if (code === SIGNALING_CLOSE.HOST_REJECTED && this.role === 'host') {
            this._setState(SIGNALING_STATE.REJECTED, { code, reason });
            return;
        }
        if (code === SIGNALING_CLOSE.HOST_REPLACED) {
            this._setState(SIGNALING_STATE.REPLACED, { code, reason });
            return;
        }
        this._scheduleReconnect({ code, reason });
    }

    _scheduleReconnect({ code, reason }) {
        this._socket = null;
        const delayMs = reconnectDelay(this._attempt, this._delays);
        this._attempt += 1;
        this._setState(SIGNALING_STATE.RECONNECTING, { code, reason, attempt: this._attempt, delayMs });
        this._retryTimer = this._timers.setTimeout(() => {
            this._retryTimer = null;
            this.connect();
        }, delayMs);
    }

    _startKeepalive() {
        this._stopKeepalive();
        this._keepaliveTimer = this._timers.setInterval(() => {
            const socket = this._socket;
            if (!socket) return;
            if (this._now() - this._lastMessageAt > this._staleMs) {
                // 連線看似還在但已收不到訊息（例如手機切到背景後網路被切斷）：當成斷線處理
                this._socket = null;
                try {
                    socket.close(4000, 'stale');
                } catch {
                    // 已關閉
                }
                this._onClose(1006, 'stale');
                return;
            }
            try {
                socket.send('{"t":"ping"}');
            } catch {
                // close 事件會處理
            }
        }, this._keepaliveMs);
    }

    _stopKeepalive() {
        if (this._keepaliveTimer !== null) this._timers.clearInterval(this._keepaliveTimer);
        this._keepaliveTimer = null;
    }

    _clearRetry() {
        if (this._retryTimer !== null) this._timers.clearTimeout(this._retryTimer);
        this._retryTimer = null;
    }

    _setState(state, detail = {}) {
        if (this._state === state && state !== SIGNALING_STATE.RECONNECTING) return;
        this._state = state;
        this.emit('state', { state, ...detail });
    }
}
