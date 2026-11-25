import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FARM_LIMITS,
    FarmError,
    checkImport,
    findOrphanOutputs,
    fitWidth,
    normalizeParams,
    outputKey,
    outputName,
    summarizeRun,
} from '../components/pages/solutions/farm/farm-model.js';

const MB = 1024 * 1024;

test('normalizeParams 驗證寬度、格式與品質', () => {
    assert.deepEqual(normalizeParams({}), { maxWidth: 640, format: 'image/webp', quality: 0.8 });
    assert.deepEqual(normalizeParams({ maxWidth: '320', format: 'image/jpeg', quality: '1' }), { maxWidth: 320, format: 'image/jpeg', quality: 1 });
    for (const bad of [{ maxWidth: 8 }, { maxWidth: 5000 }, { maxWidth: 12.5 }, { format: 'image/gif' }, { quality: 0 }, { quality: 1.2 }, { quality: 'x' }]) {
        assert.throws(() => normalizeParams(bad), (err) => err instanceof FarmError && err.code === 'INVALID_PARAMS', JSON.stringify(bad));
    }
});

test('fitWidth 等比例縮小、不放大', () => {
    assert.deepEqual(fitWidth(1600, 1200, 320), { width: 320, height: 240 });
    assert.deepEqual(fitWidth(300, 200, 320), { width: 300, height: 200 });
    assert.deepEqual(fitWidth(5000, 1, 100), { width: 100, height: 1 });
});

test('checkImport 依類型、單檔、張數與總容量逐一篩選', () => {
    const files = [
        { name: 'a.png', type: 'image/png', size: 1 * MB },
        { name: 'notes.txt', type: 'text/plain', size: 10 },
        { name: 'huge.jpg', type: 'image/jpeg', size: FARM_LIMITS.maxFileBytes + 1 },
        { name: 'b.webp', type: 'image/webp', size: 2 * MB },
    ];
    const result = checkImport(files);
    assert.deepEqual(result.accepted.map((f) => f.name), ['a.png', 'b.webp']);
    assert.deepEqual(result.rejected.map((r) => r.name), ['notes.txt', 'huge.jpg']);
    assert.equal(result.totalBytes, 3 * MB);

    const full = checkImport([{ name: 'c.png', type: 'image/png', size: 1 }], { existingCount: FARM_LIMITS.maxFiles });
    assert.equal(full.accepted.length, 0);
    assert.match(full.rejected[0].reason, /張上限/);

    const big = checkImport([{ name: 'd.png', type: 'image/png', size: 10 * MB }], { existingBytes: FARM_LIMITS.maxTotalBytes - 5 * MB });
    assert.match(big.rejected[0].reason, /總容量/);
});

test('checkImport 在剩餘空間不足（輸入加輸出約兩倍）時明確報錯', () => {
    const files = [{ name: 'a.png', type: 'image/png', size: 4 * MB }];
    assert.throws(() => checkImport(files, { available: 6 * MB }), (err) => err instanceof FarmError && err.code === 'QUOTA_EXCEEDED');
    assert.equal(checkImport(files, { available: 9 * MB }).accepted.length, 1);
    assert.equal(checkImport(files, { available: null }).accepted.length, 1, '不知道剩餘空間時不擋');
});

test('outputName 與 outputKey', () => {
    assert.equal(outputName('photo.final.JPG', 'image/webp', 320), 'photo.final-320w.webp');
    assert.equal(outputName('noext', 'image/png', 64), 'noext-64w.png');
    assert.equal(outputKey('t1', 'l2'), 't1:l2');
});

test('findOrphanOutputs 只保留已完成任務引用與執行中租約的輸出，並給寬限時間', () => {
    const now = 100000;
    const tasks = [
        { id: 't1', status: 'completed', result: { outputKey: 't1:new' } },
        { id: 't2', status: 'running', leaseId: 'l9' },
        { id: 't3', status: 'pending', leaseId: null },
    ];
    const outputs = [
        { key: 't1:new', createdAt: 0 },
        { key: 't1:old', createdAt: 0 }, // 舊租約寫完後被拒絕的輸出
        { key: 't2:l9', createdAt: 0 },
        { key: 't3:stale', createdAt: 0 },
        { key: 't3:fresh', createdAt: now - 1000 }, // 剛寫入，可能是正在提交的結果
    ];
    assert.deepEqual(findOrphanOutputs(outputs, tasks, now), ['t1:old', 't3:stale']);
});

test('summarizeRun 計算進度、耗時、吞吐量、各節點完成數與重試', () => {
    const run = { createdAt: 1000, taskIds: ['a', 'b', 'c', 'd'] };
    const tasks = [
        { id: 'a', status: 'completed', attemptCount: 1, result: { nodeId: 'n1', finishedAt: 2000, durationMs: 100 } },
        { id: 'b', status: 'completed', attemptCount: 2, result: { nodeId: 'n2', finishedAt: 3000, durationMs: 300 } },
        { id: 'c', status: 'running', attemptCount: 1 },
        { id: 'd', status: 'failed', attemptCount: 3 },
    ];
    const running = summarizeRun(run, tasks, 5000);
    assert.equal(running.finished, false);
    assert.equal(running.progress, 0.75);
    assert.equal(running.elapsedMs, 4000, '未完成時算到現在');
    assert.deepEqual(running.perNode, { n1: 1, n2: 1 });
    assert.equal(running.retried, 2);
    assert.equal(running.avgProcessingMs, 200);

    tasks[2] = { id: 'c', status: 'completed', attemptCount: 1, result: { nodeId: 'n1', finishedAt: 4000, durationMs: 200 } };
    const done = summarizeRun(run, tasks, 9000);
    assert.equal(done.finished, true);
    assert.equal(done.elapsedMs, 3000, '完成時算到最後一張完成');
    assert.equal(done.throughput, 1);
    assert.equal(done.nodeCount, 2);
    assert.equal(summarizeRun({ createdAt: 0, taskIds: [] }, [], 10).progress, 0);
});
