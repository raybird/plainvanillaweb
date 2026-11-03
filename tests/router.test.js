import test from 'node:test';
import assert from 'node:assert';

// router.js 載入時會建立 RouterService 單例並監聽 hashchange，先補上最小 window stub
global.window = { addEventListener() {}, location: { hash: '' } };
const { matchRoute } = await import('../lib/router.js');

test('* 符合所有路徑', () => {
    assert.deepStrictEqual(matchRoute('*', '/anything/here'), {});
});

test('exact 必須完全相符', () => {
    assert.deepStrictEqual(matchRoute('/', '/', { exact: true }), {});
    assert.strictEqual(matchRoute('/', '/docs', { exact: true }), null);
    assert.deepStrictEqual(matchRoute('/lab/webgpu', '/lab/webgpu', { exact: true }), {});
    assert.strictEqual(matchRoute('/lab', '/lab/', { exact: true }), null);
    assert.deepStrictEqual(matchRoute('/lab/', '/lab/', { exact: true }), {});
});

test('非 exact 以路徑段為界做前綴比對', () => {
    assert.deepStrictEqual(matchRoute('/docs', '/docs'), {});
    assert.deepStrictEqual(matchRoute('/docs', '/docs/router'), {});
    assert.strictEqual(matchRoute('/docs', '/docsx'), null);
    assert.deepStrictEqual(matchRoute('/', '/anything'), {});
});

test('結尾 /* 符合前綴本身與其底下的任何路徑', () => {
    assert.deepStrictEqual(matchRoute('/lab/*', '/lab'), {});
    assert.deepStrictEqual(matchRoute('/lab/*', '/lab/'), {});
    assert.deepStrictEqual(matchRoute('/lab/*', '/lab/unknown/deep'), {});
    assert.strictEqual(matchRoute('/lab/*', '/labx'), null);
});

test(':name 取出路徑參數並解碼', () => {
    assert.deepStrictEqual(matchRoute('/docs/:id', '/docs/web%20audio', { exact: true }), { id: 'web audio' });
    assert.deepStrictEqual(matchRoute('/u/:user/post/:post', '/u/ray/post/42', { exact: true }), { user: 'ray', post: '42' });
    assert.strictEqual(matchRoute('/docs/:id', '/docs/', { exact: true }), null);
    // 解碼失敗時保留原值，不拋錯
    assert.deepStrictEqual(matchRoute('/docs/:id', '/docs/%E0%A4%A', { exact: true }), { id: '%E0%A4%A' });
});

test('比對不分大小寫，路徑中的特殊字元照字面比對', () => {
    assert.deepStrictEqual(matchRoute('/Lab/WebGPU', '/lab/webgpu', { exact: true }), {});
    assert.strictEqual(matchRoute('/a.b', '/axb', { exact: true }), null);
    assert.deepStrictEqual(matchRoute('/a.b', '/a.b', { exact: true }), {});
    assert.deepStrictEqual(matchRoute('/c++', '/c++', { exact: true }), {});
});
