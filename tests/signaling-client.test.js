import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createSignalingServer } from '../server/signaling.mjs';
import {
    RECONNECT_DELAYS_MS,
    SIGNALING_STATE,
    SignalingClient,
    normalizeSignalingUrl,
    reconnectDelay,
    signalingEndpoint,
} from '../components/pages/solutions/pos-v2/signaling-client.js';

const ORIGIN = 'http://localhost:8000';
const SECRET_A = 'a'.repeat(43);
const SECRET_B = 'b'.repeat(43);

/** Node 的 WebSocket 不會自動帶 Origin，而信令伺服器拒絕沒有 Origin 的連線 */
class BrowserLikeWebSocket extends WebSocket {
    constructor(url) {
        super(url, { headers: { Origin: ORIGIN } });
    }
}

const newRoom = () => randomBytes(16).toString('base64url');

async function startServer(t, port = 0) {
    const signaling = createSignalingServer({ iceServers: [{ urls: 'stun:example.test' }] });
    const address = await signaling.listen(port);
    let closed = false;
    const stop = async () => {
        if (closed) return;
        closed = true;
        await signaling.close();
    };
    t.after(stop);
    return { url: `ws://127.0.0.1:${address.port}`, port: address.port, stop };
}

function client(t, options) {
    const c = new SignalingClient({ WebSocketImpl: BrowserLikeWebSocket, delays: [50, 100], ...options });
    t.after(() => c.close());
    return c;
}

/** 等待事件；predicate 不成立的事件略過 */
function once(service, type, predicate = () => true, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            off();
            reject(new Error(`等不到 ${type}`));
        }, timeoutMs);
        const off = service.on(type, (detail) => {
            if (!predicate(detail)) return;
            clearTimeout(timer);
            off();
            resolve(detail);
        });
    });
}

const reach = (c, state) => (c.state === state ? Promise.resolve() : once(c, 'state', (d) => d.state === state));

test('normalizeSignalingUrl：https 轉 wss、補 scheme、去掉結尾斜線', () => {
    assert.equal(normalizeSignalingUrl('https://a-b.trycloudflare.com/'), 'wss://a-b.trycloudflare.com');
    assert.equal(normalizeSignalingUrl('  wss://sig.example.workers.dev  '), 'wss://sig.example.workers.dev');
    assert.equal(normalizeSignalingUrl('sig.example.workers.dev'), 'wss://sig.example.workers.dev');
    assert.equal(normalizeSignalingUrl('https://example.com/pos/'), 'wss://example.com/pos');
    assert.equal(normalizeSignalingUrl('HTTPS://Example.com'), 'wss://example.com');
    assert.equal(normalizeSignalingUrl('http://127.0.0.1:8787', { pageProtocol: 'https:' }), 'ws://127.0.0.1:8787', 'https 頁面仍可連本機');
    assert.equal(normalizeSignalingUrl('http://192.168.1.5:8787', { pageProtocol: 'http:' }), 'ws://192.168.1.5:8787');
    assert.throws(() => normalizeSignalingUrl('http://192.168.1.5:8787', { pageProtocol: 'https:' }), /只能連 wss/);
    assert.throws(() => normalizeSignalingUrl(''), /請輸入/);
    assert.throws(() => normalizeSignalingUrl('ftp://example.com'), /wss:\/\/ 或 https:\/\//);
    assert.throws(() => normalizeSignalingUrl('wss://example.com/?x=1'), /查詢參數/);
    assert.throws(() => normalizeSignalingUrl('wss://user:pw@example.com'), /帳號/);
    assert.throws(() => normalizeSignalingUrl('wss://exa mple.com'), /格式不正確/);
});

test('signalingEndpoint 與 reconnectDelay', () => {
    assert.equal(signalingEndpoint('wss://s.example', 'AbCdEfGhIjKlMnOpQrStUv', 'peer'), 'wss://s.example/v1/rooms/AbCdEfGhIjKlMnOpQrStUv?role=peer');
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map((n) => reconnectDelay(n)), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    assert.deepEqual(RECONNECT_DELAYS_MS, [1000, 2000, 4000, 8000, 16000, 30000]);
    assert.throws(() => new SignalingClient({ url: 'wss://s', roomId: 'r', role: 'admin' }), /role/);
    assert.throws(() => new SignalingClient({ url: 'wss://s', roomId: 'r', role: 'host' }), /hostSecret/);
});

test('主機與 peer 經由真的信令伺服器互傳 signal；peerId 與 iceServers 來自伺服器', async (t) => {
    const { url } = await startServer(t);
    const roomId = newRoom();
    const host = client(t, { url, roomId, role: 'host', hostSecret: SECRET_A });
    const hostConfig = once(host, 'config');
    host.connect();
    await reach(host, SIGNALING_STATE.OPEN);
    await hostConfig;
    assert.deepEqual(host.iceServers, [{ urls: 'stun:example.test' }]);

    const peer = client(t, { url, roomId, role: 'peer' });
    const joined = once(host, 'peer-joined');
    peer.connect();
    await reach(peer, SIGNALING_STATE.OPEN);
    assert.match(peer.peerId, /^[A-Za-z0-9_-]{22}$/);
    assert.deepEqual(peer.iceServers, [{ urls: 'stun:example.test' }]);
    assert.equal((await joined).peerId, peer.peerId);

    const atHost = once(host, 'signal');
    assert.equal(peer.sendSignal({ kind: 'offer', sdp: 'v=0' }, 'someone-else'), true);
    assert.deepEqual(await atHost, { t: 'signal', from: peer.peerId, data: { kind: 'offer', sdp: 'v=0' } });

    const atPeer = once(peer, 'signal');
    assert.equal(host.sendSignal({ kind: 'answer', sdp: 'v=0' }, peer.peerId), true);
    assert.deepEqual(await atPeer, { t: 'signal', from: 'host', data: { kind: 'answer', sdp: 'v=0' } });

    assert.throws(() => host.sendSignal({}), /必須指定 to/);
    const notFound = once(host, 'server-error');
    host.sendSignal({}, 'nobody');
    assert.equal((await notFound).code, 'PEER_NOT_FOUND');
});

test('不同 secret 的主機停在 rejected、不重連；同一 secret 的新分頁讓舊的停在 replaced', async (t) => {
    const { url } = await startServer(t);
    const roomId = newRoom();
    const first = client(t, { url, roomId, role: 'host', hostSecret: SECRET_A });
    first.connect();
    await reach(first, SIGNALING_STATE.OPEN);

    const intruder = client(t, { url, roomId, role: 'host', hostSecret: SECRET_B });
    intruder.connect();
    const rejected = await once(intruder, 'state', (d) => d.state !== SIGNALING_STATE.CONNECTING);
    assert.deepEqual([rejected.state, rejected.code], [SIGNALING_STATE.REJECTED, 4001]);

    const reloaded = client(t, { url, roomId, role: 'host', hostSecret: SECRET_A });
    const replaced = once(first, 'state', (d) => d.state === SIGNALING_STATE.REPLACED);
    reloaded.connect();
    await reach(reloaded, SIGNALING_STATE.OPEN);
    assert.equal((await replaced).code, 4002);

    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(intruder.state, SIGNALING_STATE.REJECTED, '退避時間過了也不重連');
    assert.equal(first.state, SIGNALING_STATE.REPLACED);
});

test('伺服器重啟：peer 依退避重連，回到 open；主機離線期間 signal 收到 HOST_OFFLINE', async (t) => {
    const server = await startServer(t);
    const roomId = newRoom();
    const peer = client(t, { url: server.url, roomId, role: 'peer' });
    peer.connect();
    await reach(peer, SIGNALING_STATE.OPEN);
    const offline = once(peer, 'server-error');
    peer.sendSignal({ kind: 'offer' });
    assert.equal((await offline).code, 'HOST_OFFLINE');

    const states = [];
    peer.on('state', (d) => states.push(d));
    await server.stop();
    await reach(peer, SIGNALING_STATE.RECONNECTING);
    assert.equal(peer.sendSignal({ kind: 'offer' }), false, '斷線時送出失敗');

    await new Promise((resolve) => setTimeout(resolve, 200));
    const reconnects = states.filter((d) => d.state === SIGNALING_STATE.RECONNECTING);
    assert.ok(reconnects.length >= 2, `連不上時繼續退避：${JSON.stringify(states)}`);
    assert.deepEqual(reconnects.slice(0, 2).map((d) => d.delayMs), [50, 100]);

    await startServer(t, server.port);
    await reach(peer, SIGNALING_STATE.OPEN);
    assert.match(peer.peerId, /^[A-Za-z0-9_-]{22}$/);
});

test('未連線時 sendSignal 回傳 false 並發出 send-failed；close() 之後不再重連', async (t) => {
    const { url, stop } = await startServer(t);
    const peer = client(t, { url, roomId: newRoom(), role: 'peer' });
    const failed = once(peer, 'send-failed');
    assert.equal(peer.sendSignal({ kind: 'offer' }), false);
    assert.deepEqual(await failed, { reason: 'not-open', state: SIGNALING_STATE.IDLE, data: { kind: 'offer' }, to: undefined });

    peer.connect();
    await reach(peer, SIGNALING_STATE.OPEN);
    peer.close();
    assert.equal(peer.state, SIGNALING_STATE.CLOSED);
    await stop();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(peer.state, SIGNALING_STATE.CLOSED);
});

test('收不到任何訊息超過 staleMs 時視為斷線並重連；retryNow 立即重試', async (t) => {
    const sockets = [];
    /** 會開啟但從不回應的 WebSocket（例如手機背景時網路被切斷） */
    class SilentSocket extends EventTarget {
        constructor(url) {
            super();
            this.url = url;
            this.sent = [];
            sockets.push(this);
            setTimeout(() => this.dispatchEvent(new Event('open')), 0);
        }
        send(data) {
            this.sent.push(data);
        }
        close() {
            this.closed = true;
        }
    }
    const peer = new SignalingClient({ url: 'wss://s.example', roomId: newRoom(), role: 'peer', WebSocketImpl: SilentSocket, keepaliveMs: 10, staleMs: 40, delays: [60_000] });
    t.after(() => peer.close());
    peer.connect();
    const reconnecting = await once(peer, 'state', (d) => d.state === SIGNALING_STATE.RECONNECTING);
    assert.equal(reconnecting.reason, 'stale');
    assert.equal(reconnecting.delayMs, 60_000);
    assert.ok(sockets[0].sent.includes('{"t":"ping"}'), '有送出 keepalive');
    assert.equal(sockets[0].closed, true);

    peer.retryNow();
    assert.equal(peer.state, SIGNALING_STATE.CONNECTING);
    assert.equal(sockets.length, 2, '沒有等 60 秒就重試');
});
