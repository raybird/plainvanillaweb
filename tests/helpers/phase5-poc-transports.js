/**
 * Phase 5（Issue #7）PoC 專用 Transport Adapter（僅供評估與測試重現，不列入生產核心或協調 SDK 匯出）。
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * 遞迴檢查 JSON 解析後的物件是否包含原型污染鍵或循環結構，防止將遠端不可信文字幀轉為原型鏈污染。
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @returns {boolean}
 */
function isSafeJsonValue(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object') {
        return typeof value !== 'function' && typeof value !== 'symbol';
    }
    if (seen.has(value)) return false;
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                if (!isSafeJsonValue(value[i], seen)) return false;
            }
            return true;
        }
        const ownNames = Object.getOwnPropertyNames(value);
        for (let i = 0; i < ownNames.length; i++) {
            const key = ownNames[i];
            if (FORBIDDEN_KEYS.has(key)) return false;
            if (!isSafeJsonValue(value[key], seen)) return false;
        }
        return true;
    } finally {
        seen.delete(value);
    }
}

function isControlPayload(data) {
    return Boolean(data && typeof data === 'object' && typeof data.__pocControl === 'string');
}

function isSocketOpen(socketLike) {
    if (!socketLike || typeof socketLike.send !== 'function') return false;
    // WebSocket OPEN = 1; RTCDataChannel readyState = 'open'
    return socketLike.readyState === 1 || socketLike.readyState === 'open';
}

/**
 * 將瀏覽器／Node `MessagePort`（例如 `new SharedWorker().port`）適配為 `BroadcastService` `options.transport` 介面。
 * 保留 Structured Clone 語意，並以不可變 `capabilities` 明確揭露 SharedWorker 的行動端與 CDN 限制。
 *
 * @param {{ postMessage: Function, start?: Function, close: Function, onmessage?: Function | null, onmessageerror?: Function | null }} port
 * @param {{ onLeaveNotice?: Function }} [options]
 * @returns {{
 *   postMessage: (msg: any) => void,
 *   close: () => void,
 *   queryHub: (cmd: 'stats' | 'bump') => Promise<any>,
 *   onmessage: ((ev: { data: any }) => void) | null,
 *   onmessageerror: ((ev: any) => void) | null,
 *   capabilities: Readonly<{
 *     kind: string,
 *     scope: string,
 *     serialization: string,
 *     requiresSameOriginScript: boolean,
 *     mobileAndroidChromeSupported: boolean,
 *     survivesSingleTabReload: boolean,
 *     survivesAllTabsClosed: boolean,
 *   }>
 * }}
 */
export function createSharedWorkerPortTransport(port, options = {}) {
    if (!port || typeof port !== 'object' || typeof port.postMessage !== 'function' || typeof port.close !== 'function') {
        throw new TypeError('createSharedWorkerPortTransport requires a MessagePort-compatible object');
    }

    let closed = false;
    let nextReqId = 0;
    const pendingControl = new Map();

    const capabilities = Object.freeze({
        kind: 'shared-worker',
        scope: 'same-origin-tabs',
        serialization: 'structured-clone',
        requiresSameOriginScript: true,
        mobileAndroidChromeSupported: false,
        survivesSingleTabReload: true,
        survivesAllTabsClosed: false,
    });

    const adapter = {
        onmessage: null,
        onmessageerror: null,
        capabilities,
        postMessage(message) {
            if (closed) return;
            port.postMessage(message);
        },
        queryHub(cmd) {
            if (closed) {
                return Promise.reject(new Error('SharedWorker port transport is closed'));
            }
            const reqId = `ctrl-${++nextReqId}`;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pendingControl.delete(reqId);
                    reject(new Error(`SharedWorker control command "${cmd}" timed out`));
                }, 3000);
                pendingControl.set(reqId, { resolve, reject, timer });
                try {
                    port.postMessage({ __pocControl: cmd, reqId });
                } catch (err) {
                    clearTimeout(timer);
                    pendingControl.delete(reqId);
                    reject(err);
                }
            });
        },
        close() {
            if (closed) return;
            closed = true;
            for (const entry of pendingControl.values()) {
                clearTimeout(entry.timer);
                entry.reject(new Error('SharedWorker port transport closed'));
            }
            pendingControl.clear();
            try {
                port.postMessage({ __pocControl: 'leave' });
                options?.onLeaveNotice?.();
            } catch {
                // ignore detached port error on close
            }
            try {
                port.onmessage = null;
                port.onmessageerror = null;
                port.close();
            } catch {
                // ignore
            }
        },
    };

    port.onmessage = (event) => {
        if (closed) return;
        const data = event?.data;
        if (isControlPayload(data)) {
            if (data.__pocControl === 'reply' && data.reqId && pendingControl.has(data.reqId)) {
                const entry = pendingControl.get(data.reqId);
                pendingControl.delete(data.reqId);
                clearTimeout(entry.timer);
                entry.resolve(data.hubState);
            }
            return;
        }
        adapter.onmessage?.({ data });
    };

    port.onmessageerror = (event) => {
        if (closed) return;
        adapter.onmessageerror?.(event);
    };

    port.start?.();
    return adapter;
}

/**
 * 將跨裝置文字雙向傳輸（如 WebSocket 或 `RTCDataChannel`-compatible 物件）適配為 `BroadcastService` `options.transport`。
 * 明確公開 JSON 序列化限制、斷線丟棄計數與缺乏跨裝置 Web Locks 等能力邊界，避免隱藏傳輸差異。
 *
 * @param {{ send: Function, close: Function, readyState: number | string, addEventListener?: Function, removeEventListener?: Function, onmessage?: Function | null, onerror?: Function | null }} socketLike
 * @param {{ kind?: string, onDrop?: (info: { reason: string, message: any }) => void }} [options]
 */
export function createJsonWireTransportAdapter(socketLike, options = {}) {
    if (!socketLike || typeof socketLike !== 'object' || typeof socketLike.send !== 'function' || typeof socketLike.close !== 'function') {
        throw new TypeError('createJsonWireTransportAdapter requires a WebSocket or RTCDataChannel compatible object');
    }

    let closed = false;
    const stats = {
        sent: 0,
        received: 0,
        droppedWhileDisconnected: 0,
        rejectedPayloads: 0,
    };

    const capabilities = Object.freeze({
        kind: options?.kind || 'websocket-relay',
        scope: 'cross-device',
        serialization: 'json',
        supportsStructuredClone: false,
        supportsWebLocks: false,
        requiresExternalAuth: true,
        dropsWhileDisconnected: true,
    });

    const adapter = {
        onmessage: null,
        onmessageerror: null,
        capabilities,
        getStats() {
            return { ...stats };
        },
        postMessage(message) {
            if (closed || !isSocketOpen(socketLike)) {
                stats.droppedWhileDisconnected += 1;
                options?.onDrop?.({ reason: closed ? 'adapter-closed' : 'socket-not-open', message });
                return;
            }
            const raw = JSON.stringify(message);
            socketLike.send(raw);
            stats.sent += 1;
        },
        close() {
            if (closed) return;
            closed = true;
            detachListeners();
            try {
                if (
                    socketLike.readyState === 0 ||
                    socketLike.readyState === 1 ||
                    socketLike.readyState === 'connecting' ||
                    socketLike.readyState === 'open'
                ) {
                    socketLike.close();
                }
            } catch {
                // ignore
            }
        },
    };

    const onWireMessage = (event) => {
        if (closed) return;
        const raw = typeof event?.data === 'string'
            ? event.data
            : globalThis.Buffer?.isBuffer?.(event?.data)
                ? event.data.toString('utf8')
                : null;
        if (raw === null) {
            stats.rejectedPayloads += 1;
            adapter.onmessageerror?.(new TypeError('Unsupported non-text frame on JSON wire transport'));
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            stats.rejectedPayloads += 1;
            adapter.onmessageerror?.(err);
            return;
        }
        if (!isSafeJsonValue(parsed)) {
            stats.rejectedPayloads += 1;
            adapter.onmessageerror?.(new TypeError('Rejected unsafe JSON payload keys on wire transport'));
            return;
        }
        stats.received += 1;
        adapter.onmessage?.({ data: parsed });
    };

    const onWireError = (event) => {
        if (closed) return;
        adapter.onmessageerror?.(event);
    };

    const useEventTarget = typeof socketLike.addEventListener === 'function' && typeof socketLike.removeEventListener === 'function';
    if (useEventTarget) {
        socketLike.addEventListener('message', onWireMessage);
        socketLike.addEventListener('error', onWireError);
    } else {
        socketLike.onmessage = onWireMessage;
        socketLike.onerror = onWireError;
    }

    function detachListeners() {
        if (useEventTarget) {
            socketLike.removeEventListener('message', onWireMessage);
            socketLike.removeEventListener('error', onWireError);
        } else {
            socketLike.onmessage = null;
            socketLike.onerror = null;
        }
    }

    return adapter;
}
