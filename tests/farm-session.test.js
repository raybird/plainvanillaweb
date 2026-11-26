import test from 'node:test';
import assert from 'node:assert/strict';
import { disposeLanes } from '../components/pages/solutions/farm/farm-session.js';

test('disposeLanes 在佇列釋放失敗時仍釋放同一條 lane 的處理器，且不影響其他 lane', async () => {
    const disposed = [];
    const lane = (name, queueDispose) => ({
        queue: queueDispose === null ? null : { dispose: queueDispose },
        processor: { dispose: () => disposed.push(name) },
    });
    await disposeLanes([
        lane('rejects', () => Promise.reject(new Error('queue dispose 失敗'))),
        lane('throws', () => { throw new Error('同步丟出'); }),
        lane('ok', async () => {}),
        lane('no-queue', null),
    ]);
    assert.deepEqual(disposed.sort(), ['no-queue', 'ok', 'rejects', 'throws']);
});
