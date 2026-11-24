import { test } from 'node:test';
import assert from 'node:assert/strict';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 符合 W3C Web Locks 核心語意的記憶體模擬器（支援 exclusive 排隊、ifAvailable、signal 中斷與模擬崩潰強釋） */
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
        if (typeof callback !== 'function') {
            return Promise.reject(new TypeError('Lock callback must be a function'));
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
            return new Promise((resolve, reject) => {
                this._grant(name, entry, callback, resolve, reject);
            });
        }

        if (entry.holder === null && entry.queue.length === 0) {
            return new Promise((resolve, reject) => {
                this._grant(name, entry, callback, resolve, reject);
            });
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

    /** 模擬持鎖分頁無預警關閉或重載：釋放鎖並喚醒下一個排隊者 */
    forceDrop(name) {
        const entry = this._locks.get(name);
        if (!entry) return;
        entry.holder = null;
        this._drain(name);
    }

    isHeld(name) {
        return Boolean(this._locks.get(name)?.holder);
    }
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
    };
}

const {
    LeaderElection,
    createLeaderElection,
    createMessageBus,
} = await import('../lib/coordination.js');

test('LeaderElection：輸入驗證與不支援 Web Locks 時明確回報 unsupported', async () => {
    assert.throws(() => new LeaderElection({ namespace: '' }), TypeError);
    assert.throws(() => new LeaderElection({ scope: ' ' }), TypeError);
    assert.throws(() => new LeaderElection({ lockPrefix: '' }), TypeError);
    assert.throws(() => new LeaderElection({ heartbeatIntervalMs: -1 }), TypeError);
    assert.throws(() => new LeaderElection({ releaseOnFreeze: 'yes' }), TypeError);
    assert.throws(() => new LeaderElection({ locks: {} }), TypeError);

    const OriginalLocks = globalThis.navigator?.locks;
    const origNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { ...globalThis.navigator, locks: undefined },
    });
    try {
        const el = createLeaderElection({ scope: 'no-locks' });
        assert.equal(el.supported, false);
        assert.equal(el.role, 'unsupported');
        assert.equal(el.capabilities.webLocks, false);

        let unsupportedFired = 0;
        el.on('unsupported', () => { unsupportedFired += 1; });
        const res = await el.start();
        assert.deepEqual(res, { acquired: false, role: 'unsupported', epoch: 0, supported: false });
        assert.equal(unsupportedFired, 1);
        await el.dispose();
    } finally {
        if (origNavDescriptor) {
            Object.defineProperty(globalThis, 'navigator', origNavDescriptor);
        } else {
            Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: OriginalLocks } });
        }
    }
});

test('LeaderElection：同 scope 最多一位 leader，不同 scope 隔離，release 與崩潰皆可接管', async () => {
    const locks = new MockLockManager();
    const el1 = createLeaderElection({ namespace: 'app', scope: 'sync', locks, nodeId: 'n1' });
    const el2 = createLeaderElection({ namespace: 'app', scope: 'sync', locks, nodeId: 'n2' });
    const el3 = createLeaderElection({ namespace: 'app', scope: 'sync', locks, nodeId: 'n3' });
    const elOtherScope = createLeaderElection({ namespace: 'app', scope: 'other', locks, nodeId: 'n4' });

    const r1 = await el1.start();
    const r2 = await el2.start();
    const r3 = await el3.start();
    const rOther = await elOtherScope.start();

    assert.equal(r1.acquired, true);
    assert.equal(r1.role, 'leader');
    assert.equal(r2.acquired, false);
    assert.equal(r2.role, 'follower');
    assert.equal(r3.role, 'follower');
    assert.equal(rOther.acquired, true); // 不同 scope 獨立互斥
    assert.equal([el1, el2, el3].filter((e) => e.isLeader).length, 1);

    // 主動 release 後由 el2 接管
    let takeoverEvent = null;
    el2.on('elected', (e) => { takeoverEvent = e; });
    await el1.release();
    await sleep(10);
    assert.equal(el1.role, 'idle');
    assert.equal(el2.role, 'leader');
    assert.equal(takeoverEvent?.takeover, true);
    assert.equal([el1, el2, el3].filter((e) => e.isLeader).length, 1);

    // 模擬 el2 無預警崩潰／關閉分頁（forceDrop），由 el3 接管
    let el3Elected = false;
    el3.on('elected', (e) => { if (e.takeover) el3Elected = true; });
    locks.forceDrop(el2.lockName);
    await sleep(10);
    assert.equal(el3Elected, true);
    assert.equal(el3.role, 'leader');

    await el3.dispose();
    await el2.dispose();
    await el1.dispose();
    await elOtherScope.dispose();
    assert.equal(locks.isHeld(el1.lockName), false);
});

test('LeaderElection：follower stop()、預先/途中 AbortSignal 取消不破壞現任 leader', async () => {
    const locks = new MockLockManager();
    const el1 = createLeaderElection({ scope: 'cancel-test', locks, nodeId: 'leader' });
    const el2 = createLeaderElection({ scope: 'cancel-test', locks, nodeId: 'waiter' });
    const el3 = createLeaderElection({ scope: 'cancel-test', locks, nodeId: 'abort-waiter' });

    await el1.start();

    // 預先 abort 的 signal
    const preAc = new AbortController();
    preAc.abort('already-aborted');
    const preRes = await el2.start({ signal: preAc.signal });
    assert.equal(preRes.cancelled, true);
    assert.equal(el2.role, 'idle');

    // 排隊中以 stop() 取消
    await el2.start();
    assert.equal(el2.role, 'follower');
    let cancelledCount = 0;
    el2.on('cancelled', () => { cancelledCount += 1; });
    await el2.stop();
    assert.equal(el2.role, 'idle');
    assert.equal(cancelledCount, 1);

    // 排隊中以 AbortSignal 取消
    const ac = new AbortController();
    await el3.start({ signal: ac.signal });
    assert.equal(el3.role, 'follower');
    ac.abort('user-cancelled');
    await sleep(10);
    assert.equal(el3.role, 'idle');

    // el1 釋放後，已被取消的 el2/el3 不應取得鎖
    await el1.release();
    await sleep(10);
    assert.equal(locks.isHeld(el1.lockName), false);
    assert.equal(el2.isLeader, false);
    assert.equal(el3.isLeader, false);

    await el1.dispose();
    await el2.dispose();
    await el3.dispose();
});

test('LeaderElection：heartbeat 僅作觀測而不作為互斥依據，dispose 不關閉外部 bus', async () => {
    const locks = new MockLockManager();
    const hub = createMemoryBusHub();
    const bus1 = createMessageBus({ namespace: 'hb-ns', transport: hub.createTransport(), tabId: 'hb-1' });
    const bus2 = createMessageBus({ namespace: 'hb-ns', transport: hub.createTransport(), tabId: 'hb-2' });

    const el1 = createLeaderElection({
        namespace: 'hb-ns',
        scope: 'hb-scope',
        locks,
        bus: bus1,
        heartbeatIntervalMs: 25,
    });
    const el2 = createLeaderElection({
        namespace: 'hb-ns',
        scope: 'hb-scope',
        locks,
        bus: bus2,
        heartbeatIntervalMs: 25,
    });

    const heartbeats = [];
    el2.on('leader-heartbeat', (hb) => heartbeats.push(hb));

    await el1.start();
    await el2.start();
    await sleep(70);

    assert.ok(heartbeats.length >= 1);
    assert.equal(el2.observedLeader?.nodeId, 'hb-1');

    // 停止送 heartbeat 但仍持有鎖（模擬背景凍結停擺計時器）：el2 不應因無 heartbeat 而奪鎖
    el1._stopHeartbeat();
    await sleep(80);
    assert.equal(el1.isLeader, true);
    assert.equal(el2.isLeader, false);

    // dispose 不得關閉外部傳入的 bus
    await el1.dispose();
    await el2.dispose();
    assert.equal(bus1.closed, false);
    assert.equal(bus2.closed, false);

    bus1.dispose();
    bus2.dispose();
});

test('LeaderElection：背景 freeze 預設保持鎖，releaseOnFreeze: true 時讓鎖並於 resume 重新競選', async () => {
    const locks = new MockLockManager();
    const origDoc = globalThis.document;
    const listeners = new Map();
    const fakeDoc = {
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) {
            listeners.get(type)?.delete(fn);
        },
        dispatch(type) {
            for (const fn of [...(listeners.get(type) || [])]) fn({ type });
        },
    };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDoc });

    try {
        // 1. 預設 releaseOnFreeze: false 保留互斥
        const conservative = createLeaderElection({ scope: 'freeze-keep', locks, nodeId: 'c1' });
        await conservative.start();
        fakeDoc.dispatch('freeze');
        await sleep(10);
        assert.equal(conservative.isLeader, true);
        await conservative.dispose();

        // 2. releaseOnFreeze: true 凍結讓鎖、喚醒重選
        const yielding = createLeaderElection({ scope: 'freeze-yield', locks, nodeId: 'y1', releaseOnFreeze: true });
        const backup = createLeaderElection({ scope: 'freeze-yield', locks, nodeId: 'y2' });

        await yielding.start();
        await backup.start();
        assert.equal(yielding.isLeader, true);
        assert.equal(backup.role, 'follower');

        fakeDoc.dispatch('freeze');
        await sleep(15);
        assert.equal(yielding.role, 'idle');
        assert.equal(backup.isLeader, true);

        fakeDoc.dispatch('resume');
        await sleep(15);
        assert.equal(yielding.role, 'follower'); // backup 仍持有鎖，yielding 回歸 follower 排隊

        await backup.release();
        await sleep(15);
        assert.equal(yielding.isLeader, true); // backup 釋放後 yielding 接管

        await yielding.dispose();
        await backup.dispose();
    } finally {
        Object.defineProperty(globalThis, 'document', { configurable: true, value: origDoc });
    }
});

test('LeaderElection：並發 release/dispose 不重複退位且等待釋放；不 await release 立即 start 與快速 freeze->resume 不被舊任務覆蓋', async () => {
    const locks = new MockLockManager();
    const hub = createMemoryBusHub();
    const bus = createMessageBus({ namespace: 'race-ns', transport: hub.createTransport(), tabId: 'r-node' });

    // 1. 鎖名分段冒號編碼不碰撞
    const col1 = createLeaderElection({ namespace: 'a:b', scope: 'c', locks });
    const col2 = createLeaderElection({ namespace: 'a', scope: 'b:c', locks });
    assert.notEqual(col1.lockName, col2.lockName);
    await col1.dispose();
    await col2.dispose();

    // 2. 並發 release() + dispose() 只發出一次 resigned，且在 lockTask 結束前不提前 resolve
    const el1 = createLeaderElection({ namespace: 'race-ns', scope: 'conc', locks, bus });
    const roleEvents = [];
    let resignedCount = 0;
    el1.on('role-change', (e) => roleEvents.push(e));
    el1.on('resigned', () => { resignedCount += 1; });

    await el1.start();
    await Promise.all([el1.release(), el1.dispose(), el1.dispose()]);
    assert.equal(resignedCount, 1);
    assert.equal(locks.isHeld(el1.lockName), false);
    const idleEvent = roleEvents.find((e) => e.role === 'idle');
    assert.equal(idleEvent?.takeover, false);

    // 3. 不 await release() 立即呼叫 start()，角色不得被前次釋放覆蓋成 idle
    const el2 = createLeaderElection({ namespace: 'race-ns', scope: 'restart', locks, bus });
    await el2.start();
    assert.equal(el2.role, 'leader');
    const relP = el2.release();
    const restartRes = await el2.start();
    await relP;
    assert.equal(restartRes.acquired, true);
    assert.equal(el2.role, 'leader');
    await el2.dispose();

    // 4. releaseOnFreeze: true 下快速 freeze -> resume（同事件迴圈）以及暫停中顯式 start()
    const origDoc = globalThis.document;
    const listeners = new Map();
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            addEventListener(type, fn) {
                if (!listeners.has(type)) listeners.set(type, new Set());
                listeners.get(type).add(fn);
            },
            removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
            dispatch(type) { for (const fn of [...(listeners.get(type) || [])]) fn({ type }); },
        },
    });
    try {
        const elFreeze = createLeaderElection({ namespace: 'race-ns', scope: 'fast-freeze', locks, releaseOnFreeze: true });
        await elFreeze.start();
        globalThis.document.dispatch('freeze');
        globalThis.document.dispatch('resume'); // 不等 freeze 完成立刻 resume
        await sleep(30);
        assert.equal(elFreeze.role, 'leader');

        // 暫停後顯式呼叫 start() 亦可恢復競選
        globalThis.document.dispatch('freeze');
        await sleep(15);
        assert.equal(elFreeze.role, 'idle');
        const manualResume = await elFreeze.start();
        assert.equal(manualResume.acquired, true);
        assert.equal(elFreeze.role, 'leader');
        await elFreeze.dispose();
    } finally {
        Object.defineProperty(globalThis, 'document', { configurable: true, value: origDoc });
    }

    // 5. Phase 1 尚為 idle 時由外部 AbortSignal 帶自訂 reason 取消，應發出 cancelled 事件
    const slowLocks = {
        request(name, opts, cb) {
            return new Promise((resolve) => setTimeout(() => resolve(cb({ name })), 30));
        },
    };
    const elCustomCancel = createLeaderElection({ scope: 'custom-abort', locks: slowLocks });
    const cancelledReasons = [];
    elCustomCancel.on('cancelled', (e) => cancelledReasons.push(e.reason));
    const ac = new AbortController();
    const startP = elCustomCancel.start({ signal: ac.signal });
    ac.abort('custom-reason');
    const startRes = await startP;
    assert.equal(startRes.cancelled, true);
    assert.deepEqual(cancelledReasons, ['custom-reason']);
    await elCustomCancel.dispose();

    bus.dispose();
});
