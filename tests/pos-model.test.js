import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_MENU,
    ORDER_STATUS,
    POS_ERROR_CODES,
    PosError,
    createOrder,
    decideTransition,
    formatOrderNumber,
    summarizeOrders,
} from '../components/pages/solutions/pos/pos-model.js';

const newOrder = (overrides = {}) => createOrder({
    items: [{ productId: 'burger', qty: 2 }, { productId: 'cola', qty: 1 }],
    requestId: 'r1',
    id: 'o1',
    sequence: 1,
    now: 1000,
    ...overrides,
}, DEFAULT_MENU);

const apply = (order, action, actor, extra = {}) => decideTransition(order, { action, actor, now: 2000, ...extra });

const rejects = (fn, code) => assert.throws(fn, (err) => err instanceof PosError && err.code === code);

test('formatOrderNumber 補成三位數並在 999 之後循環', () => {
    assert.equal(formatOrderNumber(1), '001');
    assert.equal(formatOrderNumber(42), '042');
    assert.equal(formatOrderNumber(999), '999');
    assert.equal(formatOrderNumber(1000), '001');
    assert.throws(() => formatOrderNumber(0), RangeError);
});

test('createOrder 以菜單價格計算、合併重複品項並拒絕不合法的購物車', () => {
    const order = newOrder({ items: [{ productId: 'burger', qty: 1 }, { productId: 'burger', qty: 1 }, { productId: 'cola', qty: 1 }] });
    assert.equal(order.number, '001');
    assert.equal(order.status, ORDER_STATUS.PENDING);
    assert.deepEqual(order.items.map((l) => [l.productId, l.qty, l.price]), [['burger', 2, 120], ['cola', 1, 35]]);
    assert.equal(order.total, 275);
    assert.equal(order.version, 1);
    assert.equal(order.history.length, 1);

    rejects(() => newOrder({ items: [] }), POS_ERROR_CODES.INVALID_ORDER);
    rejects(() => newOrder({ items: [{ productId: 'nope', qty: 1 }] }), POS_ERROR_CODES.INVALID_ORDER);
    rejects(() => newOrder({ items: [{ productId: 'burger', qty: 0 }] }), POS_ERROR_CODES.INVALID_ORDER);
    rejects(() => newOrder({ items: [{ productId: 'burger', qty: 1.5 }] }), POS_ERROR_CODES.INVALID_ORDER);
    rejects(() => newOrder({ items: [{ productId: 'burger', qty: 21 }] }), POS_ERROR_CODES.INVALID_ORDER);
    rejects(() => newOrder({ requestId: '' }), POS_ERROR_CODES.INVALID_ORDER);
});

test('完整流程：認領 → 完成 → 取餐，每步遞增版本並記錄歷程', () => {
    let order = newOrder();
    order = apply(order, 'claim', 'K-A').order;
    assert.equal(order.status, ORDER_STATUS.PREPARING);
    assert.equal(order.station, 'K-A');
    order = apply(order, 'ready', 'K-A').order;
    assert.equal(order.status, ORDER_STATUS.READY);
    order = apply(order, 'pickup', 'display').order;
    assert.equal(order.status, ORDER_STATUS.PICKED_UP);
    assert.equal(order.version, 4);
    assert.deepEqual(order.history.map((h) => h.status), ['pending', 'preparing', 'ready', 'picked_up']);
});

test('重送已生效的動作是 noop（冪等），不改版本', () => {
    const claimed = apply(newOrder(), 'claim', 'K-A').order;
    const again = apply(claimed, 'claim', 'K-A');
    assert.equal(again.result, 'noop');
    assert.equal(again.order, claimed);
    const ready = apply(claimed, 'ready', 'K-A').order;
    assert.equal(apply(ready, 'ready', 'K-A').result, 'noop');
    const picked = apply(ready, 'pickup', 'display').order;
    assert.equal(apply(picked, 'pickup', 'admin').result, 'noop');
    const cancelled = apply(newOrder(), 'cancel', 'admin').order;
    assert.equal(apply(cancelled, 'cancel', 'admin').result, 'noop');
});

test('其他站台已認領或接手時回報 CONFLICT', () => {
    const claimed = apply(newOrder(), 'claim', 'K-A').order;
    rejects(() => apply(claimed, 'claim', 'K-B'), POS_ERROR_CODES.CONFLICT);
    rejects(() => apply(claimed, 'ready', 'K-B'), POS_ERROR_CODES.CONFLICT);
    const ready = apply(claimed, 'ready', 'K-A').order;
    rejects(() => apply(ready, 'ready', 'K-B'), POS_ERROR_CODES.CONFLICT);
});

test('接手必須指定原站台；兩個站台同時接手只有一個成功', () => {
    const claimed = apply(newOrder(), 'claim', 'K-A').order;
    rejects(() => apply(claimed, 'takeover', 'K-B'), POS_ERROR_CODES.INVALID_TRANSITION);
    const byB = apply(claimed, 'takeover', 'K-B', { fromStation: 'K-A' });
    assert.equal(byB.result, 'applied');
    assert.equal(byB.order.station, 'K-B');
    // K-C 以同樣的前提接手，但交易內讀到的已經是 K-B 接手後的版本
    rejects(() => apply(byB.order, 'takeover', 'K-C', { fromStation: 'K-A' }), POS_ERROR_CODES.CONFLICT);
    assert.equal(apply(byB.order, 'takeover', 'K-B', { fromStation: 'K-A' }).result, 'noop');
    // 接手後由新站台完成，原站台不能再完成
    rejects(() => apply(byB.order, 'ready', 'K-A'), POS_ERROR_CODES.CONFLICT);
    assert.equal(apply(byB.order, 'ready', 'K-B').order.status, ORDER_STATUS.READY);
});

test('不合法的轉移與找不到訂單', () => {
    const order = newOrder();
    rejects(() => apply(order, 'ready', 'K-A'), POS_ERROR_CODES.INVALID_TRANSITION);
    rejects(() => apply(order, 'pickup', 'display'), POS_ERROR_CODES.INVALID_TRANSITION);
    rejects(() => apply(order, 'takeover', 'K-B', { fromStation: 'K-A' }), POS_ERROR_CODES.INVALID_TRANSITION);
    const claimed = apply(order, 'claim', 'K-A').order;
    rejects(() => apply(claimed, 'cancel', 'admin'), POS_ERROR_CODES.INVALID_TRANSITION);
    const cancelled = apply(order, 'cancel', 'admin').order;
    rejects(() => apply(cancelled, 'claim', 'K-A'), POS_ERROR_CODES.INVALID_TRANSITION);
    rejects(() => apply(undefined, 'claim', 'K-A'), POS_ERROR_CODES.NOT_FOUND);
    rejects(() => apply(order, 'refund', 'admin'), POS_ERROR_CODES.INVALID_TRANSITION);
    rejects(() => apply(order, 'claim', ''), POS_ERROR_CODES.INVALID_TRANSITION);
});

test('summarizeOrders 統計狀態、營收（不含取消）、備餐時間與熱銷品項', () => {
    const a = decideTransition(decideTransition(newOrder(), { action: 'claim', actor: 'K-A', now: 2000 }).order,
        { action: 'ready', actor: 'K-A', now: 5000 }).order;
    const b = newOrder({ id: 'o2', requestId: 'r2', sequence: 2, items: [{ productId: 'fries', qty: 3 }] });
    const c = apply(newOrder({ id: 'o3', requestId: 'r3', sequence: 3 }), 'cancel', 'admin').order;
    const summary = summarizeOrders([a, b, c]);
    assert.equal(summary.counts.ready, 1);
    assert.equal(summary.counts.pending, 1);
    assert.equal(summary.counts.cancelled, 1);
    assert.equal(summary.revenue, 275 + 150);
    assert.equal(summary.completed, 1);
    assert.equal(summary.avgPrepMs, 3000);
    assert.deepEqual(summary.topItems.map((i) => [i.name, i.qty]), [['薯條', 3], ['經典漢堡', 2], ['可樂', 1]]);
    assert.equal(summarizeOrders([]).avgPrepMs, null);
});
