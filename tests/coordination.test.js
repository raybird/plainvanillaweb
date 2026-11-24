import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COORDINATION_FILES = [
    'lib/base-service.js',
    'lib/broadcast-channel.js',
    'lib/coordination.js',
    'lib/leader-election.js',
    'lib/message-bus.js',
    'lib/peer-discovery.js',
    'lib/rpc-channel.js',
    'lib/shared-connection.js',
    'lib/task-queue.js',
    'lib/version.js',
].sort();

function collectGraph(entry) {
    const seen = new Set();
    const visit = (file) => {
        if (seen.has(file)) return;
        seen.add(file);
        const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const [, spec] of source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/gms)) {
            if (spec.startsWith('.')) visit(path.relative(ROOT, path.resolve(ROOT, path.dirname(file), spec)));
        }
        for (const [, spec] of source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) {
            if (spec.startsWith('.')) visit(path.relative(ROOT, path.resolve(ROOT, path.dirname(file), spec)));
        }
    };
    visit(entry);
    return [...seen].sort();
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

test('lib/coordination.js 靜態相依圖只包含協調基礎模組，不依賴 UI、router、Store 或展示服務', () => {
    const graph = collectGraph('lib/coordination.js');
    assert.deepEqual(graph, COORDINATION_FILES);
    assert.ok(!graph.includes('lib/broadcast-service.js'));
    assert.ok(!graph.includes('lib/store.js'));
    assert.ok(!graph.includes('lib/router.js'));
    assert.ok(!graph.includes('lib/base-component.js'));
});

test('匯入 lib/coordination.js 不建立 BroadcastChannel、WebSocket、EventSource、不開啟 IndexedDB 也不呼叫 navigator.locks.request，且在無 API 環境不拋錯', async () => {
    const OriginalBC = globalThis.BroadcastChannel;
    const OriginalWS = globalThis.WebSocket;
    const OriginalES = globalThis.EventSource;
    const origNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const origIdbDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    let constructCount = 0;
    let lockRequestCount = 0;
    let wsConstructCount = 0;
    let sseConstructCount = 0;
    let idbOpenCount = 0;

    globalThis.BroadcastChannel = class {
        constructor() {
            constructCount += 1;
        }
    };
    globalThis.WebSocket = class {
        constructor() {
            wsConstructCount += 1;
        }
    };
    globalThis.EventSource = class {
        constructor() {
            sseConstructCount += 1;
        }
    };
    Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: {
            open() {
                idbOpenCount += 1;
                throw new Error('Should not open IndexedDB during import');
            },
        },
    });
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            locks: {
                request() {
                    lockRequestCount += 1;
                    return Promise.resolve();
                },
            },
        },
    });
    try {
        const mod = await import('../lib/coordination.js?spy=1');
        assert.equal(constructCount, 0);
        assert.equal(lockRequestCount, 0);
        assert.equal(wsConstructCount, 0);
        assert.equal(sseConstructCount, 0);
        assert.equal(idbOpenCount, 0);
        assert.equal(typeof mod.MessageBus, 'function');
        assert.equal(typeof mod.LeaderElection, 'function');
        assert.equal(typeof mod.RpcChannel, 'function');
        assert.equal(typeof mod.PeerDiscovery, 'function');
        assert.equal(typeof mod.SharedConnection, 'function');
        assert.equal(typeof mod.buildConnectionScope, 'function');
        assert.equal(typeof mod.DurableTaskQueue, 'function');
        assert.equal(typeof mod.createDurableTaskQueue, 'function');
        assert.equal(typeof mod.createMemoryTaskStorage, 'function');
        assert.equal(typeof mod.createIndexedDBTaskStorage, 'function');
    } finally {
        globalThis.BroadcastChannel = OriginalBC;
        globalThis.WebSocket = OriginalWS;
        globalThis.EventSource = OriginalES;
        if (origIdbDescriptor) {
            Object.defineProperty(globalThis, 'indexedDB', origIdbDescriptor);
        } else {
            delete globalThis.indexedDB;
        }
        if (origNavDescriptor) {
            Object.defineProperty(globalThis, 'navigator', origNavDescriptor);
        } else {
            delete globalThis.navigator;
        }
    }

    globalThis.BroadcastChannel = undefined;
    try {
        const modNoBc = await import('../lib/coordination.js?nobc=1');
        const caps = modNoBc.getCoordinationCapabilities();
        assert.equal(caps.broadcastChannel, false);
        assert.equal(typeof caps.webSocket, 'boolean');
        assert.equal(typeof caps.eventSource, 'boolean');
        assert.equal(typeof modNoBc.createMessageBus, 'function');
        assert.equal(typeof modNoBc.createLeaderElection, 'function');
        assert.equal(typeof modNoBc.createRpcChannel, 'function');
        assert.equal(typeof modNoBc.createPeerDiscovery, 'function');
        assert.equal(typeof modNoBc.createSharedConnection, 'function');
    } finally {
        globalThis.BroadcastChannel = OriginalBC;
    }
});

const {
    ENVELOPE_VERSION,
    BroadcastService,
    MessageBus,
    createMessageBus,
    getCoordinationCapabilities,
    createEnvelope,
    validateEnvelope,
} = await import('../lib/coordination.js');

test('createEnvelope 與 validateEnvelope 驗證版本化協定與錯誤回報', () => {
    const env = createEnvelope({
        ns: 'orders',
        type: 'order:created',
        payload: { id: 1 },
        sender: 'tab-1',
    });
    assert.equal(env.v, ENVELOPE_VERSION);
    assert.equal(env.ns, 'orders');
    assert.equal(typeof env.id, 'string');
    assert.ok(env.id.length > 0);

    const okV1 = validateEnvelope(env);
    assert.equal(okV1.valid, true);
    assert.equal(okV1.legacy, false);

    const okV0 = validateEnvelope({ type: 'legacy', payload: 123, sender: 't0', timestamp: 1000 });
    assert.equal(okV0.valid, true);
    assert.equal(okV0.legacy, true);
    assert.equal(okV0.version, 0);

    assert.deepEqual(validateEnvelope(null), { valid: false, reason: 'not-an-object' });
    assert.deepEqual(validateEnvelope({ type: '', sender: 'a', timestamp: 1 }), { valid: false, reason: 'invalid-type' });
    assert.deepEqual(validateEnvelope({ type: 'x', sender: '', timestamp: 1 }), { valid: false, reason: 'invalid-sender' });
    assert.deepEqual(validateEnvelope({ type: 'x', sender: 'a', timestamp: NaN }), { valid: false, reason: 'invalid-timestamp' });
    assert.deepEqual(validateEnvelope({ v: 99, ns: 'default', id: '1', type: 'x', sender: 'a', timestamp: 1 }), {
        valid: false,
        reason: 'unsupported-version',
    });
    assert.deepEqual(validateEnvelope({ v: 1, ns: '', id: '1', type: 'x', sender: 'a', timestamp: 1 }), {
        valid: false,
        reason: 'invalid-envelope',
    });
});

test('BroadcastService：namespace 隔離、輸入驗證、invalid-message、舊格式相容與 dispose', () => {
    const hub = createMemoryBusHub();
    const svcAlpha = new BroadcastService('ch', { namespace: 'alpha', transport: hub.createTransport(), tabId: 't-a' });
    const svcAlpha2 = new BroadcastService('ch', { namespace: 'alpha', transport: hub.createTransport(), tabId: 't-a2' });
    const svcBeta = new BroadcastService('ch', { namespace: 'beta', transport: hub.createTransport(), tabId: 't-b' });
    const svcDefault = new BroadcastService({ channelName: 'ch', transport: hub.createTransport(), tabId: 't-def' });

    assert.throws(() => new BroadcastService(''), TypeError);
    assert.throws(() => new BroadcastService('ch', { namespace: '' }), TypeError);
    assert.throws(() => new BroadcastService('ch', { tabId: ' ' }), TypeError);
    assert.throws(() => new BroadcastService('ch', { transport: {} }), TypeError);
    assert.throws(() => svcAlpha.post(''), TypeError);

    const alphaMsgs = [];
    const betaMsgs = [];
    const defaultMsgs = [];
    const invalids = [];

    svcAlpha2.on('message', (m) => alphaMsgs.push(m));
    svcAlpha2.on('invalid-message', (m) => invalids.push(m));
    svcBeta.on('message', (m) => betaMsgs.push(m));
    svcDefault.on('message', (m) => defaultMsgs.push(m));

    assert.equal(svcAlpha.post('ping', { ok: true }), true);
    assert.equal(alphaMsgs.length, 1);
    assert.equal(alphaMsgs[0].v, 1);
    assert.equal(alphaMsgs[0].ns, 'alpha');
    assert.deepEqual(alphaMsgs[0].payload, { ok: true });
    assert.equal(betaMsgs.length, 0);
    assert.equal(defaultMsgs.length, 0);

    // 不可結構化複製的資料應直接拋錯（不吞掉 DataCloneError）
    assert.throws(() => svcAlpha.post('bad', () => {}));

    // 注入畸形與跨版本訊息
    svcAlpha._transport.postMessage({ v: 2, ns: 'alpha', id: '1', type: 'x', sender: 'other', timestamp: 1 });
    svcAlpha._transport.postMessage('not-an-object');
    assert.equal(invalids.length, 2);

    // 舊格式 v0 訊息：default 接受、自訂 namespace (alpha) 忽略
    svcAlpha._transport.postMessage({ type: 'legacy-ping', payload: 7, sender: 'legacy-tab', timestamp: 100 });
    assert.equal(alphaMsgs.length, 1);
    assert.equal(defaultMsgs.length, 1);
    assert.equal(defaultMsgs[0].legacy, true);
    assert.equal(defaultMsgs[0].v, 0);

    // close / dispose 後冪等且停止收發；transport.close() 拋錯也不應中斷清理
    let closedEvents = 0;
    svcAlpha2.on('close', () => { closedEvents += 1; });
    svcAlpha2.dispose();
    svcAlpha2.close();
    assert.equal(closedEvents, 1);
    assert.equal(svcAlpha2.closed, true);
    assert.equal(svcAlpha2.post('after-close', {}), false);

    // onmessageerror 應轉發為 'messageerror' 事件
    const msgErrors = [];
    svcAlpha.on('messageerror', (e) => msgErrors.push(e));
    svcAlpha._transport.onmessageerror?.({ type: 'messageerror' });
    assert.equal(msgErrors.length, 1);

    // 自訂 transport.close() 拋錯時仍應標記 closed 並完成清理
    const throwingTransport = {
        onmessage: null,
        onmessageerror: null,
        postMessage() {},
        close() { throw new Error('close failed'); },
    };
    const svcThrowClose = new BroadcastService('err-close', { transport: throwingTransport, tabId: 'tc-1' });
    let throwClosed = 0;
    svcThrowClose.on('close', () => { throwClosed += 1; });
    svcThrowClose.close();
    assert.equal(svcThrowClose.closed, true);
    assert.equal(throwClosed, 1);

    svcAlpha.post('ping-2', { n: 2 });
    assert.equal(alphaMsgs.length, 1);

    svcAlpha.dispose();
    svcBeta.dispose();
    svcDefault.dispose();
    assert.equal(hub.size(), 0);
});

test('BroadcastService 在不支援 BroadcastChannel 時回傳 supported: false 且 post 回傳 false', () => {
    const OriginalBC = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = undefined;
    try {
        const svc = new BroadcastService('fallback-test');
        assert.equal(svc.supported, false);
        assert.equal(svc.capabilities.broadcastChannel, false);
        assert.equal(svc.capabilities.transport, 'none');
        assert.equal(svc.post('hello', { x: 1 }), false);
        svc.dispose();
    } finally {
        globalThis.BroadcastChannel = OriginalBC;
    }
});

test('MessageBus：publish/subscribe/unsubscribe、local/remote 投遞、隔離與錯誤防護', () => {
    const hub = createMemoryBusHub();
    const busA = createMessageBus({ namespace: 'room-1', transport: hub.createTransport(), tabId: 'tab-a' });
    const busB = createMessageBus({ namespace: 'room-1', transport: hub.createTransport(), tabId: 'tab-b' });
    const busOther = createMessageBus({ namespace: 'room-2', transport: hub.createTransport(), tabId: 'tab-other' });

    const seenA = [];
    const seenBAll = [];
    const seenBRemoteOnly = [];
    const seenBLocalOnly = [];
    const seenBWildcard = [];
    const seenOther = [];

    const unsubA = busA.subscribe('msg', (p, meta) => {
        p.mutatedByA = true;
        seenA.push({ p, meta });
    });
    const seenASecond = [];
    const seenAWildcard = [];
    busA.subscribe('msg', (p, meta) => seenASecond.push({ p, meta }));
    busA.subscribe('*', (p, meta) => seenAWildcard.push({ p, meta }));
    busB.subscribe('msg', (p, meta) => seenBAll.push({ p, meta }));
    busB.subscribe('msg', (p, meta) => seenBRemoteOnly.push({ p, meta }), { receive: 'remote' });
    busB.subscribe('msg', (p, meta) => seenBLocalOnly.push({ p, meta }), { receive: 'local' });
    busB.subscribe('*', (p, meta) => seenBWildcard.push({ p, meta }));
    busOther.subscribe('*', (p, meta) => seenOther.push({ p, meta }));

    assert.throws(() => busA.publish('*', {}), TypeError);
    assert.throws(() => busA.subscribe('', () => {}), TypeError);
    assert.throws(() => busA.subscribe('msg', () => {}, { receive: 'invalid' }), TypeError);

    // 1. 預設 publish：remote-only
    const r1 = busA.publish('msg', { text: 'remote-default' });
    assert.equal(r1.localCount, 0);
    assert.equal(r1.remoteSent, true);
    assert.equal(seenA.length, 0);
    assert.equal(seenBAll.length, 1);
    assert.equal(seenBRemoteOnly.length, 1);
    assert.equal(seenBLocalOnly.length, 0);
    assert.equal(seenBWildcard.length, 1);
    assert.equal(seenBAll[0].meta.origin, 'remote');
    assert.equal(seenBAll[0].meta.id, r1.id);
    assert.equal(seenOther.length, 0);

    // 2. local + remote 且驗證首位與後續訂閱者複本及 meta 凍結隔離（Blocker #2 回歸）
    const originalObj = { text: 'both', nested: { n: 1 } };
    const r2 = busA.publish('msg', originalObj, { local: true, remote: true });
    assert.equal(r2.localCount, 3);
    assert.equal(r2.remoteSent, true);
    assert.equal(seenA.length, 1);
    assert.equal(seenA[0].meta.origin, 'local');
    assert.equal(seenA[0].meta.id, r2.id);
    assert.equal(Object.isFrozen(seenA[0].meta), true);
    assert.equal(originalObj.mutatedByA, undefined); // 確認本地 handler 異動不會污染原物件
    assert.equal(seenASecond[0].p.mutatedByA, undefined); // 首位訂閱者改寫不得污染同批後續訂閱者
    assert.equal(seenAWildcard[0].p.mutatedByA, undefined);
    assert.equal(seenBAll.length, 2);

    // 3. local-only（不經遠端）與 remote: null 語意
    const r3 = busB.publish('msg', { text: 'local-only' }, { local: true, remote: false });
    assert.equal(r3.remoteSent, false);
    assert.equal(r3.localCount, 3); // seenBAll, seenBLocalOnly, seenBWildcard
    assert.equal(seenA.length, 1);
    assert.equal(seenBRemoteOnly.length, 2);
    assert.equal(seenBLocalOnly.length, 1);
    assert.equal(seenBLocalOnly[0].meta.origin, 'local');

    const r3NullRemote = busB.publish('msg', { text: 'null-remote' }, { local: false, remote: null });
    assert.equal(r3NullRemote.remoteSent, false);
    assert.equal(seenA.length, 1);

    // 4. unsubscribe 與冪等性
    unsubA();
    unsubA();
    assert.equal(busA.subscriberCount('msg'), 1);
    busA.publish('msg', { text: 'still-remote' }, { local: true });
    assert.equal(seenA.length, 1);
    assert.equal(seenASecond.length, 2);
    assert.equal(seenBAll.length, 4);

    // 5. handler 錯誤隔離
    const handlerErrors = [];
    busB.on('handler-error', (e) => handlerErrors.push(e));
    const badFn = () => { throw new Error('boom'); };
    busB.subscribe('err-topic', badFn);
    let survivorRan = false;
    busB.subscribe('err-topic', () => { survivorRan = true; });
    busA.publish('err-topic', { x: 1 });
    assert.equal(handlerErrors.length, 1);
    assert.equal(survivorRan, true);

    // 6. unsubscribe(topic, handler)
    busB.unsubscribe('err-topic', badFn);
    assert.equal(busB.subscriberCount('err-topic'), 1);

    // 7. 外部注入 BroadcastService 時，bus.dispose() 不應關閉外部 BroadcastService
    const sharedBc = new BroadcastService('shared', { namespace: 'ext', transport: hub.createTransport(), tabId: 'ext-1' });
    const extBus = new MessageBus({ broadcast: sharedBc });
    const extErrors = [];
    extBus.on('messageerror', (e) => extErrors.push(e));
    sharedBc._transport.onmessageerror?.({ type: 'messageerror' });
    assert.equal(extErrors.length, 1);
    extBus.dispose();
    assert.equal(extBus.closed, true);
    assert.equal(sharedBc.closed, false);

    // 8. 在第 1 位 handler 內呼叫 dispose() 後，同批後續 handler 不應再被執行；且遠端多訂閱者複本亦隔離
    const busDisposeMid = createMessageBus({ namespace: 'mid', transport: hub.createTransport(), tabId: 'mid-1' });
    const busRemoteSender = createMessageBus({ namespace: 'mid', transport: hub.createTransport(), tabId: 'mid-2' });
    let remoteMutatedLeak = false;
    busDisposeMid.subscribe('iso', (p) => { p.remoteDirty = true; });
    busDisposeMid.subscribe('*', (p) => { if (p.remoteDirty) remoteMutatedLeak = true; });
    busRemoteSender.publish('iso', { v: 1 });
    assert.equal(remoteMutatedLeak, false);

    let secondAfterDisposeRan = false;
    busDisposeMid.subscribe('close-mid', () => { busDisposeMid.dispose(); });
    busDisposeMid.subscribe('close-mid', () => { secondAfterDisposeRan = true; });
    busDisposeMid.publish('close-mid', { v: 2 }, { local: true, remote: false });
    assert.equal(secondAfterDisposeRan, false);

    busA.dispose();
    busB.dispose();
    busOther.dispose();
    sharedBc.dispose();
    busRemoteSender.dispose();
    assert.equal(hub.size(), 0);
});

test('MessageBus 在無 BroadcastChannel 環境時明確回報 remoteSent: false，但 local 投遞正常', () => {
    const OriginalBC = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = undefined;
    try {
        const bus = createMessageBus({ namespace: 'offline-bus' });
        assert.equal(bus.supported, false);
        const received = [];
        bus.subscribe('ping', (p, meta) => received.push({ p, meta }));

        const res = bus.publish('ping', { v: 1 }, { local: true, remote: true });
        assert.equal(res.remoteSent, false);
        assert.equal(res.localCount, 1);
        assert.equal(received.length, 1);
        assert.equal(received[0].meta.origin, 'local');

        bus.dispose();
    } finally {
        globalThis.BroadcastChannel = OriginalBC;
    }
});

test('既有 lib/broadcast-service.js 單例與舊 API 維持向下相容', async () => {
    const OriginalBC = globalThis.BroadcastChannel;
    const sent = [];
    const created = [];
    globalThis.BroadcastChannel = class {
        constructor(name) {
            this.name = name;
            created.push(this);
        }
        postMessage(data) {
            sent.push(data);
        }
        close() {}
    };
    try {
        const { broadcastService } = await import('../lib/broadcast-service.js?compat=1');
        assert.equal(typeof broadcastService.tabId, 'string');
        assert.equal(typeof broadcastService.post, 'function');
        const events = [];
        const off = broadcastService.on('message', (d) => events.push(d));
        created.at(-1).onmessage({ data: { type: 'legacy', payload: { a: 1 }, sender: 'other', timestamp: 1 } });
        assert.equal(events.length, 1);
        assert.equal(events[0].type, 'legacy');
        assert.deepEqual(events[0].payload, { a: 1 });
        off();
    } finally {
        globalThis.BroadcastChannel = OriginalBC;
    }
});
