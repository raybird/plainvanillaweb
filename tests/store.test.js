import test from 'node:test';
import assert from 'node:assert';

// 建立模擬 LocalStorage
const mockStorage = {
    data: {},
    getItem(key) { return this.data[key] || null; },
    setItem(key, value) { this.data[key] = String(value); },
    clear() { this.data = {}; }
};
global.localStorage = mockStorage;

// 建立模擬 BroadcastChannel 以防測試掛起；記錄送出的訊息，並保留實例以模擬其他分頁傳來的訊息
const channels = [];
const posted = [];
global.BroadcastChannel = class {
    constructor() { channels.push(this); }
    postMessage(data) {
        // 與真實 BroadcastChannel 相同：無法結構化複製（例如 Proxy）時直接拋錯
        posted.push(structuredClone(data));
    }
    close() {}
};
const receiveFromOtherTab = (type, payload) =>
    channels[0].onmessage({ data: { type, payload, sender: 'other-tab', timestamp: Date.now() } });

// 延遲載入受測模組
const { Store } = await import('../lib/store.js');

test('Store 測試環境初始化', (t) => {
    mockStorage.clear();
});

test('Store 狀態變更應觸發事件', async (t) => {
    mockStorage.clear();
    const store = new Store({ count: 0 }, 'test_storage');
    let eventReceived = false;

    store.addEventListener('change', (e) => {
        if (e.detail.key === 'count') eventReceived = true;
    });

    store.state.count = 1;
    assert.strictEqual(eventReceived, true);
});

test('Store 應正確同步至 LocalStorage', async (t) => {
    mockStorage.clear();
    const storageKey = 'sync_test';
    const store = new Store({ theme: 'light' }, storageKey);
    
    store.state.theme = 'dark';
    
    const savedData = JSON.parse(mockStorage.getItem(storageKey));
    assert.strictEqual(savedData.theme, 'dark');
});

test('巢狀屬性寫入應持久化、以頂層 key 發送事件並廣播純物件', () => {
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
    assert.deepStrictEqual(posted.at(-1).payload, {
        key: 'userProfile',
        value: { name: 'B', tags: ['x', 'y'] }
    });
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
});

test('刪除巢狀屬性應持久化', () => {
    mockStorage.clear();
    const store = new Store({ profile: { name: 'A', bio: 'x' } }, 'delete_test');
    delete store.state.profile.bio;
    const saved = JSON.parse(mockStorage.getItem('delete_test'));
    assert.deepStrictEqual(saved.profile, { name: 'A' });
});

test('收到其他分頁的 sync_snapshot 應套用快照並標記為遠端快照', () => {
    mockStorage.clear();
    const store = new Store({ count: 0, theme: 'light' }, 'snapshot_test');
    const events = [];
    store.on('change', (detail) => events.push(detail));

    receiveFromOtherTab('sync_snapshot', { count: 5 });

    assert.strictEqual(store.state.count, 5);
    assert.strictEqual(store.state.theme, 'light');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].isSnapshot, true);
    assert.strictEqual(events[0].remote, true);
    assert.strictEqual(events[0].sender, 'other-tab');
});
