import { test } from 'node:test';
import assert from 'node:assert/strict';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createMemoryBusHub() {
    const endpoints = new Set();
    return {
        createTransport() {
            let closed = false;
            const transport = {
                onmessage: null,
                onmessageerror: null,
                postMessage(data) {
                    if (closed) return;
                    const cloned = structuredClone(data);
                    for (const peer of endpoints) {
                        if (peer !== transport) {
                            peer.onmessage?.({ data: structuredClone(cloned) });
                        }
                    }
                },
                close() {
                    closed = true;
                    endpoints.delete(transport);
                },
            };
            endpoints.add(transport);
            return transport;
        },
        size() {
            return endpoints.size;
        },
    };
}

const {
    RPC_ERROR_CODES,
    RpcError,
    RpcChannel,
    createRpcChannel,
    createMessageBus,
    serializeRpcError,
    deserializeRpcError,
} = await import('../lib/coordination.js');

test('RpcChannel：白名單註冊驗證、禁止原型鍵與不安全方法', async () => {
    const rpc = createRpcChannel({ transport: createMemoryBusHub().createTransport(), tabId: 'r-val' });

    assert.throws(() => rpc.register('', () => {}), TypeError);
    assert.throws(() => rpc.register('__proto__', () => {}), TypeError);
    assert.throws(() => rpc.register('constructor', () => {}), TypeError);
    assert.throws(() => rpc.register('prototype', () => {}), TypeError);
    assert.throws(() => rpc.register('ok', 'not-fn'), TypeError);

    const unreg = rpc.register('ping', () => 'pong');
    assert.throws(() => rpc.register('ping', () => 'dup'), Error);
    rpc.register('ping', () => 'overwritten', { allowOverwrite: true });
    assert.deepEqual(rpc.registeredMethods, ['ping']);

    // unregister() 對舊 handle 不應誤刪 allowOverwrite 後的新 handle
    unreg();
    assert.deepEqual(rpc.registeredMethods, ['ping']);
    rpc.unregister('ping');
    assert.deepEqual(rpc.registeredMethods, []);

    await assert.rejects(() => rpc.call('__proto__', {}), TypeError);
    await assert.rejects(() => rpc.call('', {}), TypeError);
    rpc.dispose();
});

test('RpcChannel：明確 target、唯一 provider、本地呼叫與 allowLocal 語意', async () => {
    const hub = createMemoryBusHub();
    const rpcA = createRpcChannel({ namespace: 'rpc-ns', transport: hub.createTransport(), tabId: 'node-a' });
    const rpcB = createRpcChannel({ namespace: 'rpc-ns', transport: hub.createTransport(), tabId: 'node-b' });

    rpcA.register('add', ({ a, b }) => a + b);
    rpcB.register('who', (params, ctx) => ({ node: rpcB.nodeId, caller: ctx.caller, params }));
    rpcB.register('add', ({ a, b }) => (a + b) * 10);

    // 1. 明確指定遠端 target
    const res1 = await rpcA.call('who', { hello: 1 }, { target: 'node-b' });
    assert.deepEqual(res1, { node: 'node-b', caller: 'node-a', params: { hello: 1 } });

    // 2. 明確指定目標但該節點未註冊 -> METHOD_NOT_FOUND
    await assert.rejects(
        () => rpcA.call('not.exists', {}, { target: 'node-b' }),
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.METHOD_NOT_FOUND
    );

    // 3. 明確指定自己卻未註冊 -> METHOD_NOT_FOUND
    await assert.rejects(
        () => rpcA.call('not.exists', {}, { target: 'node-a' }),
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.METHOD_NOT_FOUND
    );

    // 4. allowLocal: true（預設）優先呼叫本端；allowLocal: false 轉發給遠端唯一 provider
    assert.equal(await rpcA.call('add', { a: 2, b: 3 }), 5);
    assert.equal(await rpcA.call('add', { a: 2, b: 3 }, { allowLocal: false }), 50);

    rpcA.dispose();
    rpcB.dispose();
    assert.equal(hub.size(), 0);
});

test('RpcChannel：並行請求 correlation ID 亂序回應匹配與錯誤序列化', async () => {
    const hub = createMemoryBusHub();
    const rpcCaller = createRpcChannel({ namespace: 'order', transport: hub.createTransport(), tabId: 'c1' });
    const rpcWorker = createRpcChannel({ namespace: 'order', transport: hub.createTransport(), tabId: 'w1' });

    rpcWorker.register('echoDelay', async ({ id, delayMs }) => {
        await sleep(delayMs);
        return id;
    });
    rpcWorker.register('failTyped', () => {
        const err = new TypeError('bad field');
        err.data = { field: 'email' };
        throw err;
    });
    rpcWorker.register('failString', () => {
        throw 'string-failure';
    });
    rpcWorker.register('uncloneableResult', () => () => {});

    // 請求 1 慢（40ms）、請求 2 快（5ms），亂序回來必須各自配對
    const [r1, r2] = await Promise.all([
        rpcCaller.call('echoDelay', { id: 'first', delayMs: 40 }),
        rpcCaller.call('echoDelay', { id: 'second', delayMs: 5 }),
    ]);
    assert.equal(r1, 'first');
    assert.equal(r2, 'second');
    assert.equal(rpcCaller.pendingCount, 0);

    await assert.rejects(
        () => rpcCaller.call('failTyped'),
        (err) =>
            err instanceof RpcError &&
            err.code === RPC_ERROR_CODES.HANDLER_ERROR &&
            err.remoteName === 'TypeError' &&
            err.message === 'bad field' &&
            err.data?.field === 'email'
    );

    await assert.rejects(
        () => rpcCaller.call('failString'),
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.HANDLER_ERROR && err.message === 'string-failure'
    );

    await assert.rejects(
        () => rpcCaller.call('uncloneableResult'),
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.SERIALIZATION_ERROR
    );

    await assert.rejects(
        () => rpcCaller.call('echoDelay', { fn: () => {} }),
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.SERIALIZATION_ERROR
    );
    assert.equal(rpcCaller.pendingCount, 0);

    // 直接測試序列化/反序列化工具
    const ser = serializeRpcError({ code: 'E_CUSTOM', message: 'oops', data: { badFn: () => {} } });
    const deser = deserializeRpcError(ser);
    assert.equal(deser.code, 'E_CUSTOM');
    assert.equal(deser.message, 'oops');

    rpcCaller.dispose();
    rpcWorker.dispose();
});

test('RpcChannel：timeout、AbortSignal 取消、不自動重試副作用與重複回應處理', async () => {
    const hub = createMemoryBusHub();
    const caller = createRpcChannel({ namespace: 'retry-check', transport: hub.createTransport(), tabId: 'caller' });
    const worker = createRpcChannel({ namespace: 'retry-check', transport: hub.createTransport(), tabId: 'worker' });

    let sideEffectCount = 0;
    let remoteAborted = false;
    worker.register('sideEffectSlow', async ({ delayMs }, ctx) => {
        sideEffectCount += 1; // 若有自動重試會 > 1
        ctx.signal.addEventListener('abort', () => { remoteAborted = true; }, { once: true });
        await sleep(delayMs);
        return 'finished-anyway';
    });

    // 1. Timeout：不重試副作用方法、清理 pending、通知遠端 abort、後續遲到回應觸發 duplicate-response
    const duplicates = [];
    caller.on('duplicate-response', (d) => duplicates.push(d));

    await assert.rejects(
        () => caller.call('sideEffectSlow', { delayMs: 80 }, { timeoutMs: 20 }),
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.TIMEOUT
    );
    assert.equal(caller.pendingCount, 0);
    await sleep(90);
    assert.equal(sideEffectCount, 1);
    assert.equal(remoteAborted, true);
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].wasCompleted, true);

    // 2. AbortSignal 預先取消與途中取消（不回滾副作用）
    const preAc = new AbortController();
    preAc.abort();
    await assert.rejects(
        () => caller.call('sideEffectSlow', { delayMs: 50 }, { signal: preAc.signal }),
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.ABORTED
    );
    assert.equal(sideEffectCount, 1);

    let abortTestSideEffects = 0;
    worker.register('commitThenWait', async (_, ctx) => {
        abortTestSideEffects += 1; // 副作用已執行，取消不會回滾
        await new Promise((resolve) => {
            const t = setTimeout(resolve, 100);
            ctx.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
        });
        return 'ok';
    });

    const midAc = new AbortController();
    const pAbort = caller.call('commitThenWait', {}, { signal: midAc.signal });
    setTimeout(() => midAc.abort('stop'), 15);
    await assert.rejects(
        () => pAbort,
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.ABORTED
    );
    assert.equal(caller.pendingCount, 0);
    await sleep(30);
    assert.equal(abortTestSideEffects, 1);
    assert.equal(duplicates.length, 2); // 取消後遠端仍結束並回送遲到回應，安全轉成 duplicate-response

    // 3. 模擬雙重回應（例如同一方法不小心在兩個遠端同時註冊）
    const worker2 = createRpcChannel({ namespace: 'retry-check', transport: hub.createTransport(), tabId: 'worker-2' });
    worker.register('dupMethod', () => 'from-w1');
    worker2.register('dupMethod', () => 'from-w2');
    const dupRes = await caller.call('dupMethod');
    assert.equal(dupRes, 'from-w1');
    assert.equal(duplicates.length, 3);
    assert.equal(duplicates.at(-1).wasCompleted, true);

    caller.dispose();
    worker.dispose();
    worker2.dispose();
});

test('RpcChannel：dispose() 立即清理所有 pending、不關閉外部 bus，無 BroadcastChannel 時不空等 timeout', async () => {
    const hub = createMemoryBusHub();
    const bus = createMessageBus({ namespace: 'dispose-rpc', transport: hub.createTransport(), tabId: 'ext-rpc' });
    const rpc = createRpcChannel({ bus });
    const worker = createRpcChannel({ namespace: 'dispose-rpc', transport: hub.createTransport(), tabId: 'ext-w' });

    worker.register('hang', () => new Promise(() => {}));

    const pendingCall = rpc.call('hang', {}, { timeoutMs: 30000 });
    assert.equal(rpc.pendingCount, 1);

    rpc.dispose();
    assert.equal(rpc.closed, true);
    assert.equal(rpc.pendingCount, 0);
    assert.equal(bus.closed, false); // 外部注入 bus 不應被關閉

    await assert.rejects(
        () => pendingCall,
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.CHANNEL_CLOSED
    );
    await assert.rejects(
        () => rpc.call('anything'),
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.CHANNEL_CLOSED
    );

    bus.dispose();
    worker.dispose();

    // 無 BroadcastChannel 時遠端呼叫必須立刻失敗為 TRANSPORT_UNAVAILABLE
    const OriginalBC = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = undefined;
    try {
        const offlineRpc = createRpcChannel({ namespace: 'offline-rpc' });
        assert.equal(offlineRpc.supported, false);
        await assert.rejects(
            () => offlineRpc.call('remote.fn', {}, { timeoutMs: 10000 }),
            (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.TRANSPORT_UNAVAILABLE
        );
        offlineRpc.dispose();
    } finally {
        globalThis.BroadcastChannel = OriginalBC;
    }
});

test('RpcChannel：本地執行中呼叫在 dispose() 時須中止 ctx.signal；缺少 replyTo 的畸形回應須觸發 invalid-rpc', async () => {
    const hub = createMemoryBusHub();
    const rpc = createRpcChannel({ namespace: 'local-dispose', transport: hub.createTransport(), tabId: 'ld-1' });

    let localCtxSignal = null;
    rpc.register('localHang', async (_, ctx) => {
        localCtxSignal = ctx.signal;
        await new Promise(() => {});
    });

    const localP = rpc.call('localHang', {}, { timeoutMs: 30000 });
    await sleep(10);
    assert.equal(localCtxSignal?.aborted, false);

    rpc.dispose();
    assert.equal(localCtxSignal?.aborted, true);
    assert.equal(rpc.pendingCount, 0);
    await assert.rejects(
        () => localP,
        (err) => err instanceof RpcError && err.code === RPC_ERROR_CODES.CHANNEL_CLOSED
    );

    // 缺少 replyTo 的回應應發出 invalid-rpc
    const peerBus = createMessageBus({ namespace: 'local-dispose', transport: hub.createTransport(), tabId: 'peer-bad' });
    const rpcCheck = createRpcChannel({ namespace: 'local-dispose', transport: hub.createTransport(), tabId: 'ld-2' });
    const invalidEvents = [];
    rpcCheck.on('invalid-rpc', (e) => invalidEvents.push(e));
    peerBus.publish('__rpc:res', { correlationId: 'c1', ok: true, result: 1 });
    assert.equal(invalidEvents.length, 1);
    assert.equal(invalidEvents[0].kind, 'response');

    peerBus.dispose();
    rpcCheck.dispose();
});
