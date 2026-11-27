/**
 * POS v2 peer 端的 RPC（#16，協定規格 6.1、6.4）：在一條 DataChannel 上送請求、收推送、回心跳。
 * 和 hub 一樣只認得「類 DataChannel」的物件，可以在 Node 以記憶體通道測試。
 *
 * - `request(method, params)` 回傳結果；主機回錯誤時以 PosError 拒絕（帶 `retryAfterMs`），
 *   逾時或通道關閉時以 `HOST_UNAVAILABLE` 拒絕。
 * - 事件：`push`（{ topic, rev, data }）、`gap`（rev 跳號，呼叫端應 `sync`）、`closed`（通道關閉或主機失聯）。
 */
import { BaseService } from '../../../../lib/base-service.js';
import { LIMITS, PosError } from './pos-v2-model.js';
import { encode, parseMessage, pong, request } from './pos-v2-wire.js';

/** 只在 peer 端產生、不經過網路的錯誤碼（協定規格 6.5） */
export const PEER_ERROR_CODES = Object.freeze({
    HOST_UNAVAILABLE: 'HOST_UNAVAILABLE',
    /** 送單已送出但沒有收到回覆：保留在本機，重連後以同一個 requestId 重送 */
    PENDING: 'PENDING',
});

export class PosV2RpcClient extends BaseService {
    /**
     * @param {{
     *   channel: object, timers?: { setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function },
     *   now?: () => number, generateId?: () => string, requestTimeoutMs?: number, hostTimeoutMs?: number,
     * }} options
     */
    constructor({
        channel,
        timers = globalThis,
        now = () => Date.now(),
        generateId = () => crypto.randomUUID(),
        requestTimeoutMs = 10_000,
        hostTimeoutMs = LIMITS.PEER_TIMEOUT_MS,
    }) {
        super();
        this.channel = channel;
        this._timers = timers;
        this._now = now;
        this._generateId = generateId;
        this._requestTimeoutMs = requestTimeoutMs;
        this._hostTimeoutMs = hostTimeoutMs;
        /** @type {Map<string, { resolve: Function, reject: Function, timer: unknown }>} */
        this._pending = new Map();
        this.lastRev = 0;
        this.lastSeenAt = now();
        this.closed = false;
        this._onMessage = (event) => this._receive(event.data);
        this._onClose = () => this._shutdown('channel closed');
        channel.addEventListener('message', this._onMessage);
        channel.addEventListener('close', this._onClose);
        // 主機每 5 秒送 ping；超過 hostTimeoutMs 沒收到任何訊息就視為主機失聯
        this._watchdog = timers.setInterval(() => {
            if (this._now() - this.lastSeenAt > this._hostTimeoutMs) this._shutdown('host timeout');
        }, Math.max(250, Math.floor(hostTimeoutMs / 5)));
    }

    /**
     * @param {string} method
     * @param {object} [params]
     * @returns {Promise<any>}
     */
    request(method, params = {}) {
        if (this.closed) return Promise.reject(new PosError(PEER_ERROR_CODES.HOST_UNAVAILABLE, '和主機的連線已中斷'));
        const id = this._generateId();
        return new Promise((resolve, reject) => {
            const timer = this._timers.setTimeout(() => {
                this._pending.delete(id);
                reject(new PosError(PEER_ERROR_CODES.HOST_UNAVAILABLE, '主機沒有回應'));
            }, this._requestTimeoutMs);
            this._pending.set(id, { resolve, reject, timer });
            try {
                this.channel.send(encode(request(id, method, params)));
            } catch (err) {
                this._timers.clearTimeout(timer);
                this._pending.delete(id);
                reject(err instanceof RangeError ? err : new PosError(PEER_ERROR_CODES.HOST_UNAVAILABLE, '和主機的連線已中斷'));
            }
        });
    }

    _receive(raw) {
        this.lastSeenAt = this._now();
        const parsed = parseMessage(raw);
        if (!parsed.ok) return;
        const { message } = parsed;
        if (message.type === 'ping') {
            this._sendQuietly(pong(message.ts));
        } else if (message.type === 'res') {
            const pending = this._pending.get(message.id);
            if (!pending) return;
            this._pending.delete(message.id);
            this._timers.clearTimeout(pending.timer);
            if (message.ok) {
                pending.resolve(message.result);
            } else {
                const error = new PosError(message.error.code, message.error.message ?? message.error.code);
                if (Number.isFinite(message.error.retryAfterMs)) error.retryAfterMs = message.error.retryAfterMs;
                pending.reject(error);
            }
        } else if (message.type === 'push') {
            // 同一次推送的多個 topic 共用 rev；跳過了某次推送（主機背壓或訊息遺失）才算跳號
            if (this.lastRev && message.rev > this.lastRev + 1) this.emit('gap', { from: this.lastRev, to: message.rev });
            if (message.rev > this.lastRev) this.lastRev = message.rev;
            this.emit('push', { topic: message.topic, rev: message.rev, data: message.data });
        }
    }

    _sendQuietly(message) {
        try {
            this.channel.send(encode(message));
        } catch {
            // close 事件會處理
        }
    }

    _shutdown(reason) {
        if (this.closed) return;
        this.closed = true;
        this._timers.clearInterval(this._watchdog);
        this.channel.removeEventListener('message', this._onMessage);
        this.channel.removeEventListener('close', this._onClose);
        try {
            this.channel.close();
        } catch {
            // 已關閉
        }
        for (const { reject, timer } of this._pending.values()) {
            this._timers.clearTimeout(timer);
            reject(new PosError(PEER_ERROR_CODES.HOST_UNAVAILABLE, '和主機的連線已中斷'));
        }
        this._pending.clear();
        this.emit('closed', { reason });
    }

    /** 主動關閉 */
    close() {
        this._shutdown('closed by client');
    }
}
