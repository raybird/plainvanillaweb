import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MENU, createOrder, decideTransition } from '../components/pages/solutions/pos/pos-model.js';
import {
    CREDENTIAL_KIND,
    POS_V2_ERROR_CODES,
    PosError,
    SESSION_STATUS,
    decidePlaceOrder,
    principalOf,
    withV2Fields,
} from '../components/pages/solutions/pos-v2/pos-v2-model.js';
import { ORDER_RATE, PosV2Hub, fitOrders } from '../components/pages/solutions/pos-v2/pos-v2-hub.js';
import { PosV2RpcClient } from '../components/pages/solutions/pos-v2/pos-v2-rpc-client.js';
import { BAD_MESSAGE_LIMIT, BUFFER_HIGH_BYTES, MAX_MESSAGE_BYTES, parseMessage } from '../components/pages/solutions/pos-v2/pos-v2-wire.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const E = POS_V2_ERROR_CODES;

/** 一對記憶體 DataChannel：一端 send，另一端在下一個 microtask 收到 message */
function channelPair() {
    class MemoryChannel extends EventTarget {
        constructor() {
            super();
            this.readyState = 'open';
            this.bufferedAmount = 0;
            this.bufferedAmountLowThreshold = 0;
            this.sent = [];
        }
        send(data) {
            if (this.readyState !== 'open') throw new Error('closed');
            this.sent.push(data);
            const peer = this.peer;
            queueMicrotask(() => {
                if (peer.readyState === 'open') peer.dispatchEvent(new MessageEvent('message', { data }));
            });
        }
        close() {
            for (const side of [this, this.peer]) {
                if (side.readyState === 'closed') continue;
                side.readyState = 'closed';
                queueMicrotask(() => side.dispatchEvent(new Event('close')));
            }
        }
    }
    const a = new MemoryChannel();
    const b = new MemoryChannel();
    a.peer = b;
    b.peer = a;
    return [a, b];
}

/** 記憶體版 repository：介面同 PosV2Repository，判斷沿用真的模型函式 */
class FakeRepository {
    constructor(clock) {
        this.clock = clock;
        this.orders = [];
        this.credentials = new Map();
        this.sessions = new Map();
        this.tables = [{ id: 'A1', name: 'A1 桌' }, { id: 'A2', name: 'A2 桌' }];
        this.tickets = [];
        this.sequence = 0;
        this.nextId = 0;
    }
    id(prefix) {
        this.nextId += 1;
        return `${prefix}${this.nextId}`;
    }
    issue(fields) {
        const record = { id: this.id('cred'), secret: this.id('secret-'), revokedAt: null, ...fields };
        this.credentials.set(record.id, record);
        return { kind: record.kind, id: record.id, secret: record.secret };
    }
    device(role, station = null, label = '') {
        return this.issue({ kind: CREDENTIAL_KIND.DEVICE, role, station, label });
    }
    openTable(tableId, code = '123456') {
        const session = { id: this.id('session'), tableId, status: SESSION_STATUS.OPEN, code, openedAt: this.clock.now };
        this.sessions.set(session.id, session);
        return session;
    }
    publicRecord(record) {
        const { secret: _secret, ...rest } = record;
        return rest;
    }
    async listOrders() {
        return [...this.orders].sort((a, b) => a.sequence - b.sequence);
    }
    async listProducts() {
        return DEFAULT_MENU;
    }
    async hasOrderRequest(principal, requestId) {
        return this.orders.some((o) => o.principal === principal && o.requestId === requestId);
    }
    async listTables() {
        return this.tables.map((table) => {
            const sessions = [...this.sessions.values()].filter((s) => s.tableId === table.id);
            const session = sessions.find((s) => s.status === SESSION_STATUS.OPEN) ?? sessions.at(-1) ?? null;
            return { ...table, session: session && { id: session.id, tableId: session.tableId, status: session.status } };
        });
    }
    async verifyCredential(presented) {
        const record = this.credentials.get(presented?.id);
        if (!record || record.kind !== presented.kind || record.secret !== presented.secret || record.revokedAt != null) {
            throw new PosError(E.UNAUTHORIZED, '授權無效或已撤銷');
        }
        return this.publicRecord(record);
    }
    async verifyViewToken({ orderId, token }) {
        const order = this.orders.find((o) => o.id === orderId);
        if (!order || token !== `view-${orderId}`) throw new PosError(E.UNAUTHORIZED, '訂單查詢連結無效');
        return order;
    }
    async joinTable({ tableId, code }) {
        const session = [...this.sessions.values()].find((s) => s.tableId === tableId && s.status === SESSION_STATUS.OPEN);
        if (!session) throw new PosError(E.SESSION_CLOSED, '沒有開桌');
        if (code !== session.code) throw new PosError(E.CODE_INVALID, '入桌碼不正確');
        const credential = this.issue({ kind: CREDENTIAL_KIND.TABLE, tableId, diningSessionId: session.id });
        return { credential, session: { id: session.id, tableId, status: session.status } };
    }
    async findPairing({ token, code }) {
        const ticket = this.tickets.find((t) => (token ? t.token === token : t.code === code));
        if (!ticket) throw new PosError(token ? E.PAIRING_EXPIRED : E.CODE_INVALID, token ? '配對已過期' : '連線碼不正確');
        return { id: ticket.id, expiresAt: Infinity };
    }
    async approveDevice({ role, station = null, label = '' }) {
        const credential = this.device(role, station, label);
        return { credential, device: this.publicRecord(this.credentials.get(credential.id)) };
    }
    async revokeCredential(id) {
        const record = this.credentials.get(id);
        record.revokedAt = this.clock.now;
        return this.publicRecord(record);
    }
    async placeOrder({ grant, items, requestId, tableId = null }) {
        const current = this.credentials.get(grant?.id);
        if (!current || current.revokedAt != null) throw new PosError(E.UNAUTHORIZED, '授權無效或已撤銷');
        const principal = principalOf(grant);
        const existing = this.orders.find((o) => o.principal === principal && o.requestId === requestId);
        const session = current.kind === CREDENTIAL_KIND.TABLE
            ? this.sessions.get(current.diningSessionId)
            : [...this.sessions.values()].find((s) => s.tableId === tableId && s.status === SESSION_STATUS.OPEN);
        const decision = decidePlaceOrder({ existing, grant: current, session, tableId });
        if (decision.result === 'noop') return decision;
        this.sequence += 1;
        const order = withV2Fields(createOrder({ items, requestId, id: this.id('order'), sequence: this.sequence, now: this.clock.now, by: principal }, DEFAULT_MENU), decision.fields);
        this.orders.push(order);
        return { result: 'applied', order, ...(order.source === 'device' ? { viewToken: `view-${order.id}` } : {}) };
    }
    async transition(orderId, { action, actor, fromStation }) {
        await sleep(5); // 讓並行的請求有機會交錯
        const index = this.orders.findIndex((o) => o.id === orderId);
        const decision = decideTransition(this.orders[index], { action, actor, fromStation, now: this.clock.now });
        if (decision.result === 'applied') this.orders[index] = decision.order;
        return decision;
    }
}

function setup(t, hubOptions = {}) {
    const clock = { now: 1_000_000 };
    const repository = new FakeRepository(clock);
    const hub = new PosV2Hub({ repository, now: () => clock.now, flushDelayMs: 5, ...hubOptions });
    hub.start();
    t.after(() => hub.dispose());
    let count = 0;
    const connect = () => {
        const [hostSide, peerSide] = channelPair();
        count += 1;
        hub.attach(`peer${count}`, hostSide);
        const client = new PosV2RpcClient({ channel: peerSide, now: () => clock.now, requestTimeoutMs: 500 });
        t.after(() => client.close());
        const pushes = [];
        client.on('push', (p) => pushes.push(p));
        return { client, hostSide, peerSide, pushes, id: `peer${count}` };
    };
    return { clock, repository, hub, connect };
}

const rejects = async (promise, code) => {
    await assert.rejects(promise, (err) => {
        assert.equal(err.code, code, err.message);
        return true;
    });
};

/** 等到 predicate 成立 */
async function until(predicate, timeoutMs = 1000) {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('等待逾時');
        await sleep(5);
    }
}

// ---------- 訊息信封 ----------

test('parseMessage：丟棄原型鍵、檢查版本與欄位、大小上限', () => {
    const ok = parseMessage('{"v":1,"type":"req","id":"r1","method":"sync","params":{"__proto__":{"x":1},"a":1}}');
    assert.equal(ok.ok, true);
    assert.deepEqual(Object.keys(ok.message.params), ['a']);
    assert.equal(Object.getPrototypeOf(ok.message.params), Object.prototype);
    assert.deepEqual(parseMessage('{"v":2,"type":"req","id":"r1","method":"x"}'), { ok: false, id: 'r1', reason: 'version' });
    assert.deepEqual(parseMessage('{"v":1,"type":"req","id":"r1"}'), { ok: false, id: 'r1', reason: 'req' });
    assert.deepEqual(parseMessage('{"v":1,"type":"req","id":"r1","method":"x","params":[1]}'), { ok: false, id: 'r1', reason: 'params' });
    assert.equal(parseMessage('nope').reason, 'not-json');
    assert.equal(parseMessage('[1]').reason, 'not-object');
    assert.equal(parseMessage(new ArrayBuffer(4)).reason, 'not-text');
    assert.equal(parseMessage(`{"v":1,"type":"ping","ts":1,"pad":"${'x'.repeat(MAX_MESSAGE_BYTES)}"}`).reason, 'too-large');
    assert.equal(parseMessage('{"v":1,"type":"push","topic":"x","rev":1.5}').reason, 'push');
    assert.equal(parseMessage('{"v":1,"type":"res","id":"r","ok":false,"error":{}}').reason, 'error');
});

// ---------- 授權與權限 ----------

test('未驗證的連線只能呼叫公開方法；不支援的方法回 BAD_MESSAGE', async (t) => {
    const { connect } = setup(t);
    const { client } = connect();
    await rejects(client.request('menu.get'), E.UNAUTHORIZED);
    await rejects(client.request('sync'), E.UNAUTHORIZED);
    await rejects(client.request('order.place', { items: [], requestId: 'r' }), E.UNAUTHORIZED);
    await rejects(client.request('admin.drop'), E.BAD_MESSAGE);
    assert.deepEqual(await client.request('table.listOpen'), { tables: [] });
});

test('auth：通過的授權與快照、無效的列在 rejected；授權最多一份', async (t) => {
    const { connect, repository, hub } = setup(t);
    const kitchen = repository.device('kitchen', 'K1');
    const { client } = connect();
    const auth = await client.request('auth', { credentials: [kitchen] });
    assert.deepEqual(auth.device, { id: kitchen.id, role: 'kitchen', station: 'K1', label: '' });
    assert.deepEqual(auth.rejected, []);
    assert.deepEqual(auth.topics.kitchen, { orders: [], stations: [{ station: 'K1', online: true, takeoverAllowed: false }] });

    const { client: other } = connect();
    const bad = await other.request('auth', { credentials: [{ ...kitchen, secret: 'wrong' }], watches: [{ orderId: 'x', token: 'y' }] });
    assert.equal(bad.device, null);
    assert.deepEqual(bad.rejected.map((r) => [r.kind, r.code]), [['device', E.UNAUTHORIZED], ['view', E.UNAUTHORIZED]]);
    await rejects(other.request('auth', { credentials: [kitchen, kitchen] }), E.BAD_MESSAGE);
    assert.equal(hub.listConnections().length, 2);
});

test('角色權限：點餐裝置送單、廚房認領與完成、叫號取餐；越權回 FORBIDDEN；推送依角色', async (t) => {
    const { connect, repository, hub } = setup(t);
    const order = connect();
    const kitchen = connect();
    const display = connect();
    await order.client.request('auth', { credentials: [repository.device('order', null, '櫃台')] });
    await kitchen.client.request('auth', { credentials: [repository.device('kitchen', 'K1')] });
    await display.client.request('auth', { credentials: [repository.device('display')] });

    const placed = await order.client.request('order.place', { items: [{ productId: 'burger', qty: 2 }], requestId: 'r1' });
    assert.equal(placed.result, 'applied');
    assert.equal(placed.order.number, '001');
    assert.equal(placed.order.aheadCount, 0);
    assert.equal(placed.viewToken, `view-${placed.order.id}`, '店員點餐回傳查詢 token');
    assert.equal((await order.client.request('order.place', { items: [{ productId: 'burger', qty: 2 }], requestId: 'r1' })).result, 'noop');

    await until(() => kitchen.pushes.some((p) => p.topic === 'kitchen' && p.data.orders.length === 1));
    const kitchenPush = kitchen.pushes.findLast((p) => p.topic === 'kitchen');
    assert.equal(kitchenPush.rev, hub.rev);
    assert.equal('principal' in kitchenPush.data.orders[0], false, '店員看到的訂單不含 principal');
    assert.ok(order.pushes.some((p) => p.topic === 'order' && p.data.orders[0].id === placed.order.id));
    assert.equal(display.pushes.some((p) => p.topic === 'kitchen' || p.topic === 'order'), false, '叫號只收到自己的 topic');

    await rejects(display.client.request('order.act', { orderId: placed.order.id, action: 'claim' }), E.FORBIDDEN);
    await rejects(order.client.request('order.act', { orderId: placed.order.id, action: 'cancel' }), E.FORBIDDEN);
    await rejects(kitchen.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'k' }), E.FORBIDDEN);
    assert.equal((await kitchen.client.request('order.act', { orderId: placed.order.id, action: 'claim', actor: 'forged' })).order.station, 'K1', 'actor 由主機依授權填入');
    await kitchen.client.request('order.act', { orderId: placed.order.id, action: 'ready' });
    await until(() => display.pushes.some((p) => p.topic === 'display' && p.data.orders.some((o) => o.number === '001' && o.status === 'ready')));
    assert.equal((await display.client.request('order.act', { orderId: placed.order.id, action: 'pickup' })).order.status, 'picked_up');
});

test('入桌：碼正確取得入桌授權並可送單；關桌後 SESSION_CLOSED；店員裝置不能入桌', async (t) => {
    const { connect, repository } = setup(t);
    const session = repository.openTable('A1');
    const guest = connect();
    assert.deepEqual(await guest.client.request('table.listOpen'), { tables: [{ id: 'A1', name: 'A1 桌' }] });
    const joined = await guest.client.request('table.join', { tableId: 'A1', code: '123456' });
    assert.equal(joined.credential.kind, 'table');
    assert.deepEqual(joined.topics.session, { tableId: 'A1', diningSessionId: session.id, status: SESSION_STATUS.OPEN });
    const placed = await guest.client.request('order.place', { items: [{ productId: 'fries', qty: 1 }], requestId: 'g1', tableId: 'A2' });
    assert.equal(placed.order.tableId, 'A1', '桌號取自入桌授權，忽略參數');
    assert.equal('viewToken' in placed, false);

    session.status = SESSION_STATUS.CLOSED;
    await rejects(guest.client.request('order.place', { items: [{ productId: 'fries', qty: 1 }], requestId: 'g2' }), E.SESSION_CLOSED);
    const sync = await guest.client.request('sync');
    assert.equal(sync.topics.session.status, SESSION_STATUS.CLOSED);
    assert.equal(sync.topics.myOrders.orders.length, 1, '關桌後仍可查看自己的訂單');

    const staff = connect();
    await staff.client.request('auth', { credentials: [repository.device('order')] });
    await rejects(staff.client.request('table.join', { tableId: 'A1', code: '123456' }), E.FORBIDDEN);
});

test('嘗試次數：同一條連線連錯 5 次後冷卻，冷卻中正確的碼也拒絕；60 秒後恢復', async (t) => {
    const { connect, repository, clock } = setup(t);
    repository.openTable('A1');
    const { client } = connect();
    for (let i = 0; i < 5; i++) await rejects(client.request('table.join', { tableId: 'A1', code: '000000' }), E.CODE_INVALID);
    await assert.rejects(client.request('table.join', { tableId: 'A1', code: '123456' }), (err) => err.code === E.RATE_LIMITED && err.retryAfterMs === 60_000);
    clock.now += 60_001;
    assert.equal((await client.request('table.join', { tableId: 'A1', code: '123456' })).credential.kind, 'table');
});

test('嘗試次數：同一張桌一分鐘內 30 次錯誤後鎖 60 秒（跨連線）；其他桌不受影響；管理頁看得到次數', async (t) => {
    const { connect, repository, hub, clock } = setup(t);
    repository.openTable('A1');
    repository.openTable('A2', '654321');
    for (let i = 0; i < 30; i++) {
        const { client } = connect();
        await rejects(client.request('table.join', { tableId: 'A1', code: '000000' }), E.CODE_INVALID);
        clock.now += 1000;
    }
    const fresh = connect();
    await rejects(fresh.client.request('table.join', { tableId: 'A1', code: '123456' }), E.RATE_LIMITED);
    assert.equal((await fresh.client.request('table.join', { tableId: 'A2', code: '654321' })).session.tableId, 'A2');
    const a1 = hub.listAttempts().find((a) => a.target === 'table:A1');
    assert.ok(a1.retryAfterMs > 0);
});

test('嘗試次數：並行送出的錯誤碼也受限制，同一條連線最多 5 筆、同一張桌最多 30 筆進到驗證（審查 M1）', async (t) => {
    const { connect, repository } = setup(t);
    repository.openTable('A1');
    let calls = 0;
    const original = repository.joinTable.bind(repository);
    // 驗證要等一下才有結果（真的 repository 要算雜湊、跑 transaction）
    repository.joinTable = async (input) => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return original(input);
    };
    const { client } = connect();
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => client.request('table.join', { tableId: 'A1', code: '000000' })));
    const codes = results.map((r) => r.reason?.code);
    assert.equal(calls, 5, '同一條連線並行 50 筆，只有 5 筆應進到驗證');
    assert.equal(codes.filter((c) => c === E.CODE_INVALID).length, 5);
    assert.equal(codes.filter((c) => c === E.RATE_LIMITED).length, 45);

    calls = 0;
    const clients = Array.from({ length: 40 }, () => connect().client);
    const spread = await Promise.allSettled(clients.map((c) => c.request('table.join', { tableId: 'A1', code: '000000' })));
    assert.ok(calls <= 25, `同一張桌跨連線並行，進到驗證的不應超過剩餘名額（30 − 5）：${calls}`);
    assert.equal(spread.filter((r) => r.reason?.code === E.RATE_LIMITED).length, 40 - calls);
});

test('嘗試次數：亂給的桌號不記入每桌紀錄，擠不掉正在冷卻的桌（審查 M6）', async (t) => {
    const { connect, hub, repository, clock } = setup(t);
    repository.openTable('A1');
    for (let i = 0; i < 30; i++) {
        await rejects(connect().client.request('table.join', { tableId: 'A1', code: '000000' }), E.CODE_INVALID);
        clock.now += 100;
    }
    await rejects(connect().client.request('table.join', { tableId: 'A1', code: '123456' }), E.RATE_LIMITED);
    // 真的 repository 對格式不合的碼在查桌位之前就回 CODE_INVALID
    const original = repository.joinTable.bind(repository);
    repository.joinTable = async (input) => (input.code === 'x' ? Promise.reject(new PosError(E.CODE_INVALID, '入桌碼不正確')) : original(input));
    for (let i = 0; i < 400; i++) {
        await connect().client.request('table.join', { tableId: `X${i}`, code: 'x' }).catch(() => {});
    }
    assert.deepEqual(hub.listAttempts().map((a) => a.target), ['table:A1'], '不存在的桌號不應留下紀錄');
    await rejects(connect().client.request('table.join', { tableId: 'A1', code: '123456' }), E.RATE_LIMITED);
});

// ---------- 推送大小與送單速率（審查 S1） ----------

test('fitOrders：超過位元組上限時只放前面的部分，標出沒放進去的筆數', () => {
    const list = Array.from({ length: 100 }, (_, i) => ({ id: `o${i}`, note: 'x'.repeat(1000) }));
    const { orders, truncated } = fitOrders(list, 10_000);
    assert.ok(orders.length > 0 && orders.length < 10);
    assert.equal(orders.length + truncated, 100);
    assert.ok(JSON.stringify(orders).length <= 10_000);
    assert.deepEqual(fitOrders(list.slice(0, 2), 10_000), { orders: list.slice(0, 2) });
});

test('廚房快照很大時截斷並標 truncated，連線不會被關；每一則推送都在上限內', async (t) => {
    const { connect, repository, hub } = setup(t);
    const big = DEFAULT_MENU.slice(0, 20).map((p) => ({ productId: p.id, qty: 20 }));
    for (let i = 0; i < 120; i++) {
        repository.orders.push({ ...createOrder({ items: big, requestId: `r${i}`, id: `o${i}`, sequence: i + 1, now: 1, by: 'x' }, DEFAULT_MENU), principal: 'x', source: 'device', tableId: null, diningSessionId: null });
    }
    const kitchen = connect();
    const sent = [];
    const send = kitchen.hostSide.send.bind(kitchen.hostSide);
    kitchen.hostSide.send = (raw) => {
        sent.push(raw);
        send(raw);
    };
    const auth = await kitchen.client.request('auth', { credentials: [repository.device('kitchen', 'K1')] });
    assert.ok(auth.topics.kitchen.truncated > 0, '應標出截斷的筆數');
    assert.ok(Buffer.byteLength(JSON.stringify(auth.topics.kitchen)) < MAX_MESSAGE_BYTES);
    hub.notifyChanged();
    await sleep(30);
    assert.equal(hub.listConnections().length, 1, '連線不應被關');
    assert.ok(sent.some((raw) => raw.includes('"kitchen"')) && sent.every((raw) => Buffer.byteLength(raw) <= MAX_MESSAGE_BYTES));
});

test('送單速率：已經存在的 requestId 重送不計入，主機已寫入的那筆照樣回原訂單（審查 S7）', async (t) => {
    const { connect, repository } = setup(t);
    const a = connect();
    await a.client.request('auth', { credentials: [repository.device('order')] });
    let lookups = 0;
    const has = repository.hasOrderRequest.bind(repository);
    repository.hasOrderRequest = (...args) => {
        lookups += 1;
        return has(...args);
    };
    // 上限內的重送回 noop 並還回名額：重送幾次都不占新單的額度
    await a.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'a0' });
    for (let i = 0; i < 5; i++) assert.equal((await a.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'a0' })).result, 'noop');
    for (let i = 1; i < ORDER_RATE.max; i++) await a.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: `a${i}` });
    assert.equal(lookups, 0, '沒超過上限時不查索引（審查 3 N18）');
    const again = await a.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'a0' });
    assert.equal(again.result, 'noop');
    await assert.rejects(a.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'a-new' }), (err) => err.code === E.RATE_LIMITED);
});

test('回應超過訊息上限時回 INTERNAL，連線不關閉（審查 N10）', async (t) => {
    const { connect, repository, hub } = setup(t);
    const { client } = connect();
    await client.request('auth', { credentials: [repository.device('order')] });
    repository.listProducts = async () => Array.from({ length: 2000 }, (_, i) => ({ ...DEFAULT_MENU[0], id: `p${i}`, name: 'x'.repeat(40) }));
    await assert.rejects(client.request('menu.get'), (err) => err.code === 'INTERNAL');
    assert.equal(hub.listConnections().length, 1);
});

test('連線關閉時發出 closed（含 DataChannel），主機頁據此釋放 PeerConnection（審查 3 N20）', async (t) => {
    const { connect, hub } = setup(t);
    const closed = [];
    hub.on('closed', (detail) => closed.push(detail));
    const { hostSide, client, id } = connect();
    client.close();
    await sleep(10);
    assert.deepEqual(closed, [{ id, channel: hostSide }]);
});

test('送單速率：同一個身分一分鐘內超過上限回 RATE_LIMITED，其他身分不受影響；時間過了恢復', async (t) => {
    const { connect, repository, clock } = setup(t);
    const a = connect();
    const b = connect();
    await a.client.request('auth', { credentials: [repository.device('order')] });
    await b.client.request('auth', { credentials: [repository.device('order')] });
    for (let i = 0; i < ORDER_RATE.max; i++) await a.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: `a${i}` });
    await assert.rejects(a.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'a-over' }), (err) => err.code === E.RATE_LIMITED && err.retryAfterMs > 0);
    assert.equal((await b.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'b0' })).result, 'applied');
    clock.now += ORDER_RATE.windowMs;
    assert.equal((await a.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'a-later' })).result, 'applied');
});

// ---------- 配對與撤銷 ----------

test('配對：申請進入待核准清單；核准後推送授權並立即生效；拒絕推送 pair.rejected；斷線移除申請', async (t) => {
    const { connect, repository, hub } = setup(t);
    repository.tickets.push({ id: 'ticket1', token: 'tok', code: '246810' });
    const device = connect();
    await rejects(device.client.request('pair.request', { code: '111111' }), E.CODE_INVALID);
    const pending = await device.client.request('pair.request', { code: '246810', label: '  廚房平板  ' });
    assert.equal(pending.status, 'pending');
    assert.deepEqual(hub.listPairings().map((p) => p.label), ['廚房平板']);

    const approved = await hub.approvePairing(pending.pairRequestId, { role: 'kitchen', station: 'K2' });
    assert.equal(approved.station, 'K2');
    await until(() => device.pushes.some((p) => p.topic === 'pair.approved'));
    const push = device.pushes.find((p) => p.topic === 'pair.approved').data;
    assert.equal(push.role, 'kitchen');
    assert.equal(push.credential.kind, 'device');
    assert.deepEqual(await repository.verifyCredential(push.credential).then((r) => r.station), 'K2');
    assert.ok((await device.client.request('sync')).topics.kitchen, '核准後同一條連線立即取得權限');
    assert.deepEqual(hub.listPairings(), []);

    const other = connect();
    const second = await other.client.request('pair.request', { token: 'tok' });
    hub.rejectPairing(second.pairRequestId);
    await until(() => other.pushes.some((p) => p.topic === 'pair.rejected'));

    const third = connect();
    await third.client.request('pair.request', { token: 'tok' });
    assert.equal(hub.listPairings().length, 1);
    third.client.close();
    await until(() => hub.listPairings().length === 0);
    await rejects(hub.approvePairing('nope', { role: 'order' }), E.NOT_FOUND);
});

test('撤銷：持有授權的連線收到 grant.revoked，之後的請求被拒', async (t) => {
    const { connect, repository, hub } = setup(t);
    const credential = repository.device('order');
    const { client, pushes } = connect();
    await client.request('auth', { credentials: [credential] });
    await hub.revoke(credential.id);
    await until(() => pushes.some((p) => p.topic === 'grant.revoked' && p.data.credentialId === credential.id));
    await rejects(client.request('menu.get'), E.UNAUTHORIZED);
    const again = await client.request('auth', { credentials: [credential] });
    assert.equal(again.device, null);
    assert.equal(again.rejected[0].code, E.UNAUTHORIZED);
});

test('查詢授權：order.watch 只看得到那一筆', async (t) => {
    const { connect, repository } = setup(t);
    const staff = connect();
    await staff.client.request('auth', { credentials: [repository.device('order')] });
    const a = await staff.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'a' });
    await staff.client.request('order.place', { items: [{ productId: 'fries', qty: 1 }], requestId: 'b' });
    const viewer = connect();
    await rejects(viewer.client.request('order.watch', { orderId: a.order.id, token: 'wrong' }), E.UNAUTHORIZED);
    const watched = await viewer.client.request('order.watch', { orderId: a.order.id, token: a.viewToken });
    assert.equal(watched.order.number, '001');
    assert.deepEqual(watched.topics.myOrders.orders.map((o) => o.number), ['001']);
    await rejects(viewer.client.request('menu.get'), E.FORBIDDEN);
});

// ---------- 站台接手 ----------

test('接手：原站台在線時拒絕；斷線未滿 15 秒仍拒絕；之後兩個站台同時接手只有一個成功', async (t) => {
    const { connect, repository, clock } = setup(t, { pingIntervalMs: 60_000 });
    const staff = connect();
    await staff.client.request('auth', { credentials: [repository.device('order')] });
    const placed = await staff.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'x' });
    const k1 = connect();
    const k2 = connect();
    const k3 = connect();
    await k1.client.request('auth', { credentials: [repository.device('kitchen', 'K1')] });
    await k2.client.request('auth', { credentials: [repository.device('kitchen', 'K2')] });
    await k3.client.request('auth', { credentials: [repository.device('kitchen', 'K3')] });
    await k1.client.request('order.act', { orderId: placed.order.id, action: 'claim' });

    await rejects(k2.client.request('order.act', { orderId: placed.order.id, action: 'takeover', fromStation: 'K1' }), E.CONFLICT);
    k1.client.close();
    await sleep(20);
    clock.now += 10_000;
    await rejects(k2.client.request('order.act', { orderId: placed.order.id, action: 'takeover', fromStation: 'K1' }), E.CONFLICT);
    clock.now += 6_000;
    const results = await Promise.allSettled([
        k2.client.request('order.act', { orderId: placed.order.id, action: 'takeover', fromStation: 'K1' }),
        k3.client.request('order.act', { orderId: placed.order.id, action: 'takeover', fromStation: 'K1' }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, E.CONFLICT);
});

test('撤銷廚房裝置：站台立即視為離線，其他站台可以接手它備餐中的訂單（審查 M3）', async (t) => {
    const { connect, repository, hub, clock } = setup(t, { pingIntervalMs: 60_000 });
    const staff = connect();
    await staff.client.request('auth', { credentials: [repository.device('order')] });
    const placed = await staff.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'x' });
    const k1Credential = repository.device('kitchen', 'K1');
    const k1 = connect();
    const k2 = connect();
    await k1.client.request('auth', { credentials: [k1Credential] });
    await k2.client.request('auth', { credentials: [repository.device('kitchen', 'K2')] });
    await k1.client.request('order.act', { orderId: placed.order.id, action: 'claim' });
    await hub.revoke(k1Credential.id);
    k1.client.close();
    await sleep(20);
    clock.now += 60_000;
    assert.deepEqual(hub.listStations().find((s) => s.station === 'K1'), { station: 'K1', online: false, takeoverAllowed: true });
    const taken = await k2.client.request('order.act', { orderId: placed.order.id, action: 'takeover', fromStation: 'K1' });
    assert.equal(taken.order.station, 'K2');
});

test('接手：站台斷線後，到可以接手的時間點再推送一次，其他廚房看得到 takeoverAllowed', async (t) => {
    // 長延遲的計時器先攔下來，由測試推進假時鐘後手動觸發
    const delayed = [];
    const timers = {
        setTimeout: (fn, ms) => (ms > 1000 ? (delayed.push({ fn, ms }), -delayed.length) : setTimeout(fn, ms)),
        clearTimeout: (id) => (id < 0 ? (delayed[-id - 1].fn = null) : clearTimeout(id)),
        setInterval: (fn, ms) => setInterval(fn, ms),
        clearInterval: (id) => clearInterval(id),
    };
    const { connect, repository, clock } = setup(t, { pingIntervalMs: 60_000, timers });
    const k1 = connect();
    const k2 = connect();
    await k1.client.request('auth', { credentials: [repository.device('kitchen', 'K1')] });
    await k2.client.request('auth', { credentials: [repository.device('kitchen', 'K2')] });
    k1.client.close();
    await until(() => delayed.length === 1);
    assert.equal(delayed[0].ms, 15_050);
    const stationsOf = (p) => Object.fromEntries(p.data.stations.map((s) => [s.station, s.takeoverAllowed]));
    await until(() => k2.pushes.some((p) => p.topic === 'kitchen' && stationsOf(p).K1 === false));
    clock.now += 15_050;
    delayed[0].fn();
    await until(() => k2.pushes.some((p) => p.topic === 'kitchen' && stationsOf(p).K1 === true));
});

// ---------- 連線品質 ----------

test('不合格訊息：有 id 的回 BAD_MESSAGE、沒有的丟棄，都計數；累計 20 則後關閉', async (t) => {
    const { connect, hub } = setup(t);
    const { peerSide, id } = connect();
    const replies = [];
    peerSide.addEventListener('message', (event) => replies.push(JSON.parse(event.data)));
    peerSide.send('{"v":1,"type":"req","id":"bad1"}');
    peerSide.send('garbage');
    await sleep(10);
    assert.deepEqual(replies.map((r) => [r.id, r.error?.code]), [['bad1', E.BAD_MESSAGE]]);
    assert.equal(hub.listConnections().find((c) => c.id === id).badMessages, 2);
    for (let i = 2; i < BAD_MESSAGE_LIMIT; i++) peerSide.send('garbage');
    await until(() => !hub.listConnections().some((c) => c.id === id));
    assert.equal(peerSide.readyState, 'closed');
});

test('心跳：主機定期送 ping，peer 自動回 pong；15 秒沒有訊息就關閉', async (t) => {
    const { connect, hub, clock } = setup(t, { pingIntervalMs: 20 });
    const alive = connect();
    const silent = connect();
    silent.client.close = () => {}; // 不讓測試結束時的 close 影響
    // silent 的 peer 端停止回應：移除 RPC client 的監聽
    silent.peerSide.removeEventListener('message', silent.client._onMessage);
    await sleep(60);
    assert.ok(alive.hostSide.sent.some((raw) => JSON.parse(raw).type === 'ping'));
    assert.ok(alive.peerSide.sent.some((raw) => JSON.parse(raw).type === 'pong'));
    // 每次推進 5 秒：alive 收到 ping 就回 pong、更新 lastSeenAt；silent 沒有回應，累計超過 15 秒後被關閉
    for (let i = 0; i < 4; i++) {
        clock.now += 5_000;
        await sleep(60);
    }
    await until(() => hub.listConnections().length === 1, 2000);
    assert.equal(hub.listConnections()[0].id, alive.id);
});

test('背壓：bufferedAmount 超過 1 MiB 時暫停推送，bufferedamountlow 後送一份最新快照', async (t) => {
    const { connect, repository, hub } = setup(t);
    const kitchen = connect();
    await kitchen.client.request('auth', { credentials: [repository.device('kitchen', 'K1')] });
    const staff = connect();
    await staff.client.request('auth', { credentials: [repository.device('order')] });
    kitchen.hostSide.bufferedAmount = BUFFER_HIGH_BYTES + 1;
    const before = kitchen.pushes.length;
    await staff.client.request('order.place', { items: [{ productId: 'burger', qty: 1 }], requestId: 'p1' });
    await staff.client.request('order.place', { items: [{ productId: 'cola', qty: 1 }], requestId: 'p2' });
    await sleep(40);
    assert.equal(kitchen.pushes.length, before, '暫停期間不推送');
    assert.equal(hub.listConnections().find((c) => c.id === kitchen.id).paused, true);
    kitchen.hostSide.bufferedAmount = 0;
    kitchen.hostSide.dispatchEvent(new Event('bufferedamountlow'));
    await until(() => kitchen.pushes.length > before);
    assert.equal(kitchen.pushes.at(-1).data.orders.length, 2, '恢復後送最新快照，不補送中間的推送');
});

// ---------- RPC client ----------

test('RPC client：逾時與通道關閉回 HOST_UNAVAILABLE；主機沉默超過上限視為失聯；rev 跳號發出 gap', async (t) => {
    const [hostSide, peerSide] = channelPair();
    let now = 0;
    const client = new PosV2RpcClient({ channel: peerSide, now: () => now, requestTimeoutMs: 30, hostTimeoutMs: 1000 });
    t.after(() => client.close());
    await rejects(client.request('sync'), 'HOST_UNAVAILABLE');

    const gaps = [];
    client.on('gap', (g) => gaps.push(g));
    hostSide.send(JSON.stringify({ v: 1, type: 'push', topic: 'kitchen', rev: 1, data: {} }));
    hostSide.send(JSON.stringify({ v: 1, type: 'push', topic: 'kitchen', rev: 3, data: {} }));
    await sleep(5);
    assert.deepEqual(gaps, [{ from: 1, to: 3 }]);

    const slow = new PosV2RpcClient({ channel: channelPair()[1], now: () => now, requestTimeoutMs: 60_000, hostTimeoutMs: 1000 });
    const pending = rejects(slow.request('sync'), 'HOST_UNAVAILABLE');
    const closed = new Promise((resolve) => client.on('closed', resolve));
    now = 2000;
    assert.equal((await closed).reason, 'host timeout');
    await pending; // 主機失聯時，還在等回覆的請求一起以 HOST_UNAVAILABLE 結束
    assert.equal(hostSide.readyState, 'closed');
    await rejects(client.request('sync'), 'HOST_UNAVAILABLE');
});
