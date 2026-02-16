import test from 'node:test';
import assert from 'node:assert';
import { Store } from '../lib/store.js';

// 模擬 LocalStorage (Node 環境下無此全域變數)
global.localStorage = {
    getItem: () => null,
    setItem: () => {}
};

test('Store 狀態變更應觸發事件', async (t) => {
    const store = new Store({ count: 0 });
    let eventReceived = false;

    store.addEventListener('change', (e) => {
        if (e.detail.key === 'count' && e.detail.value === 1) {
            eventReceived = true;
        }
    });

    store.state.count = 1;
    assert.strictEqual(eventReceived, true, '應收到變更事件');
});

test('Store 應正確儲存數值', async (t) => {
    const store = new Store({ name: 'init' });
    store.state.name = 'updated';
    assert.strictEqual(store.state.name, 'updated');
});
