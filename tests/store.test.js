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
