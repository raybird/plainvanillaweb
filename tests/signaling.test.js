import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
    CLOSE,
    DEFAULT_ALLOWED_ORIGINS,
    LIMITS,
    buildFrame,
    createSignalingServer,
    extractTunnelUrl,
    hostPageLink,
    isOriginAllowed,
    parseFrame,
    parseOptions,
} from '../server/signaling.mjs';

const SERVER_FILE = fileURLToPath(new URL('../server/signaling.mjs', import.meta.url));
const ORIGIN = 'http://localhost:8000';
/**
 * 設定 SIGNALING_URL（例如 `wrangler dev` 的 ws://127.0.0.1:8787）時，協定情境改對那個伺服器執行，
 * 用來驗證 Cloudflare Worker 版的行為和 Node 版相同；需要控制伺服器內部的測試會略過。
 */
const EXTERNAL = process.env.SIGNALING_URL?.replace(/\/+$/, '');
const INTERNAL_ONLY = EXTERNAL ? { skip: '對外部伺服器無法控制時鐘或檔案' } : {};
/** 每個測試換一個房間，外部伺服器的主機綁定才不會互相影響 */
let ROOM = 'AbCdEfGhIjKlMnOpQrStUv';
const SECRET_A = 'a'.repeat(43);
const SECRET_B = 'b'.repeat(43);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 啟動一個測試用伺服器（測試結束時關閉），或使用 SIGNALING_URL；同時換一個新房間 */
async function startServer(t, options = {}) {
    ROOM = randomBytes(16).toString('base64url');
    if (EXTERNAL) return { signaling: null, url: EXTERNAL };
    const signaling = createSignalingServer(options);
    const { port } = await signaling.listen(0);
    t.after(() => signaling.close());
    return { signaling, url: `ws://127.0.0.1:${port}` };
}

/**
 * 連上信令並收集訊息。`next(t)` 等下一則型別為 t 的訊息；`closed` 在關閉時 resolve 為 close code。
 */
function connect(base, role, { room = ROOM, origin = ORIGIN } = {}) {
    const ws = new WebSocket(`${base}/v1/rooms/${room}?role=${role}`, { headers: { Origin: origin } });
    const inbox = [];
    const waiters = [];
    ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        const index = waiters.findIndex((w) => w.type === message.t);
        if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
        else inbox.push(message);
    });
    const closed = new Promise((resolve) => ws.addEventListener('close', (event) => resolve(event.code)));
    const opened = new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', reject);
    });
    return {
        ws,
        opened,
        closed,
        inbox,
        send: (message) => ws.send(typeof message === 'string' ? message : JSON.stringify(message)),
        next(type, timeoutMs = 2000) {
            const index = inbox.findIndex((m) => m.t === type);
            if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
            return new Promise((resolve, reject) => {
                const waiter = { type, resolve };
                waiters.push(waiter);
                setTimeout(() => {
                    const i = waiters.indexOf(waiter);
                    if (i >= 0) {
                        waiters.splice(i, 1);
                        reject(new Error(`等不到 ${type}，已收到：${JSON.stringify(inbox)}`));
                    }
                }, timeoutMs);
            });
        },
        close: () => ws.close(),
    };
}

async function host(base, secret = SECRET_A, options) {
    const client = connect(base, 'host', options);
    await client.opened;
    client.send({ t: 'host-auth', secret });
    return client;
}

/** 以原始 HTTP 送出 upgrade，取得伺服器拒絕時的狀態碼 */
function upgradeStatus(base, pathname, origin) {
    const { hostname, port } = new URL(base);
    return new Promise((resolve, reject) => {
        const headers = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' };
        if (origin) headers.Origin = origin;
        const req = http.request({ host: hostname, port, path: pathname, headers });
        req.on('response', (res) => {
            res.resume();
            resolve(res.statusCode);
        });
        req.on('upgrade', (res, socket) => {
            socket.destroy();
            resolve(res.statusCode);
        });
        req.on('error', reject);
        req.end();
    });
}

// ---------- 純函式 ----------

test('isOriginAllowed：完全相同或 :* 任何連接埠', () => {
    assert.equal(isOriginAllowed('https://raybird.github.io', DEFAULT_ALLOWED_ORIGINS), true);
    assert.equal(isOriginAllowed('http://localhost:8000', DEFAULT_ALLOWED_ORIGINS), true);
    assert.equal(isOriginAllowed('http://127.0.0.1:35943', DEFAULT_ALLOWED_ORIGINS), true);
    assert.equal(isOriginAllowed('http://localhost', DEFAULT_ALLOWED_ORIGINS), false, '沒有連接埠不符合 :*');
    assert.equal(isOriginAllowed('http://localhost:80x', DEFAULT_ALLOWED_ORIGINS), false);
    assert.equal(isOriginAllowed('http://localhost.evil.com:8000', DEFAULT_ALLOWED_ORIGINS), false);
    assert.equal(isOriginAllowed('https://raybird.github.io.evil.com', DEFAULT_ALLOWED_ORIGINS), false);
    assert.equal(isOriginAllowed('https://evil.example', DEFAULT_ALLOWED_ORIGINS), false);
    assert.equal(isOriginAllowed(undefined, DEFAULT_ALLOWED_ORIGINS), false, '沒有 Origin 一律拒絕');
});

test('extractTunnelUrl：從 cloudflared 的輸出找出 Quick Tunnel 網址', () => {
    const output = `2026-11-26T08:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...
2026-11-26T08:00:01Z INF +--------------------------------------------------------------------------------------------+
2026-11-26T08:00:01Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-11-26T08:00:01Z INF |  https://quiet-river-sample-tunnel.trycloudflare.com                                       |
2026-11-26T08:00:01Z INF +--------------------------------------------------------------------------------------------+`;
    assert.equal(extractTunnelUrl(output), 'https://quiet-river-sample-tunnel.trycloudflare.com');
    assert.equal(extractTunnelUrl('INF Requesting new quick Tunnel on trycloudflare.com...'), null, '說明文字裡的網域不算');
    assert.equal(extractTunnelUrl(''), null);
});

test('hostPageLink：信令位址轉成 wss 並編碼進 sig 參數', () => {
    assert.equal(hostPageLink('https://raybird.github.io/plainvanillaweb/', 'https://a-b.trycloudflare.com/'),
        'https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/admin?sig=wss%3A%2F%2Fa-b.trycloudflare.com');
    assert.equal(hostPageLink('http://localhost:8000', 'http://127.0.0.1:8787'),
        'http://localhost:8000/#/solutions/pos-v2/admin?sig=ws%3A%2F%2F127.0.0.1%3A8787');
});

test('parseOptions：預設值、命令列與環境變數', () => {
    const defaults = parseOptions([], {});
    assert.equal(defaults.port, 8787);
    assert.equal(defaults.host, '127.0.0.1');
    assert.deepEqual(defaults.allowedOrigins, [...DEFAULT_ALLOWED_ORIGINS]);
    assert.equal(defaults.tunnel, false);
    const custom = parseOptions(['--port', '9000', '--tunnel', '--allow-origin', 'https://a.example', '--ice-servers', '[{"urls":"turn:t.example"}]'], {});
    assert.equal(custom.port, 9000);
    assert.equal(custom.tunnel, true);
    assert.deepEqual(custom.allowedOrigins, ['https://a.example']);
    assert.deepEqual(custom.iceServers, [{ urls: 'turn:t.example' }]);
    const env = parseOptions([], { SIGNALING_PORT: '1234', SIGNALING_ALLOWED_ORIGINS: 'https://x.example, https://y.example' });
    assert.equal(env.port, 1234);
    assert.deepEqual(env.allowedOrigins, ['https://x.example', 'https://y.example']);
    assert.throws(() => parseOptions(['--port'], {}), /需要一個值/);
    assert.throws(() => parseOptions(['--bogus'], {}), /不認得的選項/);
    assert.throws(() => parseOptions(['--port', '70000'], {}), /連接埠/);
    assert.throws(() => parseOptions(['--ice-servers', '{}'], {}), /JSON 陣列/);
});

test('parseFrame／buildFrame：遮罩、長度、資料不足、未遮罩與過大', () => {
    const payload = Buffer.from('{"t":"ping"}');
    const mask = Buffer.from([1, 2, 3, 4]);
    const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i & 3]));
    const frame = Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]);
    const parsed = parseFrame(Buffer.concat([frame, Buffer.from([0x81])]), 1024);
    assert.equal(parsed.frame.opcode, 1);
    assert.equal(parsed.frame.fin, true);
    assert.equal(parsed.frame.payload.toString(), payload.toString());
    assert.equal(parsed.rest.length, 1, '剩下的位元組留給下一個訊框');
    assert.equal(parseFrame(frame.subarray(0, 5), 1024).frame, null, '資料不足');
    assert.equal(parseFrame(Buffer.from([0x81, 0x05, 1, 2, 3, 4, 5]), 1024).error, 1002, '用戶端訊框必須有遮罩');
    assert.equal(parseFrame(Buffer.from([0x81, 0xfe, 0x04, 0x01]), 1024).error, 1009, '超過上限');
    const big = buildFrame(1, Buffer.alloc(70000));
    assert.equal(big[1], 127);
    assert.equal(buildFrame(1, Buffer.alloc(200))[1], 126);
});

// ---------- 伺服器 ----------

test('upgrade：Origin 不在白名單回 403；沒有 Origin 回 403；房間 id 或角色不正確回 400', async (t) => {
    const { url } = await startServer(t);
    assert.equal(await upgradeStatus(url, `/v1/rooms/${ROOM}?role=peer`, 'https://evil.example'), 403);
    assert.equal(await upgradeStatus(url, `/v1/rooms/${ROOM}?role=peer`, null), 403);
    assert.equal(await upgradeStatus(url, '/v1/rooms/short?role=peer', ORIGIN), 400);
    assert.equal(await upgradeStatus(url, `/v1/rooms/${ROOM}?role=admin`, ORIGIN), 400);
    assert.equal(await upgradeStatus(url, `/v1/rooms/${ROOM}?role=peer`, ORIGIN), 101);
});

test('主機席位：第一個主機綁定房間；不同 secret 被拒（4001）；同一 secret 取代舊連線（4002）', async (t) => {
    const { url } = await startServer(t, { iceServers: [{ urls: 'stun:example.test' }] });
    const first = await host(url, SECRET_A);
    assert.deepEqual(await first.next('host-ready'), { t: 'host-ready', peers: [] });
    const config = await first.next('config');
    if (EXTERNAL) assert.ok(Array.isArray(config.iceServers));
    else assert.deepEqual(config, { t: 'config', iceServers: [{ urls: 'stun:example.test' }] });

    const intruder = await host(url, SECRET_B);
    assert.equal(await intruder.closed, CLOSE.HOST_REJECTED);

    const reloaded = await host(url, SECRET_A);
    await reloaded.next('host-ready');
    await first.next('host-replaced');
    assert.equal(await first.closed, CLOSE.HOST_REPLACED);
    reloaded.close();
});

test('主機席位：第一則訊息不是 host-auth 或 secret 格式不對時拒絕', async (t) => {
    const { url } = await startServer(t);
    const a = connect(url, 'host');
    await a.opened;
    a.send({ t: 'signal', to: 'x', data: {} });
    assert.equal(await a.closed, CLOSE.HOST_REJECTED);
    const b = connect(url, 'host');
    await b.opened;
    b.send({ t: 'host-auth', secret: 'short' });
    assert.equal(await b.closed, CLOSE.HOST_REJECTED);
});

test('轉送：from 由伺服器填入；peer 不能指定對象；主機送給不存在的 peer 回 PEER_NOT_FOUND', async (t) => {
    const { url } = await startServer(t);
    const h = await host(url);
    await h.next('host-ready');
    const p1 = connect(url, 'peer');
    const welcome = await p1.next('welcome');
    assert.match(welcome.peerId, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(welcome.hostOnline, true);
    assert.ok(Array.isArray(welcome.iceServers));
    assert.equal((await h.next('peer-joined')).peerId, welcome.peerId);
    const p2 = connect(url, 'peer');
    const other = await p2.next('welcome');
    await h.next('peer-joined');

    p1.send({ t: 'signal', from: 'host', to: other.peerId, data: { kind: 'offer', sdp: 'x' } });
    assert.deepEqual(await h.next('signal'), { t: 'signal', from: welcome.peerId, data: { kind: 'offer', sdp: 'x' } });
    await sleep(100);
    assert.equal(p2.inbox.some((m) => m.t === 'signal'), false, 'peer 不能直接送給其他 peer');

    h.send({ t: 'signal', to: welcome.peerId, data: { kind: 'answer', sdp: 'y' } });
    assert.deepEqual(await p1.next('signal'), { t: 'signal', from: 'host', data: { kind: 'answer', sdp: 'y' } });

    h.send({ t: 'signal', to: 'nobody', data: {} });
    assert.equal((await h.next('error')).code, 'PEER_NOT_FOUND');

    p1.close();
    assert.equal((await h.next('peer-left')).peerId, welcome.peerId);
    p2.close();
    h.close();
});

test('主機上下線：peer 收到 host-online／host-offline；主機不在時 signal 回 HOST_OFFLINE', async (t) => {
    const { url } = await startServer(t);
    const p = connect(url, 'peer');
    assert.equal((await p.next('welcome')).hostOnline, false);
    p.send({ t: 'signal', data: { kind: 'offer' } });
    assert.equal((await p.next('error')).code, 'HOST_OFFLINE');

    const h = await host(url);
    const ready = await h.next('host-ready');
    assert.equal(ready.peers.length, 1, 'host-ready 列出已在等待的 peer');
    await p.next('host-online');
    h.close();
    await p.next('host-offline');
    p.close();
});

test('綁定逾時：房間連續一段時間沒有主機後清除綁定，其他 secret 才能綁定', INTERNAL_ONLY, async (t) => {
    let clock = 1_000_000;
    const { url, signaling } = await startServer(t, { bindingTtlMs: 60_000, now: () => clock });
    const a = await host(url, SECRET_A);
    await a.next('host-ready');
    a.close();
    await a.closed;
    await sleep(50);

    clock += 59_000;
    signaling.sweep();
    const early = await host(url, SECRET_B);
    assert.equal(await early.closed, CLOSE.HOST_REJECTED, '還沒逾時');

    clock += 2_000;
    signaling.sweep();
    const b = await host(url, SECRET_B);
    await b.next('host-ready');
    b.close();
});

test('訊息檢查：不合格 JSON 回 BAD_MESSAGE；ping 回 pong；過大的訊息以 1009 關閉', async (t) => {
    const { url } = await startServer(t);
    const p = connect(url, 'peer');
    await p.next('welcome');
    p.send('not json');
    assert.equal((await p.next('error')).code, 'BAD_MESSAGE');
    p.send('[1,2]');
    assert.equal((await p.next('error')).code, 'BAD_MESSAGE');
    p.send({ t: 'nope' });
    assert.equal((await p.next('error')).code, 'BAD_MESSAGE');
    p.send({ t: 'ping' });
    await p.next('pong');
    p.send({ t: 'signal', data: 'x'.repeat(LIMITS.MAX_MESSAGE_BYTES) });
    assert.equal(await p.closed, 1009);
});

test('限速：10 秒內超過 50 則訊息以 4008 關閉', async (t) => {
    const { url } = await startServer(t);
    const p = connect(url, 'peer');
    await p.next('welcome');
    // 用 signal 而不是 ping：Worker 版的 ping 由平台自動回應，不經過程式也不計入限速
    for (let i = 0; i <= LIMITS.RATE_MAX_MESSAGES; i++) p.send({ t: 'signal', data: {} });
    assert.equal(await p.closed, CLOSE.RATE_LIMITED);
});

test('每個房間最多 64 個 peer，超過以 4009 關閉', async (t) => {
    const { url } = await startServer(t);
    const peers = [];
    for (let i = 0; i < LIMITS.MAX_PEERS; i++) {
        const p = connect(url, 'peer');
        peers.push(p);
        await p.next('welcome');
    }
    const extra = connect(url, 'peer');
    assert.equal(await extra.closed, CLOSE.ROOM_FULL);
    peers.forEach((p) => p.close());
});

test('單一檔案：複製到空目錄就能執行；不匯入任何本地模組', INTERNAL_ONLY, async (t) => {
    const source = fs.readFileSync(SERVER_FILE, 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map(([, spec]) => spec);
    assert.ok(imports.length > 0);
    assert.ok(imports.every((spec) => spec.startsWith('node:')), `只能匯入 node: 內建模組，實際：${imports.join(', ')}`);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-v2-signaling-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.copyFileSync(SERVER_FILE, path.join(dir, 'signaling.mjs'));
    // PATH 清空：找不到 cloudflared，--tunnel 要印出手動步驟，信令伺服器照常運作
    const child = spawn(process.execPath, ['signaling.mjs', '--port', '0', '--tunnel'], { cwd: dir, env: { PATH: '' } });
    t.after(() => child.kill());
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const deadline = Date.now() + 5000;
    while (!/cloudflared tunnel --url/.test(output) && Date.now() < deadline) await sleep(50);
    const port = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output)?.[1];
    assert.ok(port, `沒有印出位址：${output}`);
    assert.match(output, /找不到 cloudflared/);
    const health = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
    assert.deepEqual(health, { ok: true, protocol: 1, rooms: 0 });
});
