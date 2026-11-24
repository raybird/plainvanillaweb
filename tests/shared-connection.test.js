import http from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRealtimeTestServer } from './helpers/realtime-server.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(predicate, timeoutMs = 4000, stepMs = 15) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return true;
        await sleep(stepMs);
    }
    return false;
}

function createMemoryBusHub() {
    const endpoints = new Set();
    return {
        createTransport() {
            let closed = false;
            const transport = {
                onmessage: null,
                onmessageerror: null,
                postMessage(data) {
                    if (closed) return;
                    const cloned = structuredClone(data);
                    for (const peer of endpoints) {
                        if (peer !== transport) {
                            peer.onmessage?.({ data: structuredClone(cloned) });
                        }
                    }
                },
                close() {
                    closed = true;
                    endpoints.delete(transport);
                },
            };
            endpoints.add(transport);
            return transport;
        },
        size() {
            return endpoints.size;
        },
    };
}

class MockLockManager {
    constructor() {
        this._locks = new Map();
    }
    _entry(name) {
        let entry = this._locks.get(name);
        if (!entry) {
            entry = { holder: null, queue: [] };
            this._locks.set(name, entry);
        }
        return entry;
    }
    _drain(name) {
        const entry = this._locks.get(name);
        if (!entry || entry.holder || entry.queue.length === 0) return;
        while (entry.queue.length > 0 && !entry.holder) {
            const waiter = entry.queue.shift();
            waiter.cleanupSignal?.();
            if (waiter.signal?.aborted) {
                const err = new Error('The request was aborted.');
                err.name = 'AbortError';
                waiter.reject(err);
                continue;
            }
            this._grant(name, entry, waiter.callback, waiter.resolve, waiter.reject);
        }
    }
    _grant(name, entry, callback, resolve, reject) {
        const token = { name, mode: 'exclusive' };
        entry.holder = token;
        Promise.resolve()
            .then(() => callback(token))
            .then(
                (val) => {
                    if (entry.holder === token) {
                        entry.holder = null;
                        this._drain(name);
                    }
                    resolve(val);
                },
                (err) => {
                    if (entry.holder === token) {
                        entry.holder = null;
                        this._drain(name);
                    }
                    reject(err);
                }
            );
    }
    request(name, optionsOrCallback, maybeCallback) {
        let options = {};
        let callback = optionsOrCallback;
        if (typeof optionsOrCallback === 'object' && optionsOrCallback !== null) {
            options = optionsOrCallback;
            callback = maybeCallback;
        }
        if (options.ifAvailable && options.signal) {
            const err = new Error('ifAvailable and signal cannot both be set');
            err.name = 'NotSupportedError';
            return Promise.reject(err);
        }
        if (options.signal?.aborted) {
            const err = new Error('The request was aborted.');
            err.name = 'AbortError';
            return Promise.reject(err);
        }
        const entry = this._entry(name);
        if (options.ifAvailable) {
            if (entry.holder !== null) {
                return Promise.resolve().then(() => callback(null));
            }
            return new Promise((resolve, reject) => this._grant(name, entry, callback, resolve, reject));
        }
        if (entry.holder === null && entry.queue.length === 0) {
            return new Promise((resolve, reject) => this._grant(name, entry, callback, resolve, reject));
        }
        return new Promise((resolve, reject) => {
            const waiter = { callback, resolve, reject, signal: options.signal, cleanupSignal: null };
            if (options.signal) {
                const onAbort = () => {
                    const idx = entry.queue.indexOf(waiter);
                    if (idx !== -1) entry.queue.splice(idx, 1);
                    const err = new Error('The request was aborted.');
                    err.name = 'AbortError';
                    reject(err);
                };
                options.signal.addEventListener('abort', onAbort, { once: true });
                waiter.cleanupSignal = () => options.signal.removeEventListener('abort', onAbort);
            }
            entry.queue.push(waiter);
        });
    }
    forceDrop(name) {
        const entry = this._locks.get(name);
        if (!entry) return;
        entry.holder = null;
        this._drain(name);
    }
}

/**
 * 薄型 HTTP SSE 客戶端適配器（直連本地 realtime-server.mjs /sse 端點，支援 lastEventId 與具名事件），
 * 讓 Node 22 測試亦能針對真實 HTTP text/event-stream 端點驗證 EventSource 語意。
 */
class NodeHttpEventSource extends EventTarget {
    constructor(url, options = {}) {
        super();
        this.url = String(url);
        this.withCredentials = Boolean(options?.withCredentials);
        this.readyState = 0; // CONNECTING
        this._closed = false;
        this._req = null;

        const target = new URL(this.url);
        const headers = { Accept: 'text/event-stream' };
        if (this.withCredentials) {
            headers.Cookie = 'session_hint=with_credentials';
        }
        const req = http.get(target, { headers }, (res) => {
            if (this._closed) {
                res.destroy();
                return;
            }
            if (res.statusCode !== 200) {
                this.readyState = 2;
                this.dispatchEvent(new Event('error'));
                res.resume();
                return;
            }

            this.readyState = 1; // OPEN
            this.dispatchEvent(new Event('open'));

            let buffer = '';
            let eventType = '';
            let dataLines = [];
            let lastEventId = '';

            const flushBlock = () => {
                if (dataLines.length === 0) {
                    eventType = '';
                    return;
                }
                const payload = dataLines.join('\n');
                const type = eventType || 'message';
                const ev = new MessageEvent(type, {
                    data: payload,
                    lastEventId,
                });
                this.dispatchEvent(ev);
                eventType = '';
                dataLines = [];
            };

            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                if (this._closed) return;
                buffer += chunk;
                let idx;
                while ((idx = buffer.indexOf('\n')) !== -1) {
                    let line = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 1);
                    if (line.endsWith('\r')) line = line.slice(0, -1);

                    if (line === '') {
                        flushBlock();
                        continue;
                    }
                    if (line.startsWith(':')) continue;
                    const colon = line.indexOf(':');
                    const field = colon === -1 ? line : line.slice(0, colon);
                    let value = colon === -1 ? '' : line.slice(colon + 1);
                    if (value.startsWith(' ')) value = value.slice(1);

                    if (field === 'event') eventType = value;
                    else if (field === 'data') dataLines.push(value);
                    else if (field === 'id' && !value.includes('\0')) lastEventId = value;
                }
            });

            const onDrop = () => {
                if (this._closed) return;
                this.readyState = 2;
                this.dispatchEvent(new Event('error'));
            };
            res.on('close', onDrop);
            res.on('end', onDrop);
            res.on('error', onDrop);
        });

        req.on('error', () => {
            if (this._closed) return;
            this.readyState = 2;
            this.dispatchEvent(new Event('error'));
        });
        this._req = req;
    }

    close() {
        if (this._closed) return;
        this._closed = true;
        this.readyState = 2;
        try {
            this._req?.destroy();
        } catch {
            // noop
        }
    }
}

const {
    SHARED_CONNECTION_ERROR_CODES,
    SharedConnectionError,
    buildConnectionScope,
    SharedConnection,
    createSharedConnection,
    createMessageBus,
} = await import('../lib/coordination.js');

test('buildConnectionScope：嚴格隔離端點、帳號、設定與傳輸選項，並拒絕內嵌帳密或錯配參數', () => {
    const s1 = buildConnectionScope({
        transport: 'websocket',
        url: 'ws://127.0.0.1:8080/ws?room=alpha',
        identityKey: 'user:1',
        configKey: { region: 'tw', compression: true },
        protocols: ['v1'],
    });
    const s2 = buildConnectionScope({
        transport: 'websocket',
        url: 'ws://127.0.0.1:8080/ws?room=alpha',
        identityKey: 'user:2',
        configKey: { compression: true, region: 'tw' },
        protocols: ['v1'],
    });
    const s1SameConfigDiffOrder = buildConnectionScope({
        transport: 'websocket',
        url: 'ws://127.0.0.1:8080/ws?room=alpha',
        identityKey: 'user:1',
        configKey: { compression: true, region: 'tw' },
        protocols: ['v1'],
    });

    assert.equal(s1.scopeKey, s1SameConfigDiffOrder.scopeKey);
    assert.notEqual(s1.scopeKey, s2.scopeKey);

    const sseA = buildConnectionScope({
        transport: 'sse',
        url: 'http://127.0.0.1:8080/sse?room=alpha',
        identityKey: 'user:1',
        withCredentials: false,
    });
    const sseB = buildConnectionScope({
        transport: 'sse',
        url: 'http://127.0.0.1:8080/sse?room=alpha',
        identityKey: 'user:1',
        withCredentials: true,
    });
    assert.notEqual(sseA.scopeKey, sseB.scopeKey);

    assert.throws(() => buildConnectionScope({ transport: 'http', url: 'ws://localhost/ws' }), TypeError);
    assert.throws(() => buildConnectionScope({ transport: 'websocket', url: 'http://localhost/ws' }), TypeError);
    assert.throws(() => buildConnectionScope({ transport: 'sse', url: 'ws://localhost/sse' }), TypeError);
    assert.throws(() => buildConnectionScope({ transport: 'websocket', url: 'ws://user:secret@localhost/ws' }), TypeError);
    assert.throws(() => buildConnectionScope({ transport: 'websocket', url: 'ws://localhost/ws', withCredentials: true }), TypeError);
    assert.throws(() => buildConnectionScope({ transport: 'sse', url: 'http://localhost/sse', protocols: 'v1' }), TypeError);
    assert.throws(() => buildConnectionScope({ transport: 'websocket', url: 'ws://localhost/ws', identityKey: ' ' }), TypeError);
    assert.throws(() => buildConnectionScope({ transport: 'websocket', url: 'ws://localhost/ws', configKey: JSON.parse('{"__proto__":{"x":1}}') }), TypeError);
});

test('SharedConnection：建構零副作用，缺少 Web Locks / WS / SSE 時明確回報 unsupported', async () => {
    const origNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const origWS = globalThis.WebSocket;
    const origES = globalThis.EventSource;
    let lockCalls = 0;
    let wsCalls = 0;

    globalThis.WebSocket = class {
        constructor() { wsCalls += 1; }
    };
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { locks: { request() { lockCalls += 1; return Promise.resolve(); } } },
    });

    try {
        const sc = createSharedConnection({ transport: 'websocket', url: 'ws://127.0.0.1:9999/ws' });
        assert.equal(lockCalls, 0);
        assert.equal(wsCalls, 0);
        assert.equal(sc.state, 'idle');
        assert.equal(sc.canSend, true);
        await assert.rejects(() => sc.send('early'), { code: SHARED_CONNECTION_ERROR_CODES.NOT_STARTED });
        await sc.dispose();

        // 缺少 Web Locks
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
        const noLocks = createSharedConnection({ transport: 'websocket', url: 'ws://127.0.0.1:9999/ws' });
        assert.equal(noLocks.supported, false);
        assert.equal(noLocks.state, 'unsupported');
        const res1 = await noLocks.start();
        assert.equal(res1.supported, false);
        assert.equal(res1.state, 'unsupported');
        await noLocks.dispose();

        // 有 locks 但無 EventSource 時對 sse 顯式回報 unsupported
        globalThis.EventSource = undefined;
        const noSse = createSharedConnection({
            transport: 'sse',
            url: 'http://127.0.0.1:9999/sse',
            locks: new MockLockManager(),
        });
        assert.equal(noSse.supported, false);
        assert.equal(noSse.canSend, false);
        const res2 = await noSse.start();
        assert.equal(res2.supported, false);
        await assert.rejects(() => noSse.send('x'), { code: SHARED_CONNECTION_ERROR_CODES.UNSUPPORTED_OPERATION });
        await noSse.dispose();
    } finally {
        globalThis.WebSocket = origWS;
        globalThis.EventSource = origES;
        if (origNavDesc) Object.defineProperty(globalThis, 'navigator', origNavDesc);
        else delete globalThis.navigator;
    }
});

test('SharedConnection (WebSocket)：穩定狀態單 scope 一條連線、轉發收發、不自動重試、訂閱同步、重連與接管', async () => {
    const server = await startRealtimeTestServer();
    const hub = createMemoryBusHub();
    const locks = new MockLockManager();

    try {
        const wsUrl = server.wsUrl('alpha');
        const busA = createMessageBus({ namespace: 'sc-ws', transport: hub.createTransport(), tabId: 'tab-a' });
        const busB = createMessageBus({ namespace: 'sc-ws', transport: hub.createTransport(), tabId: 'tab-b' });
        const busC = createMessageBus({ namespace: 'sc-ws', transport: hub.createTransport(), tabId: 'tab-c' });

        const resyncCallsA = [];
        const resyncCallsB = [];
        const subChangesA = [];
        const resolvedUrls = [];
        const seenBusMessages = [];
        busB.subscribe('*', (payload, meta) => seenBusMessages.push({ topic: meta.topic, payload }));

        const connA = createSharedConnection({
            transport: 'websocket',
            url: wsUrl,
            identityKey: 'acct-1',
            configKey: 'main',
            bus: busA,
            locks,
            reconnect: { initialDelayMs: 30, maxDelayMs: 120, jitter: 0, maxAttempts: 5 },
            resolveUrl: ({ url, epoch, attempt }) => {
                resolvedUrls.push({ epoch, attempt });
                // 模擬僅於 leader 本機換取短效票證，不得廣播或出現在公開狀態事件
                return `${url}&ep=${epoch}&att=${attempt}&ephemeralTicket=sec-local-only`;
            },
            onResync: (ctx) => {
                resyncCallsA.push({ reason: ctx.reason, epoch: ctx.epoch, subs: ctx.subscriptions });
            },
            onSubscriptionsChange: (ctx) => {
                subChangesA.push(ctx);
            },
        });

        const connB = createSharedConnection({
            transport: 'websocket',
            url: wsUrl,
            identityKey: 'acct-1',
            configKey: 'main',
            bus: busB,
            locks,
            reconnect: { initialDelayMs: 30, maxDelayMs: 120, jitter: 0, maxAttempts: 5 },
            onResync: (ctx) => {
                resyncCallsB.push({ reason: ctx.reason, epoch: ctx.epoch, subs: ctx.subscriptions });
            },
        });

        // 不同帳號同 URL 必須使用獨立鎖與獨立連線，絕不混用
        const connOtherAcct = createSharedConnection({
            transport: 'websocket',
            url: wsUrl,
            identityKey: 'acct-2',
            configKey: 'main',
            bus: busC,
            locks,
            reconnect: { initialDelayMs: 30, maxDelayMs: 120, jitter: 0, maxAttempts: 5 },
        });

        const msgsA = [];
        const msgsB = [];
        const msgsOther = [];
        const resyncEventsB = [];
        connA.on('message', (m) => msgsA.push(m));
        connB.on('message', (m) => msgsB.push(m));
        connB.on('resync', (r) => resyncEventsB.push(r));
        connOtherAcct.on('message', (m) => msgsOther.push(m));

        connA.subscribe('orders');
        const unsubFeedB = connB.subscribe('feed');

        await connA.start();
        await connB.start();
        await connOtherAcct.start();

        assert.equal(connA.role, 'leader');
        assert.equal(connB.role, 'follower');
        assert.equal(connOtherAcct.role, 'leader');

        assert.equal(await waitUntil(() => connA.state === 'open' && connB.state === 'open' && connOtherAcct.state === 'open'), true);
        // acct-1 兩分頁僅開 1 條 + acct-2 獨立 1 條 = 2 條連線
        assert.equal(server.getStats('alpha').activeWsCount, 2);
        assert.equal(server.getStats('alpha').totalWsOpened, 2);

        // 確認局部票證只透過 leader resolveUrl 送往伺服器，絕不洩漏至 MessageBus 或 follower 事件
        assert.equal(resolvedUrls.length >= 1, true);
        assert.equal(connA.url.includes('ephemeralTicket'), false);
        assert.equal(JSON.stringify(seenBusMessages).includes('ephemeralTicket'), false);

        // 驗證跨分頁訂閱集合聯集
        assert.equal(await waitUntil(() => {
            const subs = connA.getSubscriptions();
            return subs.includes('orders') && subs.includes('feed');
        }), true);
        unsubFeedB();
        assert.equal(await waitUntil(() => !connA.getSubscriptions().includes('feed')), true);
        assert.equal(subChangesA.length >= 1, true);

        // Server 推播僅會出現於對應連線：因 server.wsUrl('alpha') 兩帳號同 room，改用 client.sendText 或測試接收一致性
        server.broadcastWs('alpha', JSON.stringify({ seq: 1, text: 'hello' }));
        assert.equal(await waitUntil(() => msgsA.length === 1 && msgsB.length === 1 && msgsOther.length === 1), true);
        assert.equal(msgsA[0].relayed, false);
        assert.equal(msgsB[0].relayed, true);
        assert.equal(JSON.parse(msgsB[0].data).seq, 1);

        // Follower 經由 RPC 透過 leader 轉發 send，且不應產生重複傳送
        const rSendB = await connB.send('from-follower-B');
        assert.equal(rSendB.ok, true);
        assert.equal(rSendB.relayed, true);
        const rSendA = await connA.send('from-leader-A');
        assert.equal(rSendA.ok, true);
        assert.equal(rSendA.relayed, false);
        assert.equal(await waitUntil(() => server.getStats('alpha').receivedWsMessages.length === 2), true);
        assert.deepEqual(
            server.getStats('alpha').receivedWsMessages.map((m) => m.data),
            ['from-follower-B', 'from-leader-A']
        );

        // 斷線退避重連 + onResync('reconnect')
        server.dropWs('alpha');
        assert.equal(await waitUntil(() => resyncCallsA.some((c) => c.reason === 'reconnect') && connB.state === 'open' && connOtherAcct.state === 'open'), true);
        assert.equal(resyncEventsB.some((e) => e.reason === 'reconnect'), true);
        assert.equal(server.getStats('alpha').activeWsCount, 2);

        // Failover：leader (connA) 停止釋鎖後，follower (connB) 自動接管並維持僅 1 條 acct-1 連線
        connB.subscribe('takeover-ch');
        await connA.stop();
        assert.equal(await waitUntil(() => connB.role === 'leader' && connB.state === 'open'), true);
        assert.equal(resyncCallsB.some((c) => c.reason === 'takeover' && c.subs.includes('takeover-ch')), true);
        assert.equal(server.getStats('alpha').activeWsCount, 2);

        // 斷開全部後確認無殘留連線，且發送失敗時不自動重試
        await connB.dispose();
        await connOtherAcct.dispose();
        assert.equal(await waitUntil(() => server.getStats('alpha').activeWsCount === 0), true);

        // 在沒有其他 leader、且本機未連線的狀況下 send 不自動重試（只試 1 次即失敗）
        const busIsolated = createMessageBus({ namespace: 'nr', transport: hub.createTransport(), tabId: 'nr-f' });
        const isolatedA = createSharedConnection({
            transport: 'websocket',
            url: server.wsUrl('no-retry'),
            bus: busIsolated,
            locks,
            reconnect: false,
            sendTimeoutMs: 60,
        });
        // 預先模擬已被他方鎖定但無連線處理器，驗證 follower send 僅失敗 1 次不重試
        let resolveHold;
        void locks.request(isolatedA._scope.scopeKey ? `vanilla:coord:leader:${encodeURIComponent('nr')}:${encodeURIComponent(isolatedA.scopeKey)}` : 'x', { mode: 'exclusive' }, () => new Promise((r) => { resolveHold = r; }));
        await isolatedA.start();
        assert.equal(isolatedA.role, 'follower');
        const t0 = Date.now();
        await assert.rejects(() => isolatedA.send('one-shot', { timeoutMs: 45 }), { code: SHARED_CONNECTION_ERROR_CODES.TIMEOUT });
        assert.equal(Date.now() - t0 < 200, true);
        resolveHold();
        await isolatedA.dispose();
        assert.equal(busIsolated.closed, false);
        busIsolated.dispose();

        await connA.dispose();
        busA.dispose();
        busB.dispose();
        busC.dispose();
        assert.equal(hub.size(), 0);
    } finally {
        await server.close();
    }
});

test('SharedConnection (SSE)：嚴格單向禁止 send()、lastEventId 與自訂事件轉發、重連及接管', async () => {
    const server = await startRealtimeTestServer();
    const hub = createMemoryBusHub();
    const locks = new MockLockManager();

    try {
        const sseUrl = server.sseUrl('feed-sse');
        const busA = createMessageBus({ namespace: 'sc-sse', transport: hub.createTransport(), tabId: 'sse-a' });
        const busB = createMessageBus({ namespace: 'sc-sse', transport: hub.createTransport(), tabId: 'sse-b' });

        const resyncB = [];
        const urlHistory = [];

        const sseA = createSharedConnection({
            transport: 'sse',
            url: sseUrl,
            identityKey: 'reader-1',
            withCredentials: true,
            eventTypes: ['stock'],
            bus: busA,
            locks,
            EventSource: NodeHttpEventSource,
            reconnect: { initialDelayMs: 30, maxDelayMs: 100, jitter: 0, maxAttempts: 5 },
            resolveUrl: ({ url, lastEventId, epoch }) => {
                urlHistory.push({ by: 'A', epoch, lastEventId });
                return lastEventId ? `${url}&lastEventId=${encodeURIComponent(lastEventId)}` : url;
            },
        });
        const sseB = createSharedConnection({
            transport: 'sse',
            url: sseUrl,
            identityKey: 'reader-1',
            withCredentials: true,
            eventTypes: ['stock'],
            bus: busB,
            locks,
            EventSource: NodeHttpEventSource,
            reconnect: { initialDelayMs: 30, maxDelayMs: 100, jitter: 0, maxAttempts: 5 },
            resolveUrl: ({ url, lastEventId, epoch }) => {
                urlHistory.push({ by: 'B', epoch, lastEventId });
                return lastEventId ? `${url}&lastEventId=${encodeURIComponent(lastEventId)}` : url;
            },
            onResync: (ctx) => {
                assert.equal(ctx.send, undefined);
                resyncB.push(ctx);
            },
        });

        // 嚴格單向檢查：SSE 建構起 canSend 為 false，未啟動或啟動後 leader/follower send() 均立即以 UNSUPPORTED_OPERATION 拒絕
        assert.equal(sseA.canSend, false);
        assert.equal(sseB.canSend, false);
        await assert.rejects(() => sseA.send('illegal'), { code: SHARED_CONNECTION_ERROR_CODES.UNSUPPORTED_OPERATION });

        const gotA = [];
        const gotB = [];
        sseA.on('message', (m) => gotA.push(m));
        sseB.on('message', (m) => gotB.push(m));

        await sseA.start();
        await sseB.start();
        assert.equal(await waitUntil(() => sseA.state === 'open' && sseB.state === 'open'), true);
        assert.equal(server.getStats('feed-sse').activeSseCount, 1);

        await assert.rejects(() => sseA.send('illegal-leader'), { code: SHARED_CONNECTION_ERROR_CODES.UNSUPPORTED_OPERATION });
        await assert.rejects(() => sseB.send('illegal-follower'), { code: SHARED_CONNECTION_ERROR_CODES.UNSUPPORTED_OPERATION });

        // 驗證 cookie（withCredentials）傳送給伺服器端與具名事件 + lastEventId 同步
        assert.equal(server.getStats('feed-sse').openedSseRequests[0].cookie, 'session_hint=with_credentials');
        server.broadcastSse('feed-sse', { id: 'ev-101', event: 'stock', data: '{"price":99}' });
        assert.equal(await waitUntil(() => gotA.length === 1 && gotB.length === 1), true);
        assert.equal(gotA[0].event, 'stock');
        assert.equal(gotB[0].event, 'stock');
        assert.equal(gotB[0].lastEventId, 'ev-101');
        assert.equal(gotB[0].relayed, true);
        assert.equal(sseB.lastEventId, 'ev-101');

        // 斷線重連後 resolveUrl 應自動收到 latest lastEventId
        server.dropSse('feed-sse');
        assert.equal(await waitUntil(() => urlHistory.some((h) => h.by === 'A' && h.lastEventId === 'ev-101') && sseA.state === 'open'), true);

        // 模擬 leader 無預警消失 (forceDrop lock + destroy socket)，follower 接管後也攜帶 'ev-101'
        const lockName = sseA._election.lockName;
        sseA._closeActiveSocket();
        locks.forceDrop(lockName);
        assert.equal(await waitUntil(() => sseB.role === 'leader' && sseB.state === 'open'), true);
        assert.equal(resyncB.some((r) => r.reason === 'takeover' && r.lastEventId === 'ev-101'), true);
        assert.equal(urlHistory.some((h) => h.by === 'B' && h.lastEventId === 'ev-101'), true);

        await sseA.dispose();
        await sseB.dispose();
        busA.dispose();
        busB.dispose();
        assert.equal(await waitUntil(() => server.getStats('feed-sse').activeSseCount === 0), true);
    } finally {
        await server.close();
    }
});

test('SharedConnection：背景凍結 (releaseOnFreeze) 主動斷線釋放鎖，resume 後恢復參與競選', async () => {
    const server = await startRealtimeTestServer();
    const hub = createMemoryBusHub();
    const locks = new MockLockManager();
    const docTarget = new EventTarget();
    const origDocument = globalThis.document;
    globalThis.document = docTarget;

    try {
        const wsUrl = server.wsUrl('freeze-room');
        let frozenA = false;
        const transportA = hub.createTransport();
        const busA = createMessageBus({ namespace: 'fr', transport: transportA, tabId: 'fr-a' });
        const origOnMessageA = transportA.onmessage;
        transportA.onmessage = (ev) => {
            if (!frozenA) origOnMessageA?.(ev);
        };
        const busB = createMessageBus({ namespace: 'fr', transport: hub.createTransport(), tabId: 'fr-b' });

        const cA = createSharedConnection({
            transport: 'websocket',
            url: wsUrl,
            bus: busA,
            locks,
            releaseOnFreeze: true,
        });
        const cB = createSharedConnection({
            transport: 'websocket',
            url: wsUrl,
            bus: busB,
            locks,
            // 模擬 cB 為活躍前景分頁（不會進入背景 freeze）
            releaseOnFreeze: false,
        });

        cA.subscribe('alpha-only');
        await cA.start();
        await cB.start();
        assert.equal(await waitUntil(() => cA.state === 'open' && cB.state === 'open'), true);
        assert.equal(cA.role, 'leader');
        assert.equal(server.getStats('freeze-room').activeWsCount, 1);

        // 模擬瀏覽器凍結分頁 A：暫停 busA 接收廣播並觸發 freeze，使 cA 漏接 cB 接管後的 state 與 subs-query
        frozenA = true;
        docTarget.dispatchEvent(new Event('freeze'));
        assert.equal(await waitUntil(() => cB.role === 'leader' && cB.state === 'open'), true);
        assert.equal(cA.role, 'idle');
        assert.equal(cA.state, 'idle');
        assert.equal(cA.leaderId, null);
        assert.equal(cB.getSubscriptions().includes('alpha-only'), false);
        assert.equal(server.getStats('freeze-room').activeWsCount, 1);

        // 恢復凍結並觸發 resume -> cA 轉為 follower 時必須自動恢復 state='open'、更新 leaderId 並將 'alpha-only' 補回 cB 聯集（Medium #1 回歸）
        frozenA = false;
        docTarget.dispatchEvent(new Event('resume'));
        assert.equal(await waitUntil(() => cA.role === 'follower' && cA.state === 'open' && cA.leaderId === cB.nodeId && cB.getSubscriptions().includes('alpha-only')), true);
        assert.equal(server.getStats('freeze-room').activeWsCount, 1);

        await cA.dispose();
        await cB.dispose();
        busA.dispose();
        busB.dispose();
    } finally {
        globalThis.document = origDocument;
        await server.close();
    }
});

test('SharedConnection：併發 stop()/dispose()、啟動中 stop()->start()、啟動失敗回滾與 AbortSignal 取消（含 abort("dispose")）', async () => {
    const server = await startRealtimeTestServer();
    const hub = createMemoryBusHub();
    const locks = new MockLockManager();

    try {
        const wsUrl = server.wsUrl('race-room');
        const busA = createMessageBus({ namespace: 'race', transport: hub.createTransport(), tabId: 'r-a' });
        const cA = createSharedConnection({ transport: 'websocket', url: wsUrl, bus: busA, locks });

        await cA.start();
        assert.equal(await waitUntil(() => cA.state === 'open'), true);
        const lockName = cA._election.lockName;
        assert.equal(locks._locks.get(lockName)?.holder !== null, true);

        // 1. 未 await stop() 後立即重啟 start()
        const pStop = cA.stop();
        const resRestart = await cA.start();
        await pStop;
        assert.equal(resRestart.started, true);
        assert.equal(await waitUntil(() => cA.state === 'open'), true);

        // 2. 併發呼叫 stop() 與 dispose() 皆必須等待鎖與連線徹底關閉後才 resolve
        await Promise.all([cA.stop(), cA.dispose()]);
        assert.equal(locks._locks.get(lockName)?.holder, null);
        assert.equal(cA.closed, true);
        assert.equal(await waitUntil(() => server.getStats('race-room').activeWsCount === 0), true);

        // 3. 啟動中未 await stop() 緊接 start()（Medium #2 複現 A）
        const busR = createMessageBus({ namespace: 'race', transport: hub.createTransport(), tabId: 'r-r' });
        const slowLocks = {
            request(name, opts, cb) {
                return new Promise((resolve, reject) => {
                    setTimeout(() => locks.request(name, opts, cb).then(resolve, reject), 15);
                });
            },
        };
        const cR = createSharedConnection({ transport: 'websocket', url: wsUrl, bus: busR, locks: slowLocks });
        const p1 = cR.start();
        const pStopMid = cR.stop();
        const p2 = cR.start();
        const [r1, , r2] = await Promise.all([p1, pStopMid, p2]);
        assert.equal(r1.cancelled, true);
        assert.equal(r2.started, true);
        assert.equal(cR.started, true);
        assert.equal(await waitUntil(() => cR.state === 'open'), true);
        // leader 呼叫 send() 亦須一致驗證 timeoutMs 與 signal
        await assert.rejects(() => cR.send('bad-opt', { timeoutMs: -1 }), TypeError);
        await assert.rejects(() => cR.send('bad-sig', { signal: {} }), TypeError);
        await cR.dispose();

        // 4. start() 內部失敗時必須完整回滾（Medium #2 複現 B）
        const failLocks = {
            request() {
                return Promise.reject(new Error('locks unavailable temporarily'));
            },
        };
        const busFail = createMessageBus({ namespace: 'fail', transport: hub.createTransport(), tabId: 'r-fail' });
        const cFail = createSharedConnection({ transport: 'websocket', url: wsUrl, bus: busFail, locks: failLocks });
        await assert.rejects(() => cFail.start(), /locks unavailable temporarily/);
        assert.equal(cFail.started, false);
        assert.equal(cFail.state, 'idle');
        assert.equal(cFail._election, null);
        assert.equal(cFail._rpc, null);
        await cFail.dispose();

        // 5. 循環參照 configKey 必須明確拋出 TypeError
        const circularCfg = { k: 1 };
        circularCfg.self = circularCfg;
        assert.throws(() => buildConnectionScope({ transport: 'websocket', url: wsUrl, configKey: circularCfg }), TypeError);

        // 6. start({ signal }) 預先／過程中取消（含字面 reason 'dispose'）皆不應留下鎖
        const busB = createMessageBus({ namespace: 'race', transport: hub.createTransport(), tabId: 'r-b' });
        const cB = createSharedConnection({ transport: 'websocket', url: wsUrl, bus: busB, locks });
        const preAc = new AbortController();
        preAc.abort('early');
        const preRes = await cB.start({ signal: preAc.signal });
        assert.equal(preRes.started, false);
        assert.equal(preRes.cancelled, true);
        assert.equal(locks._locks.get(lockName)?.holder, null);

        // 由他人持鎖期間從 follower 佇列中止（故意使用 reason = 'dispose' 確認不會被誤忽略）
        let releaseBlocker;
        void locks.request(lockName, { mode: 'exclusive' }, () => new Promise((r) => { releaseBlocker = r; }));
        const queueAc = new AbortController();
        const queuedStart = await cB.start({ signal: queueAc.signal });
        assert.equal(queuedStart.role, 'follower');
        queueAc.abort('dispose');
        assert.equal(await waitUntil(() => cB.state === 'idle' && cB.started === false && cB._election === null), true);
        releaseBlocker();
        await sleep(20);
        assert.equal(locks._locks.get(lockName)?.holder, null);

        await cB.dispose();
        busA.dispose();
        busR.dispose();
        busFail.dispose();
        busB.dispose();
        assert.equal(hub.size(), 0);
    } finally {
        await server.close();
    }
});
