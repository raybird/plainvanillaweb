import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MENU, createOrder } from '../components/pages/solutions/pos/pos-model.js';
import {
    CHANNEL_ATTEMPT_POLICY,
    CREDENTIAL_KIND,
    LIMITS,
    ORDER_SOURCE,
    ORDER_STATUS,
    POS_V2_ERROR_CODES,
    SESSION_STATUS,
    TARGET_ATTEMPT_POLICY,
    aheadCount,
    assertAttemptAllowed,
    assertPairingValid,
    authorizeMethod,
    canViewOrder,
    closeDiningSession,
    createAttemptState,
    createDeviceCredential,
    createPairingTicket,
    createTableCredential,
    decidePlaceOrder,
    deriveViewToken,
    decideTableJoin,
    evaluateAttempt,
    hashSecret,
    isStationOffline,
    openDiningSession,
    principalOf,
    projectCustomerOrder,
    randomCode,
    randomToken,
    registerFailure,
    registerSuccess,
    rotateSessionCode,
    safeEqual,
    verifyCredential,
    withV2Fields,
} from '../components/pages/solutions/pos-v2/pos-v2-model.js';

const code = (name) => (err) => err.code === POS_V2_ERROR_CODES[name];

const order = ({ id, sequence, status = ORDER_STATUS.PENDING, principal = 'table:c1' }) => ({
    ...createOrder({ items: [{ productId: 'burger', qty: 1 }], requestId: `r-${id}`, id, sequence, now: 1000 }, DEFAULT_MENU),
    status,
    principal,
});

const tableGrant = (overrides = {}) => ({
    ...createTableCredential({ id: 'c1', secretHash: 'h', tableId: 'T1', diningSessionId: 's1', now: 0 }),
    ...overrides,
});
const deviceGrant = (role, station = null) => createDeviceCredential({ id: `d-${role}`, secretHash: 'h', role, station: station ?? (role === 'kitchen' ? 'A' : null), now: 0 });
const openSession = (overrides = {}) => ({ ...openDiningSession({ id: 's1', tableId: 'T1', codeHash: 'ch', now: 0 }), ...overrides });

test('randomToken 產生 base64url，預設 128 bit', () => {
    const token = randomToken();
    assert.match(token, /^[A-Za-z0-9_-]{22}$/);
    assert.notEqual(randomToken(), token);
    assert.match(randomToken(32), /^[A-Za-z0-9_-]{43}$/);
});

test('randomCode 固定位數且補零', () => {
    for (let i = 0; i < 200; i++) assert.match(randomCode(), /^\d{6}$/);
    assert.match(randomCode(4), /^\d{4}$/);
    assert.throws(() => randomCode(0), RangeError);
    assert.throws(() => randomCode(10), RangeError);
});

test('hashSecret 為 SHA-256 base64url，同輸入同輸出', async () => {
    const a = await hashSecret('secret');
    assert.equal(a, 'K7gNU3sdo-OL0wNhqoVWhr3g6s1xYv72ol_pe_Unols');
    assert.equal(await hashSecret('secret'), a);
    assert.notEqual(await hashSecret('secret2'), a);
    await assert.rejects(() => hashSecret(''), TypeError);
});

test('deriveViewToken：同一訂單同一值；訂單或 hostSecret 不同就不同', async () => {
    const token = await deriveViewToken('host-secret', 'order-1');
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await deriveViewToken('host-secret', 'order-1'), token);
    assert.notEqual(await deriveViewToken('host-secret', 'order-2'), token);
    assert.notEqual(await deriveViewToken('other-secret', 'order-1'), token);
    await assert.rejects(() => deriveViewToken('', 'order-1'), TypeError);
});

test('safeEqual 只在完全相同時為真', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
    assert.equal(safeEqual(undefined, undefined), false);
    assert.equal(safeEqual('abc', null), false);
});

test('principalOf 依授權種類與 id 組成，格式錯誤拒絕', () => {
    assert.equal(principalOf({ kind: 'device', id: 'x' }), 'device:x');
    assert.equal(principalOf({ kind: 'table', id: 'y' }), 'table:y');
    assert.throws(() => principalOf({ kind: 'admin', id: 'x' }), code('UNAUTHORIZED'));
    assert.throws(() => principalOf(null), code('UNAUTHORIZED'));
});

test('店員裝置授權：角色必須合法，廚房必須指定站台', () => {
    const kitchen = createDeviceCredential({ id: 'd1', secretHash: 'h', role: 'kitchen', station: ' A ', now: 5 });
    assert.equal(kitchen.station, 'A');
    assert.equal(kitchen.kind, CREDENTIAL_KIND.DEVICE);
    assert.equal(createDeviceCredential({ id: 'd2', secretHash: 'h', role: 'display', station: 'X', now: 5 }).station, null);
    assert.throws(() => createDeviceCredential({ id: 'd3', secretHash: 'h', role: 'kitchen', now: 5 }), code('INVALID_ORDER'));
    assert.throws(() => createDeviceCredential({ id: 'd4', secretHash: 'h', role: 'admin', now: 5 }), code('INVALID_ORDER'));
});

test('verifyCredential：雜湊不符、已撤銷、不存在都拒絕', () => {
    const record = tableGrant({ secretHash: 'good' });
    assert.equal(verifyCredential(record, 'good'), record);
    assert.throws(() => verifyCredential(record, 'bad'), code('UNAUTHORIZED'));
    assert.throws(() => verifyCredential({ ...record, revokedAt: 1 }, 'good'), code('UNAUTHORIZED'));
    assert.throws(() => verifyCredential(undefined, 'good'), code('UNAUTHORIZED'));
});

test('開桌：同一桌已開桌時拒絕；關桌後可以再開新場次', () => {
    const first = openDiningSession({ id: 's1', tableId: 'T1', codeHash: 'c', now: 1 });
    assert.equal(first.status, SESSION_STATUS.OPEN);
    assert.throws(() => openDiningSession({ id: 's2', tableId: 'T1', codeHash: 'c', now: 2, current: first }), code('CONFLICT'));
    const closed = closeDiningSession(first, 3);
    assert.equal(closed.status, SESSION_STATUS.CLOSED);
    assert.equal(closed.closedAt, 3);
    assert.equal(closeDiningSession(closed, 9), closed, '重複關桌冪等');
    assert.equal(openDiningSession({ id: 's2', tableId: 'T1', codeHash: 'c', now: 4, current: closed }).id, 's2');
    assert.throws(() => closeDiningSession(undefined, 1), code('NOT_FOUND'));
});

test('輪換入桌碼：舊碼失效；已關桌不能輪換', () => {
    const session = openSession();
    const rotated = rotateSessionCode(session, 'new');
    assert.throws(() => decideTableJoin({ session: rotated, codeHash: 'ch' }), code('CODE_INVALID'));
    assert.equal(decideTableJoin({ session: rotated, codeHash: 'new' }), rotated);
    assert.throws(() => rotateSessionCode(closeDiningSession(session, 1), 'x'), code('SESSION_CLOSED'));
});

test('入桌：沒有開啟中的場次拒絕、入桌碼錯誤拒絕', () => {
    assert.throws(() => decideTableJoin({ session: null, codeHash: 'ch' }), code('SESSION_CLOSED'));
    assert.throws(() => decideTableJoin({ session: closeDiningSession(openSession(), 1), codeHash: 'ch' }), code('SESSION_CLOSED'));
    assert.throws(() => decideTableJoin({ session: openSession(), codeHash: 'wrong' }), code('CODE_INVALID'));
    assert.equal(decideTableJoin({ session: openSession(), codeHash: 'ch' }).id, 's1');
});

test('配對票：期限內有效，到期拒絕', () => {
    const ticket = createPairingTicket({ id: 'p', tokenHash: 't', codeHash: 'c', now: 1000 });
    assert.equal(ticket.expiresAt, 1000 + LIMITS.PAIRING_TTL_MS);
    assert.equal(assertPairingValid(ticket, ticket.expiresAt - 1), ticket);
    assert.throws(() => assertPairingValid(ticket, ticket.expiresAt), code('PAIRING_EXPIRED'));
    assert.throws(() => assertPairingValid(undefined, 0), code('PAIRING_EXPIRED'));
});

test('每條連線：連續錯 5 次冷卻 60 秒，冷卻中連正確的碼也拒絕，成功歸零', () => {
    let state = createAttemptState();
    for (let i = 0; i < 4; i++) state = registerFailure(state, 1000 + i, CHANNEL_ATTEMPT_POLICY);
    assert.equal(evaluateAttempt(state, 2000).allowed, true);
    assert.deepEqual(registerSuccess(state, CHANNEL_ATTEMPT_POLICY), createAttemptState(), '成功後歸零');

    state = registerFailure(state, 1004, CHANNEL_ATTEMPT_POLICY);
    assert.deepEqual(evaluateAttempt(state, 1004), { allowed: false, retryAfterMs: 60000 });
    assert.throws(() => assertAttemptAllowed(state, 30000), (err) => err.code === 'RATE_LIMITED' && err.retryAfterMs === 31004);
    assert.equal(evaluateAttempt(state, 1004 + 60000).allowed, true);
    assert.deepEqual(state.failures, [], '進入冷卻時清空計數');
});

test('每張桌：每分鐘 30 次錯誤才鎖定，視窗外的錯誤不計，成功不歸零', () => {
    let state = createAttemptState();
    for (let i = 0; i < 29; i++) state = registerFailure(state, i * 1000, TARGET_ATTEMPT_POLICY);
    assert.equal(evaluateAttempt(state, 28000).allowed, true);
    assert.equal(registerSuccess(state, TARGET_ATTEMPT_POLICY), state, '成功不歸零');

    // 第 60 秒時，第 0 秒那次已出視窗：視窗內只有 28 次，加上這次 29 次，仍未鎖定
    const sliding = registerFailure(state, 60000, TARGET_ATTEMPT_POLICY);
    assert.equal(evaluateAttempt(sliding, 60000).allowed, true);
    assert.equal(sliding.failures.length, 29);

    // 一分鐘內的第 30 次：鎖定
    const locked = registerFailure(state, 29000, TARGET_ATTEMPT_POLICY);
    assert.deepEqual(evaluateAttempt(locked, 29000), { allowed: false, retryAfterMs: 60000 });
});

test('送單：既有訂單（主機已寫入、回覆遺失）直接回傳原訂單，即使已關桌', () => {
    const existing = order({ id: 'o1', sequence: 1 });
    const closed = closeDiningSession(openSession(), 5);
    const outcome = decidePlaceOrder({ existing, grant: tableGrant(), session: closed });
    assert.deepEqual(outcome, { result: 'noop', order: existing });
});

test('送單：既有訂單屬於其他身分時拒絕（拿別人的 requestId 取不到別人的訂單）', () => {
    const existing = order({ id: 'o1', sequence: 1, principal: 'table:someone-else' });
    assert.throws(() => decidePlaceOrder({ existing, grant: tableGrant(), session: openSession() }), code('UNAUTHORIZED'));
});

test('送單：入桌授權的桌位與場次取自授權，忽略參數；場次關閉或換場次拒絕', () => {
    const outcome = decidePlaceOrder({ existing: undefined, grant: tableGrant(), session: openSession(), tableId: 'T9' });
    assert.deepEqual(outcome, {
        result: 'create',
        fields: { principal: 'table:c1', source: ORDER_SOURCE.TABLE, tableId: 'T1', diningSessionId: 's1' },
    });
    assert.throws(() => decidePlaceOrder({ grant: tableGrant(), session: closeDiningSession(openSession(), 1) }), code('SESSION_CLOSED'));
    assert.throws(() => decidePlaceOrder({ grant: tableGrant(), session: openSession({ id: 's2' }) }), code('SESSION_CLOSED'),
        '關桌再開桌後，舊場次的授權不能送單到新場次');
    assert.throws(() => decidePlaceOrder({ grant: tableGrant(), session: null }), code('SESSION_CLOSED'));
});

test('送單：店員點餐裝置可不帶桌號；帶桌號時該桌要開桌；非點餐角色拒絕；沒有授權拒絕', () => {
    const grant = deviceGrant('order');
    assert.deepEqual(decidePlaceOrder({ grant, session: null }).fields,
        { principal: 'device:d-order', source: ORDER_SOURCE.DEVICE, tableId: null, diningSessionId: null });
    assert.deepEqual(decidePlaceOrder({ grant, session: openSession(), tableId: 'T1' }).fields,
        { principal: 'device:d-order', source: ORDER_SOURCE.DEVICE, tableId: 'T1', diningSessionId: 's1' });
    assert.throws(() => decidePlaceOrder({ grant, session: null, tableId: 'T1' }), code('SESSION_CLOSED'));
    assert.throws(() => decidePlaceOrder({ grant, session: openSession(), tableId: 'T2' }), code('SESSION_CLOSED'));
    assert.throws(() => decidePlaceOrder({ grant: deviceGrant('kitchen'), session: null }), code('FORBIDDEN'));
    assert.throws(() => decidePlaceOrder({ grant: null, session: null }), code('UNAUTHORIZED'));
});

test('withV2Fields 保留第一代欄位並加上第二代欄位', () => {
    const base = order({ id: 'o1', sequence: 1 });
    const v2 = withV2Fields(base, { principal: 'device:d', source: 'device', tableId: null, diningSessionId: null });
    assert.equal(v2.number, base.number);
    assert.equal(v2.source, 'device');
    assert.equal(v2.principal, 'device:d');
});

test('前面待備餐筆數：只算待處理且序號較小的；不是待處理時為 null', () => {
    const orders = [
        order({ id: 'a', sequence: 1 }),
        order({ id: 'b', sequence: 2, status: ORDER_STATUS.PREPARING }),
        order({ id: 'c', sequence: 3 }),
        order({ id: 'd', sequence: 4 }),
        order({ id: 'e', sequence: 5, status: ORDER_STATUS.CANCELLED }),
    ];
    assert.equal(aheadCount(orders, orders[3]), 2, '序號 1、3 待處理；序號 2 備餐中不算');
    assert.equal(aheadCount(orders, orders[0]), 0);
    assert.equal(aheadCount(orders, orders[1]), null);
    // 序號 1 被認領後減少
    const claimed = [{ ...orders[0], status: ORDER_STATUS.PREPARING }, ...orders.slice(1)];
    assert.equal(aheadCount(claimed, claimed[3]), 1);
});

test('權限：公開方法任何人可呼叫；未驗證回 UNAUTHORIZED，角色不符回 FORBIDDEN', () => {
    const none = {};
    for (const method of ['auth', 'pair.request', 'table.listOpen', 'table.join', 'order.watch']) {
        assert.doesNotThrow(() => authorizeMethod(method, none));
    }
    assert.throws(() => authorizeMethod('sync', none), code('UNAUTHORIZED'));
    assert.throws(() => authorizeMethod('order.place', none), code('UNAUTHORIZED'));
    assert.throws(() => authorizeMethod('order.act', none, { action: 'claim' }), code('UNAUTHORIZED'));

    assert.doesNotThrow(() => authorizeMethod('order.place', { table: tableGrant() }));
    assert.doesNotThrow(() => authorizeMethod('menu.get', { device: deviceGrant('order') }));
    assert.throws(() => authorizeMethod('order.place', { device: deviceGrant('display') }), code('FORBIDDEN'));
    assert.throws(() => authorizeMethod('order.place', { watches: new Set(['o1']) }), code('FORBIDDEN'));
    assert.doesNotThrow(() => authorizeMethod('sync', { watches: new Set(['o1']) }));
});

test('權限：廚房只能 claim／ready／takeover，叫號只能 pickup，沒有人能遠端 cancel', () => {
    const kitchen = { device: deviceGrant('kitchen') };
    const display = { device: deviceGrant('display') };
    for (const action of ['claim', 'ready', 'takeover']) assert.doesNotThrow(() => authorizeMethod('order.act', kitchen, { action }));
    assert.throws(() => authorizeMethod('order.act', kitchen, { action: 'pickup' }), code('FORBIDDEN'));
    assert.doesNotThrow(() => authorizeMethod('order.act', display, { action: 'pickup' }));
    assert.throws(() => authorizeMethod('order.act', display, { action: 'claim' }), code('FORBIDDEN'), '叫號裝置送出認領被拒');
    for (const grants of [kitchen, display, { device: deviceGrant('order') }, { table: tableGrant() }]) {
        assert.throws(() => authorizeMethod('order.act', grants, { action: 'cancel' }), code('FORBIDDEN'));
    }
    assert.throws(() => authorizeMethod('order.delete', kitchen), code('BAD_MESSAGE'));
});

test('查單：只看得到自己建立的或以查詢授權開啟的訂單；投影不含內部欄位', () => {
    const mine = withV2Fields(order({ id: 'o1', sequence: 1 }), { principal: 'table:c1', source: 'table', tableId: 'T1', diningSessionId: 's1' });
    const other = withV2Fields(order({ id: 'o2', sequence: 2, principal: 'table:c2' }), { principal: 'table:c2', source: 'table', tableId: 'T2', diningSessionId: 's9' });
    assert.equal(canViewOrder(mine, { principal: 'table:c1' }), true);
    assert.equal(canViewOrder(other, { principal: 'table:c1' }), false);
    assert.equal(canViewOrder(other, { principal: null, watches: new Set(['o2']) }), true);
    assert.equal(canViewOrder(other, { principal: null }), false);

    const projected = projectCustomerOrder(other, [mine, other]);
    assert.equal(projected.aheadCount, 1);
    assert.equal(projected.tableId, 'T2');
    for (const key of ['principal', 'history', 'requestId', 'diningSessionId', 'station']) {
        assert.equal(key in projected, false, `投影不應含 ${key}`);
    }
});

test('站台接手：斷線且超過逾時才算離線；主機剛重新整理時以啟動時間起算', () => {
    const now = 100000;
    assert.equal(isStationOffline({ connected: true, lastSeenAt: 0 }, now, 0), false, '仍連線中');
    assert.equal(isStationOffline({ connected: false, lastSeenAt: now - LIMITS.PEER_TIMEOUT_MS }, now, 0), false, '剛好逾時邊界不算');
    assert.equal(isStationOffline({ connected: false, lastSeenAt: now - LIMITS.PEER_TIMEOUT_MS - 1 }, now, 0), true);
    assert.equal(isStationOffline(undefined, now, now - 1000), false, '主機剛啟動，原站台可能正在重連');
    assert.equal(isStationOffline(undefined, now, now - LIMITS.PEER_TIMEOUT_MS - 1), true);
});
