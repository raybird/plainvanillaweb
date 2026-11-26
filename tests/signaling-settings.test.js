import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignalingServer } from '../server/signaling.mjs';
import { VERSION } from '../lib/version.js';
import {
    cdnBase,
    classifySigParam,
    clearSignalingUrl,
    describeTestFailure,
    loadSignalingUrl,
    readSigParam,
    saveSignalingUrl,
    selfHostCommands,
    signalingStorageKey,
    testSignalingConnection,
} from '../components/pages/solutions/pos-v2/signaling-settings.js';

class MemoryStorage {
    constructor() {
        this.map = new Map();
    }
    getItem(key) {
        return this.map.has(key) ? this.map.get(key) : null;
    }
    setItem(key, value) {
        this.map.set(key, String(value));
    }
    removeItem(key) {
        this.map.delete(key);
    }
}

class OriginWebSocket extends WebSocket {
    constructor(url) {
        super(url, { headers: { Origin: 'http://localhost:8000' } });
    }
}

test('自架指令：jsDelivr 固定版本等於 VERSION，只下載後執行，不提供 curl | sh', () => {
    const base = `https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v${VERSION}`;
    assert.equal(cdnBase(), base);
    const { node, worker } = selfHostCommands();
    assert.deepEqual(node.split('\n'), [`curl -fsSLO ${base}/server/signaling.mjs`, 'node signaling.mjs --tunnel']);
    assert.deepEqual(worker.split('\n'), [
        'mkdir pos-v2-signaling && cd pos-v2-signaling',
        `curl -fsSLO ${base}/server/cloudflare/worker.js`,
        `curl -fsSLO ${base}/server/cloudflare/wrangler.jsonc`,
        'npx wrangler@4 login',
        'npx wrangler@4 deploy',
    ]);
    assert.doesNotMatch(node + worker, /\|\s*(ba)?sh\b/);
    assert.ok(selfHostCommands('9.9.9').node.includes('@v9.9.9/'), '版本可以指定');
});

test('儲存、讀取、清除：存整理過的網址，key 依 namespace 區分；壞資料讀成 null', () => {
    const storage = new MemoryStorage();
    assert.equal(signalingStorageKey('solution-pos-v2'), 'vanilla_solution:solution-pos-v2:signaling');
    assert.equal(loadSignalingUrl('solution-pos-v2', storage), null);
    assert.equal(saveSignalingUrl('solution-pos-v2', 'https://a.trycloudflare.com/', storage), 'wss://a.trycloudflare.com');
    assert.equal(storage.getItem('vanilla_solution:solution-pos-v2:signaling'), 'wss://a.trycloudflare.com');
    assert.equal(loadSignalingUrl('solution-pos-v2', storage), 'wss://a.trycloudflare.com');
    assert.equal(loadSignalingUrl('other-ns', storage), null);
    assert.throws(() => saveSignalingUrl('solution-pos-v2', 'ftp://x', storage), TypeError);
    assert.equal(loadSignalingUrl('solution-pos-v2', storage), 'wss://a.trycloudflare.com', '格式不對時不覆寫');
    storage.setItem('vanilla_solution:solution-pos-v2:signaling', 'not a url ::');
    assert.equal(loadSignalingUrl('solution-pos-v2', storage), null);
    clearSignalingUrl('solution-pos-v2', storage);
    assert.equal(storage.getItem('vanilla_solution:solution-pos-v2:signaling'), null);
});

test('sig 參數：讀取、與已儲存的相同時不詢問、不同時要確認、格式不對時忽略', () => {
    assert.equal(readSigParam('#/solutions/pos-v2/admin'), null);
    assert.equal(readSigParam('#/solutions/pos-v2/admin?ns=x'), null);
    assert.equal(readSigParam('#/solutions/pos-v2/admin?sig=wss%3A%2F%2Fa.example&ns=x'), 'wss://a.example');
    assert.equal(readSigParam('#/solutions/pos-v2/admin?sig='), null);

    assert.deepEqual(classifySigParam(null, 'wss://a.example'), { kind: 'none' });
    assert.deepEqual(classifySigParam('https://a.example/', 'wss://a.example'), { kind: 'same' });
    assert.deepEqual(classifySigParam('wss://b.example', 'wss://a.example'), { kind: 'confirm', url: 'wss://b.example' });
    assert.deepEqual(classifySigParam('wss://b.example', null), { kind: 'confirm', url: 'wss://b.example' });
    const invalid = classifySigParam('ftp://b.example', null);
    assert.equal(invalid.kind, 'invalid');
    assert.equal(invalid.raw, 'ftp://b.example');
});

test('連線測試：真的信令伺服器回 welcome 時成功，並帶回 iceServers', async (t) => {
    const server = createSignalingServer({ iceServers: [{ urls: 'stun:example.test' }] });
    const { port } = await server.listen(0);
    t.after(() => server.close());
    const result = await testSignalingConnection(`ws://127.0.0.1:${port}`, { WebSocketImpl: OriginWebSocket });
    assert.equal(result.ok, true);
    assert.ok(Number.isInteger(result.ms) && result.ms >= 0);
    assert.deepEqual(result.iceServers, [{ urls: 'stun:example.test' }]);
});

test('連線測試：連不上、Origin 不在白名單、逾時都回報失敗與說明', async (t) => {
    const refused = await testSignalingConnection('ws://127.0.0.1:1', { WebSocketImpl: OriginWebSocket });
    assert.deepEqual(refused, { ok: false, reason: 'closed' });
    assert.match(describeTestFailure(refused), /Origin 白名單/);

    const server = createSignalingServer({ allowedOrigins: ['https://only.example'] });
    const { port } = await server.listen(0);
    t.after(() => server.close());
    const forbidden = await testSignalingConnection(`ws://127.0.0.1:${port}`, { WebSocketImpl: OriginWebSocket });
    assert.equal(forbidden.ok, false);

    class NeverOpens extends EventTarget {
        close() {}
    }
    const timeout = await testSignalingConnection('wss://s.example', { WebSocketImpl: NeverOpens, timeoutMs: 30 });
    assert.deepEqual(timeout, { ok: false, reason: 'timeout' });
    assert.match(describeTestFailure(timeout), /逾時/);
    assert.match(describeTestFailure({ ok: false, reason: 'bad-response' }), /不是 POS v2/);
});
