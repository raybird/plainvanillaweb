import test from 'node:test';
import assert from 'node:assert/strict';
import { isKioskMode, setKioskMode } from '../app/kiosk.js';
import {
    buildSolutionHash,
    createTeardown,
    detectFeatures,
    resetSolutionData,
    resolveNamespace,
    solutionStorageName,
} from '../components/pages/solutions/solution-kit.js';

test('isKioskMode 只認 hash query 的 kiosk=1', () => {
    assert.equal(isKioskMode('#/solutions/pos/kitchen?kiosk=1'), true);
    assert.equal(isKioskMode('#/solutions?ns=a&kiosk=1'), true);
    assert.equal(isKioskMode('#/solutions?kiosk=0'), false);
    assert.equal(isKioskMode('#/solutions?kiosk'), false);
    assert.equal(isKioskMode('#/solutions'), false);
    assert.equal(isKioskMode(''), false);
    assert.equal(isKioskMode(undefined), false);
});

test('setKioskMode 保留路徑與其他參數', () => {
    assert.equal(setKioskMode('#/solutions/pos?ns=t1', true), '#/solutions/pos?ns=t1&kiosk=1');
    assert.equal(setKioskMode('#/solutions/pos?ns=t1&kiosk=1', false), '#/solutions/pos?ns=t1');
    assert.equal(setKioskMode('#/solutions?kiosk=1', false), '#/solutions');
    assert.equal(setKioskMode('', true), '#/?kiosk=1');
    assert.equal(setKioskMode('#/a?kiosk=1', true), '#/a?kiosk=1');
});

test('resolveNamespace 預設 solution-<slug>，合法的 ns 可覆寫', () => {
    assert.equal(resolveNamespace('pos', '#/solutions/pos'), 'solution-pos');
    assert.equal(resolveNamespace('pos', '#/solutions/pos?ns=e2e-1'), 'e2e-1');
    assert.equal(resolveNamespace('pos', '#/solutions/pos?ns=%20'), 'solution-pos');
    assert.equal(resolveNamespace('pos', '#/solutions/pos?ns=a%2Fb'), 'solution-pos', '含 / 的 ns 不合法，改用預設值');
    assert.equal(resolveNamespace('pos', `#/solutions/pos?ns=${'x'.repeat(65)}`), 'solution-pos');
    assert.throws(() => resolveNamespace('POS', '#/'), TypeError);
});

test('solutionStorageName 由 namespace 推導並拒絕不合法輸入', () => {
    assert.equal(solutionStorageName('solution-pos', 'orders'), 'vanilla_solution:solution-pos:orders');
    assert.throws(() => solutionStorageName('a/b', 'orders'), TypeError);
    assert.throws(() => solutionStorageName('solution-pos', 'Orders'), TypeError);
});

test('buildSolutionHash 只接受 /solutions/ 底下的路徑', () => {
    assert.equal(buildSolutionHash('/solutions/pos/kitchen'), '#/solutions/pos/kitchen');
    assert.equal(buildSolutionHash('/solutions/pos/kitchen', { ns: 't1', kiosk: true }), '#/solutions/pos/kitchen?ns=t1&kiosk=1');
    assert.throws(() => buildSolutionHash('/lab/pos'), TypeError);
    assert.throws(() => buildSolutionHash('/solutions/pos?x=1'), TypeError);
    assert.throws(() => buildSolutionHash('/solutions/pos', { ns: 'a b' }), TypeError);
});

test('detectFeatures 把拋錯的偵測視為不支援', () => {
    const result = detectFeatures({
        yes: () => true,
        no: () => 0,
        broken: () => { throw new Error('boom'); },
    });
    assert.deepEqual(result.supported, { yes: true, no: false, broken: false });
    assert.deepEqual(result.missing, ['no', 'broken']);
});

test('createTeardown 依相反順序釋放、錯誤不中斷', async () => {
    const teardown = createTeardown();
    const order = [];
    teardown.add(() => order.push('first'));
    teardown.add(() => { throw new Error('second failed'); });
    teardown.add(async () => order.push('third'));
    assert.equal(teardown.size, 3);
    const errors = await teardown.run();
    assert.deepEqual(order, ['third', 'first']);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'second failed');
    assert.equal(teardown.size, 0);
    assert.deepEqual(await teardown.run(), [], '重複 run 不會再執行已釋放的項目');
    assert.throws(() => teardown.add('nope'), TypeError);
});

test('createTeardown 釋放後才登記的資源立即釋放（非同步初始化中途離開）', async () => {
    const teardown = createTeardown();
    const released = [];
    assert.equal(teardown.disposed, false);
    assert.equal(teardown.signal.aborted, false);
    // 模擬：初始化正在等鎖時頁面離開
    const lockGranted = new Promise((resolve) => setTimeout(resolve, 10));
    const init = (async () => {
        await lockGranted;
        teardown.add(() => released.push('lock'));
        if (teardown.disposed) return 'aborted';
        teardown.add(() => released.push('peers'));
        return 'started';
    })();
    await teardown.run();
    assert.equal(teardown.disposed, true);
    assert.equal(teardown.signal.aborted, true);
    assert.equal(await init, 'aborted', '初始化在 await 之後看到已釋放就停止');
    assert.deepEqual(released, ['lock'], '晚到的鎖立即釋放，後續資源不再建立');
    teardown.add(() => { throw new Error('late failure'); });
    teardown.add(async () => { throw new Error('late async failure'); });
    assert.equal(teardown.size, 0, '釋放後不再累積');
});

test('resetSolutionData 刪除資料庫與 key、回報 blocked 並執行額外清理', async (t) => {
    const removed = [];
    const deleted = [];
    const originalIDB = globalThis.indexedDB;
    const originalStorage = globalThis.localStorage;
    t.after(() => {
        globalThis.indexedDB = originalIDB;
        globalThis.localStorage = originalStorage;
    });
    globalThis.localStorage = { removeItem: (key) => removed.push(key) };
    globalThis.indexedDB = {
        deleteDatabase(name) {
            const request = {};
            deleted.push(name);
            // 'stuck' 模擬其他視窗沒關連線：永遠不觸發 success
            if (name !== 'stuck') setTimeout(() => request.onsuccess?.(), 0);
            return request;
        },
    };
    let cleaned = false;
    const report = await resetSolutionData({
        databases: ['vanilla_solution:t:orders', 'stuck'],
        storageKeys: ['vanilla_solution:t:settings'],
        cleanups: [() => { cleaned = true; }, () => { throw new Error('cleanup failed'); }],
        timeoutMs: 20,
    });
    assert.deepEqual(deleted, ['vanilla_solution:t:orders', 'stuck']);
    assert.deepEqual(report.databases, { 'vanilla_solution:t:orders': 'deleted', stuck: 'blocked' });
    assert.deepEqual(removed, ['vanilla_solution:t:settings']);
    assert.deepEqual(report.storageKeys, ['vanilla_solution:t:settings']);
    assert.equal(cleaned, true);
    assert.equal(report.errors.length, 1);

    delete globalThis.indexedDB;
    const unsupported = await resetSolutionData({ databases: ['x'] });
    assert.deepEqual(unsupported.databases, { x: 'unsupported' });
});
