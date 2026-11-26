/**
 * POS v2 DataChannel 訊息信封（#16，協定規格 6.1）：編碼與安全解析。主機與 peer 共用，只有純函式。
 */
import { POS_V2_ERROR_CODES } from './pos-v2-model.js';

export const WIRE_VERSION = 1;
export const DATA_CHANNEL_LABEL = 'pos-v2';
export const MAX_MESSAGE_BYTES = 64 * 1024;
/** 同一條連線累計這麼多則不合格訊息後關閉 */
export const BAD_MESSAGE_LIMIT = 20;
/** bufferedAmount 超過這個值就暫停推送，降到 LOW 以下再送一份最新快照 */
export const BUFFER_HIGH_BYTES = 1024 * 1024;
export const BUFFER_LOW_BYTES = 256 * 1024;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const TYPES = new Set(['req', 'res', 'push', 'ping', 'pong']);
const encoder = new TextEncoder();

/** 字串的 UTF-8 位元組數 */
export const byteLength = (text) => encoder.encode(text).length;

/**
 * 解析一則訊息。不合格時回傳 `{ ok: false, id }`：有 `id` 的要回 BAD_MESSAGE，沒有的直接丟棄。
 * @param {unknown} raw DataChannel 收到的資料
 * @returns {{ ok: true, message: object } | { ok: false, id: string | null, reason: string }}
 */
export function parseMessage(raw) {
    if (typeof raw !== 'string') return { ok: false, id: null, reason: 'not-text' };
    if (raw.length > MAX_MESSAGE_BYTES || byteLength(raw) > MAX_MESSAGE_BYTES) return { ok: false, id: null, reason: 'too-large' };
    let message;
    try {
        message = JSON.parse(raw, (key, value) => (FORBIDDEN_KEYS.has(key) ? undefined : value));
    } catch {
        return { ok: false, id: null, reason: 'not-json' };
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return { ok: false, id: null, reason: 'not-object' };
    const id = typeof message.id === 'string' && message.id.length <= 64 ? message.id : null;
    const fail = (reason) => ({ ok: false, id, reason });
    if (message.v !== WIRE_VERSION) return fail('version');
    if (!TYPES.has(message.type)) return fail('type');
    switch (message.type) {
        case 'req':
            if (!id || typeof message.method !== 'string' || !message.method) return fail('req');
            if (message.params !== undefined && (typeof message.params !== 'object' || message.params === null || Array.isArray(message.params))) return fail('params');
            break;
        case 'res':
            if (!id || typeof message.ok !== 'boolean') return fail('res');
            if (!message.ok && (typeof message.error !== 'object' || message.error === null || typeof message.error.code !== 'string')) return fail('error');
            break;
        case 'push':
            if (typeof message.topic !== 'string' || !Number.isInteger(message.rev)) return fail('push');
            break;
        default:
            if (typeof message.ts !== 'number') return fail('ping');
    }
    return { ok: true, message };
}

export const request = (id, method, params = {}) => ({ v: WIRE_VERSION, type: 'req', id, method, params });
export const result = (id, value) => ({ v: WIRE_VERSION, type: 'res', id, ok: true, result: value ?? null });
export const push = (topic, rev, data) => ({ v: WIRE_VERSION, type: 'push', topic, rev, data });
export const ping = (ts) => ({ v: WIRE_VERSION, type: 'ping', ts });
export const pong = (ts) => ({ v: WIRE_VERSION, type: 'pong', ts });

/**
 * 錯誤回覆。PosError 帶出錯誤碼與訊息，其他錯誤一律包成 INTERNAL，不把內部細節送給遠端。
 * `retryAfterMs`（嘗試次數限制）會一起送出。
 */
export function failure(id, err) {
    const known = typeof err?.code === 'string' && err.name === 'PosError';
    const error = known
        ? { code: err.code, message: err.message }
        : { code: 'INTERNAL', message: '主機處理請求時發生錯誤' };
    if (known && Number.isFinite(err.retryAfterMs)) error.retryAfterMs = err.retryAfterMs;
    return { v: WIRE_VERSION, type: 'res', id, ok: false, error };
}

export const badMessage = (id) => ({ v: WIRE_VERSION, type: 'res', id, ok: false, error: { code: POS_V2_ERROR_CODES.BAD_MESSAGE, message: '不合格的訊息' } });

/** 序列化；超過上限時拋錯（呼叫端的 bug，不該送出） */
export function encode(message) {
    const text = JSON.stringify(message);
    if (byteLength(text) > MAX_MESSAGE_BYTES) throw new RangeError(`訊息超過 ${MAX_MESSAGE_BYTES} bytes：${message.type} ${message.method ?? message.topic ?? ''}`);
    return text;
}
