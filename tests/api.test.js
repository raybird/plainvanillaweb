import test from 'node:test';
import assert from 'node:assert';

// fetch / AbortController 在 Node 22 為全域內建；以 stub 取代 fetch 控制回應。
const { APIService } = await import('../lib/api-service.js');

const originalFetch = global.fetch;

test.afterEach(() => { global.fetch = originalFetch; });

test('fetchWithCancel 成功時回傳 JSON', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 1 }) });
    const api = new APIService();
    const data = await api.fetchWithCancel('users', '/api/users');
    assert.deepStrictEqual(data, { id: 1 });
});

test('回應非 ok 時拋出 HTTP 錯誤', async () => {
    global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    const api = new APIService();
    await assert.rejects(() => api.fetchWithCancel('x', '/missing'), /HTTP Error: 404/);
});

test('請求被取消 (AbortError) 時回傳 null 而非拋錯', async () => {
    global.fetch = async () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
    };
    const api = new APIService();
    assert.strictEqual(await api.fetchWithCancel('x', '/slow'), null);
});

test('相同 key 的新請求會取消前一個 controller', async () => {
    let firstSignal;
    let resolveFirst;
    global.fetch = (url, opts) => {
        if (!firstSignal) {
            firstSignal = opts.signal;
            return new Promise((res) => { resolveFirst = () => res({ ok: true, status: 200, json: async () => 'first' }); });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => 'second' });
    };

    const api = new APIService();
    const p1 = api.fetchWithCancel('search', '/q?a');   // 進行中
    const p2 = api.fetchWithCancel('search', '/q?b');   // 應觸發第一個 abort

    assert.strictEqual(firstSignal.aborted, true);
    resolveFirst();
    await Promise.all([p1, p2]);
});

test('請求完成後清除 controller', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    const api = new APIService();
    await api.fetchWithCancel('k', '/done');
    assert.strictEqual(api._controllers.has('k'), false);
});
