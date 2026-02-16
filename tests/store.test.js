import test from 'node:test';
import assert from 'node:assert';

// 在載入 Store 之前先進行環境模擬
global.localStorage = {
    data: {},
    getItem(key) { return this.data[key] || null; },
    setItem(key, value) { this.data[key] = String(value); }
};

// 現在載入受測模組
const { Store } = await import('../lib/store.js');

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

test('Store 應正確儲存並讀取數值', async (t) => {
    const store = new Store({ theme: 'light' });
    store.state.theme = 'dark';
    assert.strictEqual(store.state.theme, 'dark');
    
    // 驗證持久化是否生效
    assert.strictEqual(global.localStorage.getItem('app_state'), JSON.stringify({ theme: 'dark' }));
});
