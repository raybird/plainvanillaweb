import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    TASK_SCHEMA_VERSION,
    TASK_STATUS,
    TASK_QUEUE_ERROR_CODES,
    TaskQueueError,
    DurableTaskQueue,
    createDurableTaskQueue,
    createMemoryTaskStorage,
    createIndexedDBTaskStorage,
} from '../lib/coordination.js';

function createFakeLocksManager() {
    const heldLocks = new Map();
    const calls = [];
    return {
        calls,
        heldLocks,
        async request(name, options, callback) {
            calls.push({ name, options: { ...options } });
            assert.notEqual(options?.steal, true, 'Web Locks 嚴禁使用 steal: true');
            if (heldLocks.has(name)) {
                if (options?.ifAvailable) {
                    return callback(null);
                }
                throw new Error('Lock already held in test double');
            }
            const handle = { name, mode: options?.mode || 'exclusive' };
            heldLocks.set(name, handle);
            try {
                return await callback(handle);
            } finally {
                if (heldLocks.get(name) === handle) {
                    heldLocks.delete(name);
                }
            }
        },
        forceReleaseForCrash(name) {
            heldLocks.delete(name);
        },
    };
}

describe('lib/task-queue.js — DurableTaskQueue 核心契約', () => {
    it('建構子與儲存配接器工廠保持零副作用，不呼叫 indexedDB.open 或 navigator.locks.request', () => {
        let openCalls = 0;
        let lockCalls = 0;
        const fakeIndexedDB = {
            open() {
                openCalls++;
                throw new Error('Should not open IndexedDB in constructor');
            },
        };
        const fakeLocks = {
            request() {
                lockCalls++;
                throw new Error('Should not request locks in constructor');
            },
        };

        const storage = createIndexedDBTaskStorage({ indexedDB: fakeIndexedDB });
        const queue = createDurableTaskQueue({
            namespace: 'zero-side-effect',
            indexedDB: fakeIndexedDB,
            locks: fakeLocks,
        });

        assert.ok(storage);
        assert.equal(queue.supported, true);
        assert.equal(queue.started, false);
        assert.equal(queue.deliverySemantics, 'at-least-once');
        assert.equal(openCalls, 0);
        assert.equal(lockCalls, 0);
    });

    it('無 IndexedDB 且未注入自訂 storage 時明確回報 supported: false，不靜默偽造持久化', async () => {
        const queue = new DurableTaskQueue({ namespace: 'no-idb' });
        assert.equal(queue.supported, false);

        let unsupportedEvent = null;
        queue.on('unsupported', (d) => {
            unsupportedEvent = d;
        });

        const startRes = await queue.start();
        assert.deepEqual(startRes, { started: false, running: false, supported: false });
        assert.ok(unsupportedEvent);

        await assert.rejects(
            () => queue.enqueue({ type: 'job', payload: { x: 1 } }),
            (err) => err instanceof TaskQueueError && err.code === TASK_QUEUE_ERROR_CODES.UNSUPPORTED_ENVIRONMENT
        );
        await assert.rejects(
            () => queue.listTasks(),
            (err) => err instanceof TaskQueueError && err.code === TASK_QUEUE_ERROR_CODES.UNSUPPORTED_ENVIRONMENT
        );
        await queue.dispose();
    });

    it('顯式傳入 indexedDB: null 時不回退全域 indexedDB，且 close() 等待開啟完成後清除殘留句柄', async () => {
        const origIdb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
        Object.defineProperty(globalThis, 'indexedDB', {
            configurable: true,
            value: {
                open() {
                    throw new Error('Global indexedDB should not be touched when null is injected');
                },
            },
        });
        try {
            const disabledQueue = createDurableTaskQueue({ namespace: 'explicit-null', indexedDB: null });
            assert.equal(disabledQueue.supported, false);
            const startRes = await disabledQueue.start();
            assert.deepEqual(startRes, { started: false, running: false, supported: false });
            await disabledQueue.dispose();
        } finally {
            if (origIdb) {
                Object.defineProperty(globalThis, 'indexedDB', origIdb);
            } else {
                delete globalThis.indexedDB;
            }
        }

        // 模擬 open() 進行中呼叫 close() 的競態：必須關閉並重設句柄讓下次 open() 重新開啟
        let openCount = 0;
        let closeCount = 0;
        let pendingReq = null;
        const mockIdb = {
            open() {
                openCount += 1;
                const req = {};
                pendingReq = req;
                return req;
            },
        };
        const storage = createIndexedDBTaskStorage({ indexedDB: mockIdb });
        const opening = storage.open();
        const closing = storage.close();
        pendingReq.onsuccess({
            target: {
                result: {
                    close() {
                        closeCount += 1;
                    },
                },
            },
        });
        await Promise.all([opening, closing]);
        assert.equal(openCount, 1);
        assert.equal(closeCount, 1);

        // 重用同一個 storage 時必須重新開啟，不可拿到已關閉的舊 db
        const reopening = storage.open();
        assert.equal(openCount, 2);
        pendingReq.onsuccess({
            target: {
                result: { close() {} },
            },
        });
        await reopening;
        await storage.close();
    });

    it('驗證輸入、禁止原型污染鍵與循環參照，但允許安全的非循環 DAG 共用物件', async () => {
        const storage = createMemoryTaskStorage();
        const queue = createDurableTaskQueue({ storage, useWebLocks: false });

        assert.throws(() => createDurableTaskQueue([]), TypeError);
        assert.throws(() => queue.registerHandler('__proto__', () => {}), TypeError);
        assert.throws(() => queue.registerHandler('constructor', () => {}), TypeError);

        await assert.rejects(
            () => queue.enqueue({ type: 'job', payload: JSON.parse('{"__proto__":{"polluted":true}}') }),
            (err) => err instanceof TaskQueueError && err.code === TASK_QUEUE_ERROR_CODES.SERIALIZATION_ERROR
        );

        const circular = { name: 'loop' };
        circular.self = circular;
        await assert.rejects(
            () => queue.enqueue({ type: 'job', payload: circular }),
            (err) => err instanceof TaskQueueError && err.code === TASK_QUEUE_ERROR_CODES.SERIALIZATION_ERROR
        );

        // Handler 回傳不可序列化值應轉為失敗排程
        queue.registerHandler('bad-return', () => ({ fn: () => {} }));
        const { task } = await queue.enqueue({ type: 'bad-return', payload: { ok: 1 }, maxAttempts: 1 });
        const ran = await queue.processOnce();
        assert.equal(ran.status, TASK_STATUS.FAILED);
        assert.equal(ran.id, task.id);
        assert.equal(ran.lastError.code, TASK_QUEUE_ERROR_CODES.SERIALIZATION_ERROR);

        // 安全 DAG 共用參考可正常執行
        const shared = { tag: 'v1' };
        queue.registerHandler('dag-job', (payload) => ({ a: payload.first.tag, b: payload.second.tag }));
        const dagRes = await queue.enqueue({ type: 'dag-job', payload: { first: shared, second: shared } });
        assert.equal(dagRes.deduplicated, false);
        const done = await queue.processOnce();
        assert.equal(done.status, TASK_STATUS.COMPLETED);
        assert.deepEqual(done.result, { a: 'v1', b: 'v1' });

        await queue.dispose();
    });

    it('支援同 namespace 內 idempotencyKey 去重與跨 namespace 完全隔離', async () => {
        const storage = createMemoryTaskStorage();
        const qA = createDurableTaskQueue({ namespace: 'ns-a', storage, useWebLocks: false });
        const qB = createDurableTaskQueue({ namespace: 'ns-b', storage, useWebLocks: false });

        const first = await qA.enqueue({
            type: 'sync',
            idempotencyKey: 'doc-42',
            payload: { seq: 1 },
        });
        const dup = await qA.enqueue({
            type: 'sync',
            idempotencyKey: 'doc-42',
            payload: { seq: 2 },
        });
        const crossNs = await qB.enqueue({
            type: 'sync',
            idempotencyKey: 'doc-42',
            payload: { seq: 3 },
        });

        assert.equal(first.deduplicated, false);
        assert.equal(dup.deduplicated, true);
        assert.equal(dup.task.id, first.task.id);
        assert.equal(dup.task.payload.seq, 1);

        assert.equal(crossNs.deduplicated, false);
        assert.notEqual(crossNs.task.id, first.task.id);

        assert.equal((await qA.listTasks()).length, 1);
        assert.equal((await qB.listTasks()).length, 1);

        await qA.clearNamespace();
        assert.equal((await qA.listTasks()).length, 0);
        assert.equal((await qB.listTasks()).length, 1);

        await qA.dispose();
        await qB.dispose();
    });

    it('3 個並行 Worker 透過原子認領不重複搶到同一任務，且依 priority 由高至低執行', async () => {
        const storage = createMemoryTaskStorage();
        const executionOrder = [];
        const executedByTask = new Map();

        const makeWorker = (workerId) => {
            const q = createDurableTaskQueue({
                namespace: 'concurrent',
                workerId,
                storage,
                useWebLocks: false,
            });
            q.registerHandler('compute', async (payload, ctx) => {
                await new Promise((r) => setTimeout(r, 10));
                executionOrder.push(payload.key);
                executedByTask.set(ctx.taskId, (executedByTask.get(ctx.taskId) || 0) + 1);
                return { workerId, key: payload.key };
            });
            return q;
        };

        const workers = [makeWorker('w1'), makeWorker('w2'), makeWorker('w3')];

        const tLow = await workers[0].enqueue({ type: 'compute', priority: 1, payload: { key: 'low' } });
        const tMid = await workers[0].enqueue({ type: 'compute', priority: 5, payload: { key: 'mid' } });
        const tHigh = await workers[0].enqueue({ type: 'compute', priority: 10, payload: { key: 'high' } });

        // 三個 Worker 同步並發認領：各自只會拿到唯一不同的高優先任務
        const firstWave = await Promise.all(workers.map((w) => w.processOnce()));
        const claimedIds = firstWave.filter(Boolean).map((t) => t.id).sort();
        assert.deepEqual(claimedIds, [tHigh.task.id, tLow.task.id, tMid.task.id].sort());

        for (const id of claimedIds) {
            assert.equal(executedByTask.get(id), 1);
        }

        // 第四次認領已無 pending 任務
        const emptyWave = await Promise.all(workers.map((w) => w.processOnce()));
        assert.deepEqual(emptyWave, [null, null, null]);
        assert.equal(executionOrder.includes('high'), true);

        await Promise.all(workers.map((w) => w.dispose()));
    });

    it('版本化處理器遇到 handlerVersion 不相符時保留任務讓對應版本 Worker 接手', async () => {
        const storage = createMemoryTaskStorage();
        const v1Worker = createDurableTaskQueue({ namespace: 'versioning', workerId: 'v1', storage, useWebLocks: false });
        const v2Worker = createDurableTaskQueue({ namespace: 'versioning', workerId: 'v2', storage, useWebLocks: false });

        v1Worker.registerHandler('migrate', () => ({ handledBy: 1 }), { version: 1 });
        v2Worker.registerHandler('migrate', (payload) => ({ handledBy: 2, v2Field: payload.v2Field }), { version: 2 });

        const mismatches = [];
        v1Worker.on('task-version-mismatch', (d) => mismatches.push(d));

        const { task } = await v2Worker.enqueue({
            type: 'migrate',
            handlerVersion: 2,
            payload: { v2Field: 'ok' },
        });
        assert.equal(task.schemaVersion, TASK_SCHEMA_VERSION);
        assert.equal(task.handlerVersion, 2);

        // v1 Worker 不會誤認領也不會損毀 v2 任務
        const skipped = await v1Worker.processOnce();
        assert.equal(skipped, null);
        assert.equal(mismatches.length, 1);
        assert.equal(mismatches[0].reason, TASK_QUEUE_ERROR_CODES.HANDLER_VERSION_MISMATCH);
        assert.equal((await v1Worker.getTask(task.id)).status, TASK_STATUS.PENDING);
        assert.equal((await v1Worker.getTask(task.id)).attemptCount, 0);

        // v2 Worker 順利認領並完成
        const done = await v2Worker.processOnce();
        assert.equal(done.status, TASK_STATUS.COMPLETED);
        assert.deepEqual(done.result, { handledBy: 2, v2Field: 'ok' });

        await v1Worker.dispose();
        await v2Worker.dispose();
    });

    it('租約過期回收與舊 leaseId 寫入防護（lease fencing）', async () => {
        let nowMs = 10000;
        const clock = () => nowMs;
        const storage = createMemoryTaskStorage();

        const slowWorker = createDurableTaskQueue({
            namespace: 'fencing',
            workerId: 'slow-tab',
            storage,
            leaseDurationMs: 500,
            renewIntervalMs: 0,
            useWebLocks: false,
            now: clock,
        });
        const healthyWorker = createDurableTaskQueue({
            namespace: 'fencing',
            workerId: 'healthy-tab',
            storage,
            leaseDurationMs: 500,
            renewIntervalMs: 0,
            useWebLocks: false,
            now: clock,
        });

        let releaseSlowHandler;
        const slowStarted = new Promise((r) => {
            slowWorker.registerHandler('work', async () => {
                r();
                await new Promise((res) => {
                    releaseSlowHandler = res;
                });
                return { from: 'slow-stale' };
            });
        });

        healthyWorker.registerHandler('work', async () => ({ from: 'healthy-winner' }));

        const { task } = await slowWorker.enqueue({ type: 'work', payload: { id: 1 }, maxAttempts: 3 });
        const slowRun = slowWorker.processOnce();
        await slowStarted;

        // 租約尚未到期前 healthyWorker 不會搶奪
        assert.equal(await healthyWorker.processOnce(), null);

        // 時間推進超過 leaseDurationMs，healthyWorker 回收並完成
        nowMs += 600;
        const reclaimedEvents = [];
        healthyWorker.on('task-reclaimed', (ev) => reclaimedEvents.push(ev));

        const healthyDone = await healthyWorker.processOnce();
        assert.equal(healthyDone.status, TASK_STATUS.COMPLETED);
        assert.equal(healthyDone.attemptCount, 2);
        assert.deepEqual(healthyDone.result, { from: 'healthy-winner' });
        assert.equal(reclaimedEvents.length, 1);
        assert.equal(reclaimedEvents[0].transition, 'pending');

        // 舊 worker 晚點完成，必須被 leaseId fencing 攔截，不可覆蓋已完成結果
        const slowLeaseEvents = [];
        slowWorker.on('lease-lost', (ev) => slowLeaseEvents.push(ev));
        releaseSlowHandler();
        await slowRun;

        assert.equal(slowLeaseEvents.length, 1);
        const finalTask = await healthyWorker.getTask(task.id);
        assert.equal(finalTask.status, TASK_STATUS.COMPLETED);
        assert.deepEqual(finalTask.result, { from: 'healthy-winner' });

        await slowWorker.dispose();
        await healthyWorker.dispose();
    });

    it('Web Locks 孤兒快速回收僅使用 ifAvailable: true，不等待租約屆期即可接手', async () => {
        let nowMs = 50000;
        const clock = () => nowMs;
        const storage = createMemoryTaskStorage();
        const locks = createFakeLocksManager();

        const tabA = createDurableTaskQueue({
            namespace: 'orphan',
            workerId: 'tab-a',
            storage,
            locks,
            useWebLocks: true,
            leaseDurationMs: 10000,
            renewIntervalMs: 0,
            now: clock,
        });
        const tabB = createDurableTaskQueue({
            namespace: 'orphan',
            workerId: 'tab-b',
            storage,
            locks,
            useWebLocks: true,
            leaseDurationMs: 10000,
            renewIntervalMs: 0,
            now: clock,
        });

        let aLockAcquired;
        const aEntered = new Promise((r) => {
            aLockAcquired = r;
        });

        let releaseAHandler;
        tabA.registerHandler('orphan-job', async () => {
            aLockAcquired();
            await new Promise((r) => {
                releaseAHandler = r;
            });
            return { by: 'tab-a' };
        });
        tabB.registerHandler('orphan-job', async () => ({ by: 'tab-b' }));

        const { task } = await tabA.enqueue({ type: 'orphan-job', payload: {} });
        const aPromise = tabA.processOnce();
        await aEntered;

        // 確認 tabA 執行時鎖還在，tabB 探測不會誤搶
        const runningSnapshot = await tabB.getTask(task.id);
        assert.equal(runningSnapshot.lockProtected, true);
        const whileAliveReclaim = await tabB.reclaimExpired();
        assert.equal(whileAliveReclaim.orphansReclaimed, 0);

        // 模擬 tabA 異常關閉瀏覽器強制釋放 Web Lock（租約還有 9 秒才到期）
        locks.forceReleaseForCrash(runningSnapshot.lockName);
        nowMs += 50;

        const orphanReclaim = await tabB.reclaimExpired();
        assert.equal(orphanReclaim.orphansReclaimed, 1);
        assert.equal(orphanReclaim.reclaimed[0].transition, 'pending');

        const done = await tabB.processOnce();
        assert.equal(done.status, TASK_STATUS.COMPLETED);
        assert.deepEqual(done.result, { by: 'tab-b' });

        // 驗證所有鎖呼叫都只帶 ifAvailable: true
        assert.ok(locks.calls.length > 0);
        for (const call of locks.calls) {
            assert.equal(call.options.mode, 'exclusive');
            assert.equal(call.options.ifAvailable, true);
            assert.notEqual(call.options.steal, true);
        }

        releaseAHandler();
        await aPromise;
        await tabA.dispose();
        await tabB.dispose();
    });

    it('指數退避與 maxAttempts 上限（含租約過期達上限直接轉 failed）、cancel 與 retry', async () => {
        let nowMs = 1000;
        const clock = () => nowMs;
        const storage = createMemoryTaskStorage();
        const queue = createDurableTaskQueue({
            namespace: 'retries',
            workerId: 'w1',
            storage,
            useWebLocks: false,
            leaseDurationMs: 200,
            renewIntervalMs: 0,
            backoffBaseMs: 100,
            backoffFactor: 2,
            backoffMaxMs: 1000,
            defaultMaxAttempts: 2,
            now: clock,
        });

        let shouldThrow = true;
        queue.registerHandler('flaky', async (payload, ctx) => {
            if (shouldThrow) {
                throw new Error(`Boom #${ctx.attemptCount}`);
            }
            return { recoveredAtAttempt: ctx.attemptCount, id: payload.id };
        });

        // 1. 指數退避與 maxAttempts 耗盡
        const { task: t1 } = await queue.enqueue({ type: 'flaky', payload: { id: 't1' } });
        const attempt1 = await queue.processOnce();
        assert.equal(attempt1.status, TASK_STATUS.PENDING);
        assert.equal(attempt1.attemptCount, 1);
        assert.equal(attempt1.nextRunAt, 1100);

        // 尚未到 nextRunAt 不會認領
        assert.equal(await queue.processOnce(), null);

        nowMs = 1100;
        const attempt2 = await queue.processOnce();
        assert.equal(attempt2.status, TASK_STATUS.FAILED);
        assert.equal(attempt2.attemptCount, 2);
        assert.ok(attempt2.failedAt);

        // 2. 手動 retry 已失敗任務
        shouldThrow = false;
        await queue.retry(t1.id);
        const retriedDone = await queue.processOnce();
        assert.equal(retriedDone.status, TASK_STATUS.COMPLETED);
        assert.deepEqual(retriedDone.result, { recoveredAtAttempt: 1, id: 't1' });

        // completed 不可再 retry
        await assert.rejects(
            () => queue.retry(t1.id),
            (err) => err instanceof TaskQueueError && err.code === TASK_QUEUE_ERROR_CODES.INVALID_STATE
        );

        // 3. 租約過期時若 attemptCount 已達 maxAttempts 必須直接轉 failed，不可無限重試
        let releaseHang;
        const hangStarted = new Promise((r) => {
            queue.registerHandler('hang', async () => {
                r();
                await new Promise((res) => {
                    releaseHang = res;
                });
            });
        });
        const { task: tHang } = await queue.enqueue({ type: 'hang', payload: {}, maxAttempts: 1 });
        const hangRun = queue.processOnce();
        await hangStarted;
        nowMs += 300;
        const reclaimRes = await queue.reclaimExpired();
        assert.equal(reclaimRes.reclaimed.length, 1);
        assert.equal(reclaimRes.reclaimed[0].transition, 'failed');
        assert.equal(reclaimRes.reclaimed[0].task.status, TASK_STATUS.FAILED);
        assert.equal(reclaimRes.reclaimed[0].task.lastError.code, 'LEASE_EXPIRED_MAX_ATTEMPTS');
        releaseHang();
        await hangRun;

        // 4. cancel 進行中的任務
        let abortedObserved = false;
        let releaseCancellable;
        const cancelStarted = new Promise((r) => {
            queue.registerHandler('cancellable', async (_p, ctx) => {
                r();
                await new Promise((res) => {
                    releaseCancellable = res;
                    ctx.signal.addEventListener(
                        'abort',
                        () => {
                            abortedObserved = true;
                            res();
                        },
                        { once: true }
                    );
                });
            });
        });
        const { task: tCancel } = await queue.enqueue({ type: 'cancellable', payload: {} });
        const cancelRun = queue.processOnce();
        await cancelStarted;
        const cancelRes = await queue.cancel(tCancel.id);
        assert.equal(cancelRes.cancelled, true);
        assert.equal(abortedObserved, true);
        await cancelRun;
        assert.equal((await queue.getTask(tCancel.id)).status, TASK_STATUS.CANCELLED);

        await queue.dispose();
    });

    it('所有 Worker 釋放後重新建立新實例（模擬重載復原）與 purge 保留期限清理', async () => {
        let nowMs = 2000;
        const clock = () => nowMs;
        const sharedStorage = createMemoryTaskStorage();

        // Phase A: Worker 1 認領一半並釋放（模擬頁面關閉／重載）
        const w1 = createDurableTaskQueue({
            namespace: 'reload-ns',
            workerId: 'tab-before-reload',
            storage: sharedStorage,
            leaseDurationMs: 400,
            renewIntervalMs: 0,
            useWebLocks: false,
            now: clock,
        });
        let startedResolve;
        const started = new Promise((r) => {
            startedResolve = r;
        });
        w1.registerHandler('persist-job', async (_payload, ctx) => {
            startedResolve();
            await new Promise((resolve) => {
                ctx.signal.addEventListener('abort', resolve, { once: true });
            });
            return { shouldNotCommit: true };
        });

        const { task: tPending } = await w1.enqueue({ type: 'persist-job', priority: 10, payload: { item: 'B' } });
        const { task: tOldDone } = await w1.enqueue({ type: 'other', priority: 1, payload: { old: true } });

        w1.registerHandler('other', () => ({ ok: true }));
        // 先讓 tPending 處於執行一半狀態（priority 較高或按順序調整）
        const runningPromise = w1.processOnce();
        await started;
        await w1.dispose();
        await runningPromise;

        // 確認 DB 仍完整保留該筆 running 任務與另一筆 pending 任務
        const wAfterReload = createDurableTaskQueue({
            namespace: 'reload-ns',
            workerId: 'tab-after-reload',
            storage: sharedStorage,
            leaseDurationMs: 400,
            renewIntervalMs: 0,
            useWebLocks: false,
            now: clock,
        });
        wAfterReload.registerHandler('persist-job', (payload) => ({ recovered: payload.item }));
        wAfterReload.registerHandler('other', () => ({ ok: true }));

        const staleSnapshot = await wAfterReload.getTask(tPending.id);
        assert.equal(staleSnapshot.status, TASK_STATUS.RUNNING);

        // 先完成原本還 pending 的 tOldDone，再推進時間過租約後復原 tPending
        const doneOld = await wAfterReload.processOnce();
        assert.equal(doneOld.id, tOldDone.id);
        assert.equal(doneOld.status, TASK_STATUS.COMPLETED);

        nowMs += 500;
        const doneRecovered = await wAfterReload.processOnce();
        assert.equal(doneRecovered.id, tPending.id);
        assert.equal(doneRecovered.status, TASK_STATUS.COMPLETED);
        assert.deepEqual(doneRecovered.result, { recovered: 'B' });

        // 驗證 purge retention 邊界：剛完成的保留、超過 retention 的清除
        const firstPurge = await wAfterReload.purge({ olderThanMs: 200 });
        assert.equal(firstPurge.purgedCount, 1); // tOldDone completed at 2000, cutoff 2500 - 200 = 2300 -> purged
        assert.equal(firstPurge.taskIds[0], tOldDone.id);
        assert.ok(await wAfterReload.getTask(tPending.id)); // completed at 2500 -> kept

        nowMs += 300;
        const secondPurge = await wAfterReload.purge({ olderThanMs: 200 });
        assert.equal(secondPurge.purgedCount, 1);
        assert.equal(secondPurge.taskIds[0], tPending.id);
        assert.equal((await wAfterReload.listTasks()).length, 0);

        await wAfterReload.dispose();
    });
});
