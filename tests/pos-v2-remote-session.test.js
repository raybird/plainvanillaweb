/**
 * POS v2 遠端工作階段的中斷恢復（#16 A7、協定規格 7）：送單沒收到回覆時保留在本機，
 * 重連驗證後以同一個 requestId 重送；明確被拒絕才刪掉，又斷線就留到下一次。
 * 連線本身由瀏覽器測試涵蓋，這裡以假的遠端連線測工作階段的判斷。
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
};
globalThis.location = { hash: '' };

const { RemotePosSession, RemoteTableSession } = await import('../components/pages/solutions/pos-v2/remote-pos-session.js');
const { loadPending } = await import('../components/pages/solutions/pos-v2/pos-v2-remote.js');
const { PEER_ERROR_CODES } = await import('../components/pages/solutions/pos-v2/pos-v2-rpc-client.js');
const { PosError, POS_V2_ERROR_CODES } = await import('../components/pages/solutions/pos-v2/pos-v2-model.js');

const ROOM = 'r'.repeat(22);
const NS = 'unit-remote';
const HASH = `#/solutions/pos-v2/order?ns=${NS}&room=${ROOM}&sig=${encodeURIComponent('wss://sig.example')}`;
const ITEMS = [{ productId: 'burger', qty: 1 }];
const lost = () => new PosError(PEER_ERROR_CODES.HOST_UNAVAILABLE, '和主機的連線已中斷');
const order = (id, number) => ({ id, number, status: 'pending', items: ITEMS });

/** 假的遠端連線：依序回應 order.place，sync 回空的 topics */
function fakeRemote(replies) {
    const calls = [];
    return {
        calls,
        isOpen: true,
        async request(method, params) {
            calls.push({ method, params });
            if (method === 'sync') return { topics: {} };
            const reply = replies.shift();
            if (reply instanceof Error) throw reply;
            return reply;
        },
    };
}

/** credentialId：這個工作階段目前持有的授權（店員裝置或入桌） */
function session(Session = RemotePosSession, hash = HASH, credentialId = 'cred-1') {
    const s = new Session({ role: 'order', hash, onChange: () => {} });
    s._authRun = 1;
    s.stored = { credential: { kind: 'device', id: credentialId, secret: 'x' } };
    return s;
}

beforeEach(() => store.clear());

test('送單沒收到回覆：保留在本機，拋出 PENDING', async () => {
    const s = session();
    s._remote = fakeRemote([lost()]);
    await assert.rejects(s.placeOrder(ITEMS, 'req-1'), (err) => err.code === PEER_ERROR_CODES.PENDING);
    assert.deepEqual(loadPending(NS, ROOM, 'device').map((p) => p.requestId), ['req-1']);
    assert.equal(s.snapshot.pending.length, 1);
});

test('送單明確被拒絕：不保留，照原錯誤拋出', async () => {
    const s = session();
    s._remote = fakeRemote([new PosError(POS_V2_ERROR_CODES.SESSION_CLOSED, '用餐已結束')]);
    await assert.rejects(s.placeOrder(ITEMS, 'req-1'), (err) => err.code === POS_V2_ERROR_CODES.SESSION_CLOSED);
    assert.equal(loadPending(NS, ROOM, 'device').length, 0);
});

test('重連後以原 requestId 重送：成立的刪掉並通知畫面，訂單與查詢 token 放進工作階段', async () => {
    const first = session();
    first._remote = fakeRemote([lost()]);
    await assert.rejects(first.placeOrder(ITEMS, 'req-1'));
    // 重新整理後的新工作階段讀得到本機的待確認送單
    const s = session();
    const remote = fakeRemote([{ result: 'noop', order: order('o1', '001'), viewToken: 'tok' }]);
    s._remote = remote;
    const resolved = [];
    s.onResolved = (r) => resolved.push(r);
    await s._flushPending(1);
    assert.deepEqual(remote.calls[0], { method: 'order.place', params: { items: ITEMS, requestId: 'req-1' } });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].outcome.order.number, '001');
    assert.equal(loadPending(NS, ROOM, 'device').length, 0);
    assert.deepEqual(s.snapshot.pending, []);
    assert.equal(s.viewTokens.get('o1'), 'tok');
    assert.ok(s.snapshot.orders.some((o) => o.id === 'o1'));
});

test('重送時又斷線：保留，留給下一次重連', async () => {
    const first = session();
    first._remote = fakeRemote([lost(), lost()]);
    await assert.rejects(first.placeOrder(ITEMS, 'req-1'));
    await assert.rejects(first.placeOrder(ITEMS, 'req-2'));
    const s = session();
    const remote = fakeRemote([lost()]);
    s._remote = remote;
    const resolved = [];
    s.onResolved = (r) => resolved.push(r);
    await s._flushPending(1);
    assert.equal(remote.calls.length, 1, '斷線後不應繼續送下一筆');
    assert.equal(resolved.length, 0);
    assert.deepEqual(loadPending(NS, ROOM, 'device').map((p) => p.requestId), ['req-1', 'req-2']);
});

test('重送被明確拒絕：刪掉並把錯誤交給畫面，繼續送下一筆', async () => {
    const first = session();
    first._remote = fakeRemote([lost(), lost()]);
    await assert.rejects(first.placeOrder(ITEMS, 'req-1'));
    await assert.rejects(first.placeOrder(ITEMS, 'req-2'));
    const s = session();
    s._remote = fakeRemote([new PosError(POS_V2_ERROR_CODES.SESSION_CLOSED, '用餐已結束'), { result: 'applied', order: order('o2', '002') }]);
    const resolved = [];
    s.onResolved = (r) => resolved.push(r);
    await s._flushPending(1);
    assert.equal(resolved[0].error.code, POS_V2_ERROR_CODES.SESSION_CLOSED);
    assert.equal(resolved[1].outcome.order.number, '002');
    assert.equal(loadPending(NS, ROOM, 'device').length, 0);
});

test('新的一輪驗證開始後，舊的一輪不再送', async () => {
    const first = session();
    first._remote = fakeRemote([lost()]);
    await assert.rejects(first.placeOrder(ITEMS, 'req-1'));
    const s = session();
    const remote = fakeRemote([]);
    s._remote = remote;
    s._authRun = 2;
    await s._flushPending(1);
    assert.equal(remote.calls.length, 0);
    assert.equal(loadPending(NS, ROOM, 'device').length, 1);
});

test('換了授權（換桌、重新配對）：舊授權的待確認送單不改用新授權重送，逐筆告知後刪掉；同一份授權的照常重送（審查 M4）', async () => {
    const old = session(RemotePosSession, HASH, 'cred-old');
    old._remote = fakeRemote([lost()]);
    await assert.rejects(old.placeOrder(ITEMS, 'req-old'));
    const current = session(RemotePosSession, HASH, 'cred-new');
    current._remote = fakeRemote([lost()]);
    await assert.rejects(current.placeOrder(ITEMS, 'req-new'));
    assert.deepEqual(loadPending(NS, ROOM, 'device').map((p) => [p.requestId, p.credentialId]), [['req-old', 'cred-old'], ['req-new', 'cred-new']]);

    const s = session(RemotePosSession, HASH, 'cred-new');
    const remote = fakeRemote([{ result: 'applied', order: order('o9', '009') }]);
    s._remote = remote;
    const resolved = [];
    s.onResolved = (r) => resolved.push(r);
    await s._flushPending(1);
    assert.deepEqual(remote.calls.filter((c) => c.method === 'order.place').map((c) => c.params.requestId), ['req-new'], '只重送同一份授權的那一筆');
    assert.equal(resolved.find((r) => r.requestId === 'req-old').error.code, POS_V2_ERROR_CODES.UNAUTHORIZED);
    assert.equal(resolved.find((r) => r.requestId === 'req-new').outcome.order.number, '009');
    assert.equal(loadPending(NS, ROOM, 'device').length, 0);
});

test('授權失效：舊授權的待確認送單不改用新授權重送，逐筆告知後刪掉', async () => {
    const first = session();
    first._remote = fakeRemote([lost()]);
    await assert.rejects(first.placeOrder(ITEMS, 'req-1'));
    const s = session();
    const resolved = [];
    s.onResolved = (r) => resolved.push(r);
    s._dropPending('授權已撤銷');
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].error.code, POS_V2_ERROR_CODES.UNAUTHORIZED);
    assert.equal(loadPending(NS, ROOM, 'device').length, 0);
});

test('店員裝置與顧客的待確認送單分開存', async () => {
    const staff = session();
    staff._remote = fakeRemote([lost()]);
    await assert.rejects(staff.placeOrder(ITEMS, 'req-staff'));
    const customer = session(RemoteTableSession, `${HASH}&t=A1`);
    customer._remote = fakeRemote([lost()]);
    await assert.rejects(customer.placeOrder(ITEMS, 'req-table'));
    assert.deepEqual(loadPending(NS, ROOM, 'device').map((p) => p.requestId), ['req-staff']);
    assert.deepEqual(loadPending(NS, ROOM, 'table').map((p) => p.requestId), ['req-table']);
    customer._dropPending('入桌授權已失效');
    assert.deepEqual(loadPending(NS, ROOM, 'device').map((p) => p.requestId), ['req-staff']);
});

test('顧客輸入入桌碼取得新的授權時，舊授權下等待確認的送單立即告知並刪掉', async () => {
    const tableHash = `${HASH}&t=A2`;
    const old = session(RemoteTableSession, tableHash, 'table-old');
    old._remote = fakeRemote([lost()]);
    await assert.rejects(old.placeOrder(ITEMS, 'req-a1'));
    const s = session(RemoteTableSession, tableHash, 'table-old');
    s.stored = null;
    s._remote = {
        isOpen: true,
        async request(method) {
            if (method === 'table.join') return { credential: { kind: 'table', id: 'table-new', secret: 'y' }, session: { id: 's2', tableId: 'A2' }, topics: {} };
            if (method === 'menu.get') return { products: [] };
            return { topics: {} };
        },
    };
    const resolved = [];
    s.onResolved = (r) => resolved.push(r);
    await s.join('123456');
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].requestId, 'req-a1');
    assert.equal(resolved[0].error.code, POS_V2_ERROR_CODES.UNAUTHORIZED);
    assert.equal(loadPending(NS, ROOM, 'table').length, 0);
});

test('較舊的快照不覆蓋較新的推送；新的連線 rev 從頭算（審查 S2）', () => {
    const s = session();
    s._applyPush('order', { orders: [order('o2', '002')] }, 5);
    s._acceptTopics({ order: { orders: [order('o1', '001')] } }, 4);
    assert.deepEqual(s.snapshot.orders.map((o) => o.id), ['o2'], 'rev 4 的快照晚到，不應蓋掉 rev 5 的推送');
    s._acceptTopics({ order: { orders: [order('o3', '003')] } }, 5);
    assert.deepEqual(s.snapshot.orders.map((o) => o.id), ['o3'], '同一個 rev 照常套用');
    s._topicRev.clear();
    s._acceptTopics({ order: { orders: [order('o4', '004')] } }, 1);
    assert.deepEqual(s.snapshot.orders.map((o) => o.id), ['o4']);
});
