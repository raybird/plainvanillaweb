import test from 'node:test';
import assert from 'node:assert';

// 純快照邏輯 (EventTarget 為 Node 內建)，無需 mock。
const { HistoryService } = await import('../lib/history-service.js');

test('初始狀態不可 undo / redo', () => {
    const h = new HistoryService();
    assert.strictEqual(h.canUndo, false);
    assert.strictEqual(h.canRedo, false);
});

test('push 後可 undo，且儲存的是深拷貝快照', () => {
    const h = new HistoryService();
    const state = { count: 1 };
    h.push(state);
    state.count = 999; // 變更原物件不應影響已存快照
    assert.strictEqual(h.canUndo, true);
    assert.deepStrictEqual(h.undoStack[0], { count: 1 });
});

test('undo 回傳上一個快照並將當前狀態移入 redo 棧', () => {
    const h = new HistoryService();
    h.push({ count: 1 });
    const restored = h.undo({ count: 2 });
    assert.deepStrictEqual(restored, { count: 1 });
    assert.strictEqual(h.canRedo, true);
    assert.strictEqual(h.canUndo, false);
});

test('redo 還原被撤銷的狀態', () => {
    const h = new HistoryService();
    h.push({ count: 1 });
    h.undo({ count: 2 });
    const redone = h.redo({ count: 1 });
    assert.deepStrictEqual(redone, { count: 2 });
});

test('新的 push 會清空 redo 棧', () => {
    const h = new HistoryService();
    h.push({ v: 1 });
    h.undo({ v: 2 });
    assert.strictEqual(h.canRedo, true);
    h.push({ v: 3 });
    assert.strictEqual(h.canRedo, false);
});

test('undo / redo 在棧為空時回傳 null', () => {
    const h = new HistoryService();
    assert.strictEqual(h.undo({ v: 1 }), null);
    assert.strictEqual(h.redo({ v: 1 }), null);
});

test('undoStack 受 maxSize 限制 (丟棄最舊項目)', () => {
    const h = new HistoryService(2);
    h.push({ n: 1 });
    h.push({ n: 2 });
    h.push({ n: 3 });
    assert.strictEqual(h.undoStack.length, 2);
    assert.deepStrictEqual(h.undoStack[0], { n: 2 });
});

test('push 發出帶有 canUndo / 計數的 change 事件', () => {
    const h = new HistoryService();
    let payload = null;
    h.on('change', (d) => { payload = d; });
    h.push({ n: 1 });
    assert.strictEqual(payload.canUndo, true);
    assert.strictEqual(payload.undoCount, 1);
});

test('clear 重置兩個棧', () => {
    const h = new HistoryService();
    h.push({ n: 1 });
    h.clear();
    assert.strictEqual(h.canUndo, false);
    assert.strictEqual(h.canRedo, false);
});

test('snapshots preserve native structured data and cyclic references', () => {
    const h = new HistoryService();
    const original = { when: new Date(0), values: new Map([['size', 42n]]) };
    original.self = original;
    h.push(original);
    const restored = h.undo('current');
    assert.deepStrictEqual(restored.when, original.when);
    assert.deepStrictEqual(restored.values, original.values);
    assert.strictEqual(restored.self, restored);
});

test('failed snapshot creation does not consume undo or disable future pushes', () => {
    const h = new HistoryService();
    h.push('initial');
    assert.throws(() => h.undo({ value: 1n, callback: () => {} }), { name: 'DataCloneError' });
    assert.strictEqual(h.canUndo, true);
    assert.strictEqual(h.canRedo, false);
    h.push('next');
    assert.strictEqual(h.undo('current'), 'next');
});

test('existing JSON-compatible reactive state can still be snapshotted', () => {
    const h = new HistoryService();
    const state = new Proxy({ count: 3 }, {});
    h.push(state);
    state.count = 4;
    assert.deepStrictEqual(h.undo(state), { count: 3 });
});
