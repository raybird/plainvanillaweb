import { test } from 'node:test';
import assert from 'node:assert/strict';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    isHeld(name) {
        return Boolean(this._locks.get(name)?.holder);
    }
}

const {
    PeerDiscovery,
    createPeerDiscovery,
    createMessageBus,
    createLeaderElection,
} = await import('../lib/coordination.js');

test('PeerDiscovery：建構不啟動計時器與通訊，且嚴格驗證選項與原型鍵', () => {
    const hub = createMemoryBusHub();
    const spyTransport = hub.createTransport();
    let posted = 0;
    const origPost = spyTransport.postMessage.bind(spyTransport);
    spyTransport.postMessage = (d) => {
        posted += 1;
        origPost(d);
    };

    const pd = createPeerDiscovery({
        namespace: 'peers',
        transport: spyTransport,
        capabilities: ['sync', 'audio'],
        meta: { region: 'tw' },
    });
    assert.equal(pd.started, false);
    assert.equal(posted, 0);
    assert.deepEqual(pd.getPeers({ includeSelf: true }), []);

    assert.throws(() => new PeerDiscovery('bad'), TypeError);
    assert.throws(() => new PeerDiscovery({ namespace: '' }), TypeError);
    assert.throws(() => new PeerDiscovery({ heartbeatIntervalMs: 0 }), TypeError);
    assert.throws(() => new PeerDiscovery({ peerTimeoutMs: -1 }), TypeError);
    assert.throws(() => new PeerDiscovery({ capabilities: JSON.parse('{"__proto__":{"polluted":true}}') }), TypeError);
    assert.throws(() => new PeerDiscovery({ capabilities: { nested: { constructor: 1 } } }), TypeError);
    assert.throws(() => new PeerDiscovery({ capabilities: ['__proto__'] }), TypeError);
    assert.throws(() => new PeerDiscovery({ meta: { prototype: true } }), TypeError);

    pd.dispose();
    // 建構後未呼叫 start() 時不曾啟動 transport；手動關閉 spyTransport 確認 hub 清空
    spyTransport.close();
    assert.equal(hub.size(), 0);
});

test('PeerDiscovery：加入、能力宣告／更新／篩選、namespace 隔離與主動離開', () => {
    const hub = createMemoryBusHub();
    const busA = createMessageBus({ namespace: 'team-x', transport: hub.createTransport(), tabId: 'node-a' });
    const busB = createMessageBus({ namespace: 'team-x', transport: hub.createTransport(), tabId: 'node-b' });
    const busOther = createMessageBus({ namespace: 'team-y', transport: hub.createTransport(), tabId: 'node-other' });

    const pdA = createPeerDiscovery({
        bus: busA,
        capabilities: { ws: true, role: 'worker' },
        meta: { tab: 'A' },
        heartbeatIntervalMs: 5000,
        peerTimeoutMs: 15000,
    });
    const pdB = createPeerDiscovery({
        bus: busB,
        capabilities: ['sse', 'cache'],
        meta: { tab: 'B' },
        heartbeatIntervalMs: 5000,
        peerTimeoutMs: 15000,
    });
    const pdOther = createPeerDiscovery({
        bus: busOther,
        capabilities: ['ws'],
        heartbeatIntervalMs: 5000,
        peerTimeoutMs: 15000,
    });

    const aJoins = [];
    const aUpdates = [];
    const aLeaves = [];
    pdA.on('peer-join', (e) => aJoins.push(e));
    pdA.on('peer-update', (e) => aUpdates.push(e));
    pdA.on('peer-leave', (e) => aLeaves.push(e));

    pdA.start();
    pdB.start();
    pdOther.start();

    assert.equal(aJoins.length, 1);
    assert.equal(aJoins[0].rejoined, false);
    assert.equal(aJoins[0].peer.nodeId, 'node-b');
    assert.deepEqual(aJoins[0].peer.capabilities, ['sse', 'cache']);
    assert.equal(Object.isFrozen(aJoins[0].peer), true);

    assert.equal(pdOther.getPeers().length, 0);
    assert.equal(pdA.getPeers().length, 1);
    // 晚加入的 pdB 透過 hello 應答立即發現既有節點 node-a，不須乾等 5000ms 心跳間隔
    assert.equal(pdB.getPeers().length, 1);
    assert.equal(pdB.getPeer('node-a')?.nodeId, 'node-a');
    assert.equal(pdA.getPeers({ includeSelf: true }).length, 2);
    assert.equal(pdA.getPeers({ includeSelf: true, capability: 'ws' }).length, 1);
    assert.equal(pdA.getPeers({ capability: 'cache' }).length, 1);

    // 能力更新應觸發 peer-update 與即時公告
    pdB.updateCapabilities(['sse', 'cache', 'video'], { tab: 'B2' });
    assert.equal(aUpdates.length, 1);
    assert.deepEqual(aUpdates[0].previous.capabilities, ['sse', 'cache']);
    assert.deepEqual(aUpdates[0].peer.capabilities, ['sse', 'cache', 'video']);
    assert.equal(aUpdates[0].peer.meta.tab, 'B2');

    // stop 發出 __peer:leave 並移除 peer
    pdB.stop();
    assert.equal(aLeaves.length, 1);
    assert.equal(aLeaves[0].peer.nodeId, 'node-b');
    assert.equal(aLeaves[0].peer.status, 'left');
    assert.equal(pdA.getPeer('node-b'), null);
    assert.equal(pdA.getPeers().length, 0);

    pdA.dispose();
    pdB.dispose();
    pdOther.dispose();
    // 外部注入的 bus 不應被 PeerDiscovery.dispose() 代關
    assert.equal(busA.closed, false);
    busA.dispose();
    busB.dispose();
    busOther.dispose();
    assert.equal(hub.size(), 0);
});

test('PeerDiscovery：heartbeat 逾時過期、恢復重新加入 (rejoined) 且過期絕不釋放 Web Lock', async () => {
    let clock = 1000;
    const hub = createMemoryBusHub();
    const locks = new MockLockManager();

    const busA = createMessageBus({ namespace: 'obs', transport: hub.createTransport(), tabId: 'tab-a' });
    const busB = createMessageBus({ namespace: 'obs', transport: hub.createTransport(), tabId: 'tab-b' });

    const lockA = createLeaderElection({ namespace: 'obs', scope: 'res', bus: busA, locks });
    const lockB = createLeaderElection({ namespace: 'obs', scope: 'res', bus: busB, locks });
    assert.equal((await lockA.start()).role, 'leader');
    assert.equal((await lockB.start()).role, 'follower');

    const pdA = createPeerDiscovery({
        bus: busA,
        capabilities: ['leader'],
        heartbeatIntervalMs: 5000,
        peerTimeoutMs: 1000,
        sweepIntervalMs: 5000,
        now: () => clock,
    });
    const pdB = createPeerDiscovery({
        bus: busB,
        capabilities: ['follower'],
        heartbeatIntervalMs: 5000,
        peerTimeoutMs: 1000,
        sweepIntervalMs: 5000,
        now: () => clock,
    });

    const bJoins = [];
    const bExpires = [];
    pdB.on('peer-join', (e) => bJoins.push(e));
    pdB.on('peer-expire', (e) => bExpires.push(e));

    pdB.start();
    pdA.start();

    assert.equal(bJoins.length, 1);
    assert.equal(bJoins[0].rejoined, false);

    // 推進時間讓 tab-a 過期（模擬背景分頁凍結停發 heartbeat）
    clock += 1200;
    const expired = pdB.sweep();
    assert.equal(expired.length, 1);
    assert.equal(expired[0].nodeId, 'tab-a');
    assert.equal(expired[0].status, 'expired');
    assert.equal(bExpires.length, 1);
    assert.equal(bExpires[0].reason, 'timeout');
    assert.equal(pdB.getPeers().length, 0);
    assert.equal(pdB.getPeers({ includeExpired: true }).length, 1);

    // 核心不變量：節點心跳過期絕不釋放或奪取 Web Lock
    assert.equal(locks.isHeld(lockA.lockName), true);
    assert.equal(lockA.role, 'leader');
    assert.equal(lockB.role, 'follower');

    // 分頁恢復送出 heartbeat 後應標為 rejoined: true
    pdA.announce();
    assert.equal(bJoins.length, 2);
    assert.equal(bJoins[1].rejoined, true);
    assert.equal(bJoins[1].peer.status, 'alive');
    assert.equal(pdB.getPeers().length, 1);

    await lockA.dispose();
    await lockB.dispose();
    pdA.dispose();
    pdB.dispose();
    busA.dispose();
    busB.dispose();
});

test('PeerDiscovery：亂序／過期 seq 忽略與無 BroadcastChannel 安全降級', async () => {
    const hub = createMemoryBusHub();
    const pdA = createPeerDiscovery({
        namespace: 'seq-ns',
        transport: hub.createTransport(),
        nodeId: 'sender',
        heartbeatIntervalMs: 40,
        peerTimeoutMs: 90,
        sweepIntervalMs: 25,
    });
    const pdB = createPeerDiscovery({
        namespace: 'seq-ns',
        transport: hub.createTransport(),
        nodeId: 'observer',
        heartbeatIntervalMs: 5000,
        peerTimeoutMs: 90,
        sweepIntervalMs: 25,
    });

    const expiredEvents = [];
    pdB.on('peer-expire', (e) => expiredEvents.push(e));
    pdB.start();
    pdA.start();

    await sleep(60);
    assert.equal(pdB.getPeers().length, 1);

    // 注入較小 seq 的亂序封包不應覆蓋最新能力
    pdA.updateCapabilities({ step: 2 });
    const currentSeq = pdB.getPeer('sender').seq;
    pdA._bus.publish('__peer:heartbeat', {
        nodeId: 'sender',
        namespace: 'seq-ns',
        capabilities: { step: 1 },
        meta: {},
        seq: currentSeq - 1,
        startedAt: pdB.getPeer('sender').startedAt,
        timestamp: Date.now(),
    });
    assert.deepEqual(pdB.getPeer('sender').capabilities, { step: 2 });

    // 停止計時器但不發 leave：測試定時自動 sweep 過期
    clearInterval(pdA._heartbeatTimer);
    pdA._heartbeatTimer = null;
    await sleep(160);
    assert.equal(expiredEvents.length, 1);
    assert.equal(pdB.getPeer('sender').status, 'expired');

    pdA.dispose();
    pdB.dispose();

    const OriginalBC = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = undefined;
    try {
        const offline = createPeerDiscovery({ namespace: 'offline' });
        assert.equal(offline.supported, false);
        const startRes = offline.start();
        assert.equal(startRes.started, true);
        assert.equal(startRes.supported, false);
        assert.equal(offline.announce(), false);
        offline.dispose();
    } finally {
        globalThis.BroadcastChannel = OriginalBC;
    }
});

test('PeerDiscovery：循環參照／不合法 transport 防護、等價鍵順序、舊 startedAt 忽略與重啟 rejoined', () => {
    const circular = { a: 1 };
    circular.self = circular;
    assert.throws(() => new PeerDiscovery({ meta: circular }), TypeError);
    assert.throws(() => new PeerDiscovery({ capabilities: circular }), TypeError);
    assert.throws(() => new PeerDiscovery({ transport: {} }), TypeError);

    let clock = 2000;
    const hub = createMemoryBusHub();
    const pdA = createPeerDiscovery({
        namespace: 'hardening',
        transport: hub.createTransport(),
        nodeId: 'alpha',
        capabilities: { a: 1, b: 2 },
        heartbeatIntervalMs: 5000,
        peerTimeoutMs: 15000,
        now: () => clock,
    });
    const pdB = createPeerDiscovery({
        namespace: 'hardening',
        transport: hub.createTransport(),
        nodeId: 'beta',
        heartbeatIntervalMs: 5000,
        peerTimeoutMs: 15000,
        now: () => clock,
    });

    const joins = [];
    const updates = [];
    pdB.on('peer-join', (e) => joins.push(e));
    pdB.on('peer-update', (e) => updates.push(e));

    pdB.start();
    pdA.start();
    assert.equal(joins.length, 1);

    // 鍵順序不同但內容等價的能力物件不應誤發 peer-update
    pdA.updateCapabilities({ b: 2, a: 1 });
    assert.equal(updates.length, 0);

    // 較舊 startedAt 的延遲封包必須忽略
    pdA._bus.publish('__peer:heartbeat', {
        nodeId: 'alpha',
        namespace: 'hardening',
        capabilities: { stale: true },
        meta: {},
        seq: 99,
        startedAt: 1000,
        timestamp: 1000,
    });
    assert.deepEqual(pdB.getPeer('alpha').capabilities, { a: 1, b: 2 });
    assert.equal(pdB.getPeer('alpha').startedAt, 2000);

    // 模擬同 nodeId 以較新 startedAt 重新啟動發出 __peer:hello，應觸發 rejoined: true
    clock = 3000;
    pdA._bus.publish('__peer:hello', {
        nodeId: 'alpha',
        namespace: 'hardening',
        capabilities: { a: 1, b: 2 },
        meta: {},
        seq: 1,
        startedAt: 3000,
        timestamp: 3000,
    });
    assert.equal(joins.length, 2);
    assert.equal(joins[1].rejoined, true);
    assert.equal(pdB.getPeer('alpha').startedAt, 3000);

    pdA.dispose();
    pdB.dispose();
    assert.equal(hub.size(), 0);
});
