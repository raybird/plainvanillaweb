import test from 'node:test';
import assert from 'node:assert';

// 建立模擬 LocalStorage
const mockStorage = {
    data: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
    setItem(key, value) { this.data[key] = String(value); },
    removeItem(key) { delete this.data[key]; },
    clear() { this.data = {}; }
};
global.localStorage = mockStorage;

// 建立模擬 BroadcastChannel 以防測試掛起；記錄送出的訊息，並保留實例以模擬其他分頁傳來的訊息
const channels = [];
const posted = [];
class MockBroadcastChannel {
    constructor(name) {
        this.name = name;
        this.onmessage = null;
        this.onmessageerror = null;
        channels.push(this);
    }
    postMessage(data) {
        // 與真實 BroadcastChannel 相同：無法結構化複製（例如 Proxy）時直接拋錯
        posted.push(structuredClone(data));
    }
    close() {}
}
global.BroadcastChannel = MockBroadcastChannel;

const receiveFromOtherTab = (type, payload, { sender = 'other-tab', extra = {} } = {}) =>
    channels[0].onmessage({ data: { type, payload, sender, timestamp: Date.now(), ...extra } });

/** 建立一對記憶體內雙向連通的模擬 transport，用來驗證真實雙分頁 Store 互動 */
function createPairedTransports() {
    let otherA = null;
    let otherB = null;
    const transportA = {
        onmessage: null,
        onmessageerror: null,
        postMessage(data) {
            const cloned = structuredClone(data);
            otherB?.onmessage?.({ data: cloned });
        },
        close() {}
    };
    const transportB = {
        onmessage: null,
        onmessageerror: null,
        postMessage(data) {
            const cloned = structuredClone(data);
            otherA?.onmessage?.({ data: cloned });
        },
        close() {}
    };
    otherA = transportA;
    otherB = transportB;
    return [transportA, transportB];
}

// 延遲載入受測模組
const { Store } = await import('../lib/store.js');
const { BroadcastService } = await import('../lib/broadcast-channel.js');

test('Store 測試環境初始化', () => {
    mockStorage.clear();
});

test('Store 狀態變更應觸發事件', () => {
    mockStorage.clear();
    const store = new Store({ count: 0 }, 'test_storage');
    let eventReceived = false;

    store.addEventListener('change', (e) => {
        if (e.detail.key === 'count') eventReceived = true;
    });

    store.state.count = 1;
    assert.strictEqual(eventReceived, true);
    store.dispose();
});

test('Store 應正確同步至 LocalStorage', () => {
    mockStorage.clear();
    const storageKey = 'sync_test';
    const store = new Store({ theme: 'light' }, storageKey);

    store.state.theme = 'dark';

    const savedData = JSON.parse(mockStorage.getItem(storageKey));
    assert.strictEqual(savedData.theme, 'dark');
    store.dispose();
});

test('巢狀屬性寫入應持久化、以頂層 key 發送事件並廣播含 storageKey 的純物件', () => {
    mockStorage.clear();
    posted.length = 0;
    const store = new Store({ userProfile: { name: 'A', tags: ['x'] } }, 'nested_test');
    const events = [];
    store.on('change', (detail) => events.push(detail));

    store.state.userProfile.name = 'B';
    store.state.userProfile.tags.push('y');

    const saved = JSON.parse(mockStorage.getItem('nested_test'));
    assert.strictEqual(saved.userProfile.name, 'B');
    assert.deepStrictEqual(saved.userProfile.tags, ['x', 'y']);
    assert.deepStrictEqual(events.map(e => e.key), ['userProfile', 'userProfile']);
    const prevPayload = posted.at(-2).payload;
    const lastPayload = posted.at(-1).payload;
    assert.ok(Number.isSafeInteger(lastPayload.clock) && lastPayload.clock > prevPayload.clock);
    assert.deepStrictEqual(lastPayload, {
        storageKey: 'nested_test',
        key: 'userProfile',
        value: { name: 'B', tags: ['x', 'y'] },
        deleted: false,
        clock: lastPayload.clock,
    });
    store.dispose();
});

test('巢狀 Proxy 身分穩定，且寫回 Proxy 時底層存的是純物件', () => {
    mockStorage.clear();
    posted.length = 0;
    const store = new Store({ a: { v: 1 }, b: null }, 'identity_test');

    assert.strictEqual(store.state.a, store.state.a);

    store.state.b = store.state.a; // 若底層存入 Proxy，postMessage 的 structuredClone 會拋錯
    assert.strictEqual(store._baseState.b, store._baseState.a);

    // 同一物件掛在兩個頂層屬性下時，從 b 修改應回報 key 為 b
    const keys = [];
    store.on('change', (detail) => keys.push(detail.key));
    store.state.b.v = 2;
    assert.deepStrictEqual(keys, ['b']);
    store.dispose();
});

test('刪除巢狀屬性應持久化', () => {
    mockStorage.clear();
    const store = new Store({ profile: { name: 'A', bio: 'x' } }, 'delete_test');
    delete store.state.profile.bio;
    const saved = JSON.parse(mockStorage.getItem('delete_test'));
    assert.deepStrictEqual(saved.profile, { name: 'A' });
    store.dispose();
});

test('收到其他分頁的 sync_snapshot 應套用快照並標記為遠端快照', () => {
    mockStorage.clear();
    const store = new Store({ count: 0, theme: 'light' }, 'snapshot_test');
    const events = [];
    store.on('change', (detail) => events.push(detail));

    receiveFromOtherTab('sync_snapshot', {
        storageKey: 'snapshot_test',
        snapshot: { count: 5 },
        replace: false,
        clock: 1,
    });

    assert.strictEqual(store.state.count, 5);
    assert.strictEqual(store.state.theme, 'light');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].isSnapshot, true);
    assert.strictEqual(events[0].replace, false);
    assert.strictEqual(events[0].remote, true);
    assert.strictEqual(events[0].sender, 'other-tab');
    store.dispose();
});

test('不同 storageKey 的 Store 執行寫入、刪除與快照互不污染', () => {
    mockStorage.clear();
    const [tA, tB] = createPairedTransports();
    const bcA = new BroadcastService('shared_store_ch', { transport: tA, tabId: 'tab-a' });
    const bcB = new BroadcastService('shared_store_ch', { transport: tB, tabId: 'tab-b' });

    const storeA1 = new Store({ count: 0, keep: 'yes' }, 'store_alpha', { broadcast: bcA });
    const storeB1 = new Store({ count: 0, keep: 'yes' }, 'store_alpha', { broadcast: bcB });
    const storeB2 = new Store({ count: 100, keep: 'intact' }, 'store_beta', { broadcast: bcB });

    storeA1.state.count = 42;
    delete storeA1.state.keep;
    assert.strictEqual(storeB1.state.count, 42);
    assert.strictEqual('keep' in storeB1.state, false);
    assert.strictEqual(storeB2.state.count, 100);
    assert.strictEqual(storeB2.state.keep, 'intact');

    storeA1.applySnapshot({ count: 7 });
    assert.strictEqual(storeB1.state.count, 7);
    assert.strictEqual(storeB2.state.count, 100);

    storeA1.dispose();
    storeB1.dispose();
    storeB2.dispose();
    bcA.close();
    bcB.close();
});

test('頂層屬性刪除在遠端執行 delete 且同步清理 localStorage', () => {
    mockStorage.clear();
    const [tA, tB] = createPairedTransports();
    const bcA = new BroadcastService('del_ch', { transport: tA, tabId: 'tab-a' });
    const bcB = new BroadcastService('del_ch', { transport: tB, tabId: 'tab-b' });

    const storeA = new Store({ a: 1, b: 2 }, 'del_top', { broadcast: bcA });
    const storeB = new Store({ a: 1, b: 2 }, 'del_top', { broadcast: bcB });
    const events = [];
    storeB.on('change', (d) => events.push(d));

    delete storeA.state.b;

    assert.strictEqual('b' in storeB._baseState, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(storeB._baseState, 'b'), false);
    assert.strictEqual(events.at(-1).deleted, true);
    assert.strictEqual(events.at(-1).value, undefined);

    const saved = JSON.parse(mockStorage.getItem('del_top'));
    assert.deepStrictEqual(saved, { a: 1 });

    storeA.dispose();
    storeB.dispose();
    bcA.close();
    bcB.close();
});

test('applySnapshot 預設 replace: true 會移除快照外既有鍵，replace: false 則保留', () => {
    mockStorage.clear();
    const [tA, tB] = createPairedTransports();
    const bcA = new BroadcastService('snap_ch', { transport: tA, tabId: 'tab-a' });
    const bcB = new BroadcastService('snap_ch', { transport: tB, tabId: 'tab-b' });

    const storeA = new Store({ a: 1, extra: 'remove-me' }, 'snap_replace', { broadcast: bcA });
    const storeB = new Store({ a: 1, extra: 'remove-me' }, 'snap_replace', { broadcast: bcB });

    storeA.applySnapshot({ a: 2, added: true });
    assert.strictEqual('extra' in storeB._baseState, false);
    assert.deepStrictEqual(storeB._baseState, { a: 2, added: true });

    storeA.applySnapshot({ a: 3 }, { replace: false });
    assert.deepStrictEqual(storeB._baseState, { a: 3, added: true });

    storeA.dispose();
    storeB.dispose();
    bcA.close();
    bcB.close();
});

test('舊協定無 storageKey 訊息僅 app_state 或 acceptLegacy: true 接受，自訂 Store 拒絕', () => {
    mockStorage.clear();
    const appLike = new Store({ count: 0 }, 'app_state');
    const custom = new Store({ count: 0 }, 'custom_isolated');
    const explicitLegacy = new Store({ count: 0 }, 'custom_legacy', { acceptLegacy: true });

    receiveFromOtherTab('sync_state', { key: 'count', value: 88 });
    assert.strictEqual(appLike.state.count, 88);
    assert.strictEqual(custom.state.count, 0);
    assert.strictEqual(explicitLegacy.state.count, 88);

    receiveFromOtherTab('sync_snapshot', { count: 99 });
    assert.strictEqual(appLike.state.count, 99);
    assert.strictEqual(custom.state.count, 0);
    assert.strictEqual(explicitLegacy.state.count, 99);

    appLike.dispose();
    custom.dispose();
    explicitLegacy.dispose();
});

test('應阻擋畸形 payload 與原型鏈污染鍵名', () => {
    mockStorage.clear();
    const store = new Store({ safe: 'ok' }, 'security_test');

    assert.throws(() => { store.state.__proto__ = { polluted: true }; }, TypeError);
    assert.throws(() => { store.state.constructor = 'bad'; }, TypeError);
    assert.strictEqual(({}).polluted, undefined);

    // 遠端畸形與危險鍵應被忽略
    receiveFromOtherTab('sync_state', null);
    receiveFromOtherTab('sync_state', { storageKey: 'security_test', key: '__proto__', value: { p: 1 } });
    receiveFromOtherTab('sync_state', { storageKey: 'security_test', key: 'prototype', value: {} });
    receiveFromOtherTab('sync_snapshot', { storageKey: 'security_test', snapshot: JSON.parse('{"__proto__":{"polluted":true},"ok":1}') });

    assert.strictEqual(({}).polluted, undefined);
    assert.strictEqual(store.state.ok, 1);
    store.dispose();
});

test('store.dispose() 後不再接收遠端更新且監聽器已清除', () => {
    mockStorage.clear();
    const [tA, tB] = createPairedTransports();
    const bcA = new BroadcastService('disp_ch', { transport: tA, tabId: 'tab-a' });
    const bcB = new BroadcastService('disp_ch', { transport: tB, tabId: 'tab-b' });

    const storeA = new Store({ val: 1 }, 'disp_key', { broadcast: bcA });
    const storeB = new Store({ val: 1 }, 'disp_key', { broadcast: bcB });
    let count = 0;
    storeB.on('change', () => { count += 1; });

    storeB.dispose();
    storeA.state.val = 2;

    assert.strictEqual(storeB.state.val, 1);
    assert.strictEqual(count, 0);

    storeA.dispose();
    bcA.close();
    bcB.close();
});

test('並行更新：不同鍵寫入互相保留且 localStorage 一致；同鍵衝突依 LWW 決定性收斂', () => {
    mockStorage.clear();
    // 模擬延遲遞送以重現訊息尚未抵達前的雙邊並行寫入
    const queueAtoB = [];
    const queueBtoA = [];
    const tA = {
        onmessage: null,
        postMessage(d) { queueAtoB.push(structuredClone(d)); },
        close() {}
    };
    const tB = {
        onmessage: null,
        postMessage(d) { queueBtoA.push(structuredClone(d)); },
        close() {}
    };
    const flush = () => {
        while (queueAtoB.length || queueBtoA.length) {
            while (queueAtoB.length) tB.onmessage?.({ data: queueAtoB.shift() });
            while (queueBtoA.length) tA.onmessage?.({ data: queueBtoA.shift() });
        }
    };

    const bcA = new BroadcastService('lww_ch', { transport: tA, tabId: 'tab-a' });
    const bcB = new BroadcastService('lww_ch', { transport: tB, tabId: 'tab-b' });

    const storeA = new Store({ init: true }, 'concurrent_key', { broadcast: bcA });
    const storeB = new Store({ init: true }, 'concurrent_key', { broadcast: bcB });

    // 1. 同時修改不同鍵（flush 前各自寫入共用 localStorage）
    storeA.state.fromA = 'A1';
    storeB.state.fromB = 'B1';
    flush();

    assert.strictEqual(storeA.state.fromA, 'A1');
    assert.strictEqual(storeA.state.fromB, 'B1');
    assert.strictEqual(storeB.state.fromA, 'A1');
    assert.strictEqual(storeB.state.fromB, 'B1');
    assert.deepStrictEqual(JSON.parse(mockStorage.getItem('concurrent_key')), {
        init: true,
        fromA: 'A1',
        fromB: 'B1',
    });

    // 2. 同時修改同一鍵（tab-b > tab-a 於同 clock 時勝出，兩端必須收斂到同一個值）
    storeA.state.shared = 'win-A?';
    storeB.state.shared = 'win-B!';
    flush();

    assert.strictEqual(storeA.state.shared, 'win-B!');
    assert.strictEqual(storeB.state.shared, 'win-B!');
    assert.strictEqual(JSON.parse(mockStorage.getItem('concurrent_key')).shared, 'win-B!');

    storeA.dispose();
    storeB.dispose();
    bcA.close();
    bcB.close();
});

test('不支援 BroadcastChannel 時 Store 本機與 localStorage 仍正常運作', () => {
    mockStorage.clear();
    const OriginalBC = global.BroadcastChannel;
    global.BroadcastChannel = undefined;
    try {
        const noBcService = new BroadcastService('no_bc_store');
        assert.strictEqual(noBcService.supported, false);

        const store = new Store({ count: 0 }, 'no_bc_key', { broadcast: noBcService });
        store.state.count = 5;
        assert.strictEqual(store.state.count, 5);
        assert.strictEqual(JSON.parse(mockStorage.getItem('no_bc_key')).count, 5);

        store.dispose();
        noBcService.close();
    } finally {
        global.BroadcastChannel = OriginalBC;
    }
});

test('Blocker #1 回歸：先有分頁連續寫入後，新開或重整的分頁修改同鍵時既有分頁必須接受', () => {
    mockStorage.clear();
    const [tA, tB] = createPairedTransports();
    const bcA = new BroadcastService('late_ch', { transport: tA, tabId: 'tab-a' });
    const bcB = new BroadcastService('late_ch', { transport: tB, tabId: 'tab-b' });

    const storeA = new Store({ count: 0 }, 'late_join_key', { broadcast: bcA });
    storeA.state.count = 1;
    storeA.state.count = 2;
    storeA.state.count = 3;

    // 同毫秒內新建立分頁 B（模擬重整或新分頁開啟）
    const storeB = new Store({ count: 0 }, 'late_join_key', { broadcast: bcB });
    assert.strictEqual(storeB.state.count, 3);

    storeB.state.count = 4;
    assert.strictEqual(storeA.state.count, 4);
    assert.strictEqual(JSON.parse(mockStorage.getItem('late_join_key')).count, 4);

    storeA.dispose();
    storeB.dispose();
    bcA.close();
    bcB.close();
});

test('Medium #1 回歸：LWW 落敗方覆寫 localStorage 後離線，勝出方收到落敗廣播必須修復 localStorage；replace: false 不洗掉併行鍵', () => {
    mockStorage.clear();
    const queueAtoZ = [];
    const queueZtoA = [];
    const tZ = {
        onmessage: null,
        postMessage(d) { queueZtoA.push(structuredClone(d)); },
        close() {}
    };
    const tA = {
        onmessage: null,
        postMessage(d) { queueAtoZ.push(structuredClone(d)); },
        close() {}
    };
    const bcZ = new BroadcastService('repair_ch', { transport: tZ, tabId: 'tab-z' });
    const bcA = new BroadcastService('repair_ch', { transport: tA, tabId: 'tab-a' });

    const storeZ = new Store({ x: 'init' }, 'repair_key', { broadcast: bcZ });
    const storeA = new Store({ x: 'init' }, 'repair_key', { broadcast: bcA });

    // 先由勝出方 (tab-z) 寫入，再由落敗方 (tab-a) 寫入覆寫 localStorage 後立刻 dispose
    const origNow = Date.now;
    const fixedNow = origNow();
    Date.now = () => fixedNow;
    try {
        storeZ.state.x = 'winner';
        storeA.state.x = 'loser';
    } finally {
        Date.now = origNow;
    }
    assert.strictEqual(JSON.parse(mockStorage.getItem('repair_key')).x, 'loser');
    storeA.dispose();

    // tab-z 收到 tab-a 的落敗廣播後，應拒收並主動把 localStorage 修回 'winner'
    while (queueAtoZ.length) tZ.onmessage?.({ data: queueAtoZ.shift() });
    assert.strictEqual(storeZ.state.x, 'winner');
    assert.strictEqual(JSON.parse(mockStorage.getItem('repair_key')).x, 'winner');

    // 另一分頁先在 localStorage 寫入併行鍵 kOther（模擬廣播尚未送達），storeZ 呼叫 replace: false 不應洗掉 kOther
    const storeOther = new Store({}, 'repair_key', { sync: false });
    storeOther.state.kOther = 'preserved';
    storeOther.dispose();

    storeZ.applySnapshot({ x: 'winner-2' }, { replace: false });
    const persisted = JSON.parse(mockStorage.getItem('repair_key'));
    assert.strictEqual(persisted.x, 'winner-2');
    assert.strictEqual(persisted.kOther, 'preserved');

    storeZ.dispose();
    bcZ.close();
    bcA.close();
});

test('Medium #2 回歸：空快照全部被較新本機版本拒收時，不應誤發 change 事件或清除狀態', () => {
    mockStorage.clear();
    const store = new Store({ x: 'init' }, 'empty_snap_reject');
    store.state.x = 'fresh';
    const events = [];
    store.on('change', (d) => events.push(d));

    receiveFromOtherTab('sync_snapshot', {
        storageKey: 'empty_snap_reject',
        snapshot: {},
        replace: true,
        clock: 1,
    });

    assert.strictEqual(store.state.x, 'fresh');
    assert.strictEqual(events.length, 0);
    store.dispose();
});

test('Minor 回歸：Symbol 鍵拋 TypeError；巢狀外部物件會清理 __proto__ 且保留內部 Proxy 別名語意', () => {
    mockStorage.clear();
    const store = new Store({ a: { v: 1 }, b: null }, 'minor_safety');
    const sym = Symbol('bad');
    assert.throws(() => { store.state[sym] = 1; }, TypeError);
    assert.throws(() => { delete store.state[sym]; }, TypeError);

    store.state.b = store.state.a;
    assert.strictEqual(store._baseState.b, store._baseState.a);

    const dirty = JSON.parse('{"__proto__":{"polluted":true},"ok":42}');
    store.state.ext = dirty;
    assert.strictEqual(Object.prototype.hasOwnProperty.call(store._baseState.ext, '__proto__'), false);
    assert.strictEqual(store._baseState.ext.ok, 42);
    assert.strictEqual(({}).polluted, undefined);
    // 外部物件修改不應無聲污染底層狀態
    dirty.ok = 999;
    assert.strictEqual(store._baseState.ext.ok, 42);

    store.dispose();
});
