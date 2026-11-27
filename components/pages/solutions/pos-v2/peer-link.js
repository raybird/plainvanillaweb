/**
 * POS v2 的 WebRTC 連線層（#16，協定規格第 4 節）：經由信令交換 SDP／ICE，建立 DataChannel `pos-v2`。
 *
 * - 一律由 peer 發起 offer，主機只回應；採用 trickle ICE。
 * - `HostLinks`：主機端，每個 peer 一個 RTCPeerConnection；DataChannel 開啟後發出 `channel` 事件交給 hub。
 * - `PeerLink`：peer 端。送出 offer 後 15 秒內沒有開啟、或 ICE 失敗，狀態變成 `failed`（畫面提示可能需要 TURN），
 *   不自動無限重試，由使用者 `retry()`；已開啟的 DataChannel 斷線時依退避重連，收到 `host-online` 立即重試。
 */
import { BaseService } from '../../../../lib/base-service.js';
import { RECONNECT_DELAYS_MS, SIGNALING_STATE, reconnectDelay } from './signaling-client.js';
import { DATA_CHANNEL_LABEL } from './pos-v2-wire.js';

export const CONNECT_TIMEOUT_MS = 15_000;

/** 把 ICE candidate 送上信令前轉成純物件 */
const candidateJson = (candidate) => (candidate ? (typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate) : null);

/**
 * 收到遠端描述之前抵達的 candidate 先排隊，設定完遠端描述再加入。
 */
class CandidateQueue {
    constructor(pc) {
        this.pc = pc;
        this.ready = false;
        this.queue = [];
    }
    async add(candidate) {
        if (!candidate) return; // null 表示對方收集完成；不需要特別處理
        if (!this.ready) {
            this.queue.push(candidate);
            return;
        }
        try {
            await this.pc.addIceCandidate(candidate);
        } catch {
            // 過期或不相容的 candidate：忽略，ICE 會用其他 candidate
        }
    }
    async flush() {
        this.ready = true;
        const queued = this.queue;
        this.queue = [];
        for (const candidate of queued) await this.add(candidate);
    }
}

export class HostLinks extends BaseService {
    /**
     * @param {{ signaling: import('./signaling-client.js').SignalingClient, RTCPeerConnectionImpl?: typeof RTCPeerConnection }} options
     */
    constructor({ signaling, RTCPeerConnectionImpl = globalThis.RTCPeerConnection }) {
        super();
        this.signaling = signaling;
        this._RTCPeerConnection = RTCPeerConnectionImpl;
        /** @type {Map<string, { pc: RTCPeerConnection, candidates: CandidateQueue, open: boolean }>} */
        this._links = new Map();
        this._offs = [
            signaling.on('signal', ({ from, data }) => this._onSignal(from, data)),
            // 裝置的信令斷線（例如手機切到背景再回來）不代表直連斷了：只放棄還在握手的連線，
            // 已開啟的直連交給 DataChannel 的 close 與心跳逾時（ADR 0109 決策 3、審查 S8）
            signaling.on('peer-left', ({ peerId }) => {
                if (!this._links.get(peerId)?.open) this.close(peerId);
            }),
        ];
    }

    get size() {
        return this._links.size;
    }

    async _onSignal(peerId, data) {
        if (!peerId || peerId === 'host' || !data || typeof data !== 'object') return;
        // 記下處理的是哪一條：await 期間同一個 peer 可能已經重新發起，失敗時只關這一條，不關較新的（審查 N1）
        let link = this._links.get(peerId);
        try {
            if (data.kind === 'offer' && typeof data.sdp === 'string') {
                link = null;
                await this._answer(peerId, data.sdp, (created) => { link = created; });
            } else if (data.kind === 'candidate') await link?.candidates.add(data.candidate);
            else if (data.kind === 'restart') this.close(peerId);
        } catch (err) {
            console.warn('[pos-v2] 處理 WebRTC 握手失敗', peerId, err);
            if (link && this._links.get(peerId) === link) this.close(peerId);
        }
    }

    async _answer(peerId, sdp, onCreated) {
        // 同一個 peer 重新發起：放棄舊的 PeerConnection
        this.close(peerId);
        const pc = new this._RTCPeerConnection({ iceServers: this.signaling.iceServers });
        const link = { pc, candidates: new CandidateQueue(pc), open: false };
        this._links.set(peerId, link);
        onCreated?.(link);
        pc.addEventListener('icecandidate', (event) => {
            this.signaling.sendSignal({ kind: 'candidate', candidate: candidateJson(event.candidate) }, peerId);
        });
        pc.addEventListener('datachannel', ({ channel }) => {
            if (channel.label !== DATA_CHANNEL_LABEL) {
                channel.close();
                return;
            }
            const opened = () => {
                if (this._links.get(peerId) !== link) return;
                link.open = true;
                this.emit('channel', { peerId, channel });
            };
            if (channel.readyState === 'open') opened();
            else channel.addEventListener('open', opened, { once: true });
        });
        pc.addEventListener('connectionstatechange', () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                if (this._links.get(peerId) === link) this.close(peerId);
            }
        });
        await pc.setRemoteDescription({ type: 'offer', sdp });
        await link.candidates.flush();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (this._links.get(peerId) !== link) return;
        this.signaling.sendSignal({ kind: 'answer', sdp: pc.localDescription.sdp }, peerId);
    }

    close(peerId) {
        const link = this._links.get(peerId);
        if (!link) return;
        this._links.delete(peerId);
        try {
            link.pc.close();
        } catch {
            // 已關閉
        }
    }

    dispose() {
        for (const off of this._offs) off();
        for (const peerId of [...this._links.keys()]) this.close(peerId);
    }
}

/** peer 端連線狀態 */
export const LINK_STATE = Object.freeze({
    IDLE: 'idle',
    /** 信令連線中，或已連上但主機不在線 */
    SIGNALING: 'signaling',
    WAITING_HOST: 'waiting-host',
    CONNECTING: 'connecting',
    OPEN: 'open',
    /** 斷線後等待重連 */
    RETRYING: 'retrying',
    /** 直連失敗（可能需要 TURN）；不自動重試 */
    FAILED: 'failed',
    /** 信令被拒或停止 */
    STOPPED: 'stopped',
});

export class PeerLink extends BaseService {
    /**
     * @param {{
     *   signaling: import('./signaling-client.js').SignalingClient, RTCPeerConnectionImpl?: typeof RTCPeerConnection,
     *   timers?: { setTimeout: Function, clearTimeout: Function }, connectTimeoutMs?: number, delays?: readonly number[],
     * }} options
     */
    constructor({ signaling, RTCPeerConnectionImpl = globalThis.RTCPeerConnection, timers = globalThis, connectTimeoutMs = CONNECT_TIMEOUT_MS, delays = RECONNECT_DELAYS_MS }) {
        super();
        this.signaling = signaling;
        this._RTCPeerConnection = RTCPeerConnectionImpl;
        this._timers = timers;
        this._connectTimeoutMs = connectTimeoutMs;
        this._delays = delays;
        this._state = LINK_STATE.IDLE;
        this._attempt = 0;
        this._current = null;
        this._retryTimer = null;
        this._hostOnline = false;
        /** 最近一次知道的主機執行個體 id */
        this._hostInstance = null;
        this.channel = null;
        this._offs = [];
    }

    get state() {
        return this._state;
    }

    start() {
        if (this._offs.length) return;
        const s = this.signaling;
        this._offs = [
            s.on('welcome', ({ hostOnline, hostInstance }) => {
                this._hostOnline = Boolean(hostOnline);
                const instanceChanged = this._instanceChanged(hostInstance);
                // DataChannel 建立後不再依賴信令：信令重連時不要丟掉仍然正常的直連。
                // 握手中則要重來：信令重連後 peerId 換了，主機的 answer 會送到舊的 id
                if (this._state === LINK_STATE.OPEN) {
                    if (instanceChanged) this._restartOpenLink();
                    return;
                }
                if (this._hostOnline) this._connectNow();
                else this._setState(LINK_STATE.WAITING_HOST);
            }),
            s.on('host-online', ({ instance }) => {
                this._hostOnline = true;
                const instanceChanged = this._instanceChanged(instance);
                // 直連還開著：主機只是信令重連時，直連照常可用，不要拆掉（ADR 0109 決策 3）；
                // 主機換了執行個體（主機分頁重新整理）時舊的直連已經沒有對象，不等心跳逾時，立即重連（協定規格 7）
                if (this._state === LINK_STATE.OPEN) {
                    if (instanceChanged) this._restartOpenLink();
                    return;
                }
                // 收到 host-online 立即重試：等待中、退避中或上一次已失敗都一樣（協定規格 4.4）
                if (this._state !== LINK_STATE.CONNECTING) this._connectNow();
            }),
            s.on('host-offline', () => {
                this._hostOnline = false;
                if (this._state === LINK_STATE.CONNECTING) this._abandon('host offline');
                if (this._state !== LINK_STATE.OPEN) this._setState(LINK_STATE.WAITING_HOST);
            }),
            s.on('signal', ({ data }) => this._onSignal(data)),
            s.on('server-error', ({ code }) => {
                if (code === 'HOST_OFFLINE' && this._state === LINK_STATE.CONNECTING) {
                    this._abandon('host offline');
                    this._setState(LINK_STATE.WAITING_HOST);
                }
            }),
            s.on('state', ({ state }) => {
                if (state === SIGNALING_STATE.REJECTED || state === SIGNALING_STATE.REPLACED) this._setState(LINK_STATE.STOPPED);
                else if (state !== SIGNALING_STATE.OPEN && this._state !== LINK_STATE.OPEN && this._state !== LINK_STATE.FAILED) this._setState(LINK_STATE.SIGNALING);
            }),
        ];
        this._setState(LINK_STATE.SIGNALING);
        s.connect();
    }

    /** 使用者按下重試（例如直連失敗後換了網路） */
    retry() {
        this._attempt = 0;
        this.signaling.retryNow();
        if (this.signaling.isOpen && this._hostOnline) this._connectNow();
        else this._setState(this._hostOnline ? LINK_STATE.SIGNALING : LINK_STATE.WAITING_HOST);
    }

    /**
     * 目前的直連已經不能用：丟掉它並依退避重連。DataChannel 關閉時自動呼叫；
     * 上層的心跳判定主機失聯（RPC client 的 `closed`）時也要呼叫，因為對方消失時 close 事件可能很久才來。
     */
    reconnect() {
        if (!this._current?.opened) return;
        this._abandon('reconnect');
        this.emit('closed', {});
        this._scheduleReconnect();
    }

    stop() {
        for (const off of this._offs) off();
        this._offs = [];
        this._clearRetry();
        this._abandon('stopped');
        this.signaling.close();
        this._setState(LINK_STATE.STOPPED);
    }

    _connectNow() {
        this._clearRetry();
        if (!this.signaling.isOpen) return;
        this._abandon('restart');
        this._connect().catch((err) => {
            console.warn('[pos-v2] 建立直連失敗', err);
            this._fail('error');
        });
    }

    async _connect() {
        const pc = new this._RTCPeerConnection({ iceServers: this.signaling.iceServers });
        const channel = pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
        const attempt = { pc, channel, candidates: new CandidateQueue(pc), timer: null, opened: false };
        this._current = attempt;
        this._setState(LINK_STATE.CONNECTING);
        const isCurrent = () => this._current === attempt;

        pc.addEventListener('icecandidate', (event) => {
            if (isCurrent()) this.signaling.sendSignal({ kind: 'candidate', candidate: candidateJson(event.candidate) });
        });
        pc.addEventListener('iceconnectionstatechange', () => {
            if (isCurrent() && !attempt.opened && pc.iceConnectionState === 'failed') this._fail('ice-failed');
        });
        // 對方直接消失（例如主機分頁被關閉）時 DataChannel 不一定立刻觸發 close，以 PeerConnection 的狀態補上
        pc.addEventListener('connectionstatechange', () => {
            if (isCurrent() && attempt.opened && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) this.reconnect();
        });
        channel.addEventListener('open', () => {
            if (!isCurrent()) return;
            attempt.opened = true;
            this._timers.clearTimeout(attempt.timer);
            this._attempt = 0;
            this.channel = channel;
            this._setState(LINK_STATE.OPEN);
            this.emit('open', { channel });
        });
        channel.addEventListener('close', () => {
            if (isCurrent() && attempt.opened) this.reconnect();
        });

        attempt.timer = this._timers.setTimeout(() => {
            if (isCurrent() && !attempt.opened) this._fail('timeout');
        }, this._connectTimeoutMs);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!isCurrent()) return;
        this.signaling.sendSignal({ kind: 'offer', sdp: pc.localDescription.sdp });
    }

    async _onSignal(data) {
        const attempt = this._current;
        if (!attempt || !data || typeof data !== 'object') return;
        try {
            if (data.kind === 'answer' && typeof data.sdp === 'string' && attempt.pc.signalingState === 'have-local-offer') {
                await attempt.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
                await attempt.candidates.flush();
            } else if (data.kind === 'candidate') {
                await attempt.candidates.add(data.candidate);
            }
        } catch (err) {
            console.warn('[pos-v2] 處理主機的握手訊息失敗', err);
        }
    }

    /** 直連失敗：可能需要 TURN。不自動重試 */
    _fail(reason) {
        this._abandon(reason);
        this.signaling.sendSignal({ kind: 'restart' });
        this._setState(LINK_STATE.FAILED, { reason, needTurn: reason === 'timeout' || reason === 'ice-failed' });
    }

    /**
     * 記下主機的執行個體 id，回傳是否換了一個。之前或這次沒有 id（舊版信令伺服器）時不算：
     * 交給 DataChannel 的 close 與心跳判斷。
     */
    _instanceChanged(instance) {
        const previous = this._hostInstance;
        if (typeof instance === 'string' && instance) this._hostInstance = instance;
        return Boolean(previous && instance && instance !== previous);
    }

    _restartOpenLink() {
        this.reconnect();
        this._connectNow();
    }

    _scheduleReconnect() {
        const delayMs = reconnectDelay(this._attempt, this._delays);
        this._attempt += 1;
        this._setState(LINK_STATE.RETRYING, { delayMs, attempt: this._attempt });
        this._retryTimer = this._timers.setTimeout(() => {
            this._retryTimer = null;
            if (this.signaling.isOpen && this._hostOnline) this._connectNow();
            else this._setState(this._hostOnline ? LINK_STATE.SIGNALING : LINK_STATE.WAITING_HOST);
        }, delayMs);
    }

    _abandon() {
        const attempt = this._current;
        if (!attempt) return;
        this._current = null;
        this.channel = null;
        this._timers.clearTimeout(attempt.timer);
        try {
            attempt.channel.close();
        } catch {
            // 已關閉
        }
        try {
            attempt.pc.close();
        } catch {
            // 已關閉
        }
    }

    _clearRetry() {
        if (this._retryTimer !== null) this._timers.clearTimeout(this._retryTimer);
        this._retryTimer = null;
    }

    _setState(state, detail = {}) {
        if (this._state === state && state !== LINK_STATE.RETRYING && state !== LINK_STATE.FAILED) return;
        this._state = state;
        this.emit('state', { state, ...detail });
    }
}
