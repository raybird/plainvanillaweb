import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

import {
    createLeaderElection,
    createMessageBus,
    createPeerDiscovery,
    createRpcChannel,
} from '../lib/coordination.js';
import {
    createJsonWireTransportAdapter,
    createSharedWorkerPortTransport,
} from './helpers/phase5-poc-transports.js';
import { startRealtimeTestServer } from './helpers/realtime-server.mjs';

function createLocalLockManager() {
    const held = new Set();
    return {
        async request(name, options, callback) {
            if (held.has(name)) {
                if (options?.ifAvailable) return callback(null);
                throw new Error('Contention in local lock double');
            }
            held.add(name);
            const handle = { name, mode: options?.mode || 'exclusive' };
            try {
                return await callback(handle);
            } finally {
                held.delete(name);
            }
        },
    };
}

describe('Phase 5 PoC — SharedWorker 與跨裝置 Transport Adapter 評估驗證', () => {
    it('PoC 1：SharedWorker Port Adapter 可零修改重用 MessageBus、PeerDiscovery 與 RpcChannel（並明確揭露支援與生命週期邊界）', async () => {
        const chA = new MessageChannel();
        const chB = new MessageChannel();
        const chOtherNs = new MessageChannel();
        const hubPorts = new Set([chA.port1, chB.port1, chOtherNs.port1]);

        const wireHubPort = (src) => {
            src.on('message', (data) => {
                if (data && data.__pocControl === 'leave') {
                    hubPorts.delete(src);
                    src.close();
                    return;
                }
                for (const dst of hubPorts) {
                    if (dst !== src) dst.postMessage(data);
                }
            });
        };
        for (const p of hubPorts) wireHubPort(p);

        const transportA = createSharedWorkerPortTransport(chA.port2);
        const transportB = createSharedWorkerPortTransport(chB.port2);
        const transportOther = createSharedWorkerPortTransport(chOtherNs.port2);

        assert.equal(transportA.capabilities.kind, 'shared-worker');
        assert.equal(transportA.capabilities.mobileAndroidChromeSupported, false);
        assert.equal(transportA.capabilities.requiresSameOriginScript, true);
        assert.equal(transportA.capabilities.survivesAllTabsClosed, false);

        const busA = createMessageBus({ namespace: 'poc-sw', transport: transportA, tabId: 'tab-a' });
        const busB = createMessageBus({ namespace: 'poc-sw', transport: transportB, tabId: 'tab-b' });
        const busOther = createMessageBus({ namespace: 'other-ns', transport: transportOther, tabId: 'tab-other' });

        const peersA = createPeerDiscovery({ bus: busA, nodeId: 'tab-a', capabilities: ['sw-client'], heartbeatIntervalMs: 100 });
        const peersB = createPeerDiscovery({ bus: busB, nodeId: 'tab-b', capabilities: ['sw-worker'], heartbeatIntervalMs: 100 });
        const rpcA = createRpcChannel({ bus: busA, timeoutMs: 2000 });
        const rpcB = createRpcChannel({ bus: busB, timeoutMs: 2000 });

        try {
            const receivedOther = [];
            busOther.subscribe('ping', (msg) => receivedOther.push(msg));

            rpcB.register('echo.worker', (params, ctx) => ({
                received: params,
                caller: ctx.caller,
                responder: 'tab-b',
            }));

            await peersA.start();
            await peersB.start();
            await new Promise((r) => setTimeout(r, 80));

            const seenByA = peersA.getPeers();
            assert.equal(seenByA.length, 1);
            assert.equal(seenByA[0].nodeId, 'tab-b');

            const rpcRes = await rpcA.call('echo.worker', { hello: 'shared-worker' }, { target: 'tab-b' });
            assert.deepEqual(rpcRes, {
                received: { hello: 'shared-worker' },
                caller: 'tab-a',
                responder: 'tab-b',
            });

            assert.equal(receivedOther.length, 0);
        } finally {
            await rpcA.dispose();
            await rpcB.dispose();
            await peersA.dispose();
            await peersB.dispose();
            busA.close();
            busB.close();
            busOther.close();
            for (const p of [...hubPorts]) {
                p.close();
            }
            hubPorts.clear();
        }
    });

    it('PoC 2：Cross-Device JSON Wire Transport Adapter 透過真實 WebSocket Relay 驅動既有一致協定（v1 Envelope + RpcChannel + PeerDiscovery）', async () => {
        const realtime = await startRealtimeTestServer();
        const ws1 = new globalThis.WebSocket(realtime.wsUrl('poc-relay', { relay: '1' }));
        const ws2 = new globalThis.WebSocket(realtime.wsUrl('poc-relay', { relay: '1' }));

        await Promise.all([
            new Promise((resolve, reject) => {
                ws1.addEventListener('open', resolve, { once: true });
                ws1.addEventListener('error', reject, { once: true });
            }),
            new Promise((resolve, reject) => {
                ws2.addEventListener('open', resolve, { once: true });
                ws2.addEventListener('error', reject, { once: true });
            }),
        ]);

        const adapter1 = createJsonWireTransportAdapter(ws1, { kind: 'websocket-relay' });
        const adapter2 = createJsonWireTransportAdapter(ws2, { kind: 'websocket-relay' });

        assert.equal(adapter1.capabilities.scope, 'cross-device');
        assert.equal(adapter1.capabilities.supportsWebLocks, false);
        assert.equal(adapter1.capabilities.requiresExternalAuth, true);
        assert.equal(adapter1.capabilities.serialization, 'json');

        const bus1 = createMessageBus({ namespace: 'cross-dev', transport: adapter1, tabId: 'device-a' });
        const bus2 = createMessageBus({ namespace: 'cross-dev', transport: adapter2, tabId: 'device-b' });
        const peers1 = createPeerDiscovery({ bus: bus1, nodeId: 'device-a', capabilities: ['relay'], heartbeatIntervalMs: 120 });
        const peers2 = createPeerDiscovery({ bus: bus2, nodeId: 'device-b', capabilities: ['relay'], heartbeatIntervalMs: 120 });
        const rpc1 = createRpcChannel({ bus: bus1, timeoutMs: 2500 });
        const rpc2 = createRpcChannel({ bus: bus2, timeoutMs: 2500 });

        try {
            rpc2.register('remote.sum', ({ values }) => ({
                total: values.reduce((a, b) => a + b, 0),
                by: 'device-b',
            }));

            await peers1.start();
            await peers2.start();
            await new Promise((r) => setTimeout(r, 120));

            assert.equal(peers1.getPeers().length, 1);
            assert.equal(peers1.getPeers()[0].nodeId, 'device-b');

            const sumRes = await rpc1.call('remote.sum', { values: [10, 20, 12] }, { target: 'device-b' });
            assert.deepEqual(sumRes, { total: 42, by: 'device-b' });
            assert.ok(adapter1.getStats().sent >= 2);
            assert.ok(adapter2.getStats().received >= 2);
        } finally {
            await rpc1.dispose();
            await rpc2.dispose();
            await peers1.dispose();
            await peers2.dispose();
            bus1.close();
            bus2.close();
            await realtime.close();
        }
    });

    it('PoC 3：防偽造可靠性保證實證（JSON 降級與原型過濾、斷線明確計入 droppedWhileDisconnected、跨裝置各自獨立 LockManager 會同時選出雙 Leader）', async () => {
        // 3.1 JSON wire serialization 差異與原型污染阻擋
        const listenersA = new Map();
        const listenersB = new Map();
        const socketA = {
            readyState: 1,
            send(raw) {
                for (const fn of listenersB.get('message') || []) fn({ data: raw });
            },
            close() { this.readyState = 3; },
            addEventListener(type, fn) {
                if (!listenersA.has(type)) listenersA.set(type, new Set());
                listenersA.get(type).add(fn);
            },
            removeEventListener(type, fn) { listenersA.get(type)?.delete(fn); },
        };
        const socketB = {
            readyState: 1,
            send(raw) {
                for (const fn of listenersA.get('message') || []) fn({ data: raw });
            },
            close() { this.readyState = 3; },
            addEventListener(type, fn) {
                if (!listenersB.has(type)) listenersB.set(type, new Set());
                listenersB.get(type).add(fn);
            },
            removeEventListener(type, fn) { listenersB.get(type)?.delete(fn); },
        };

        const drops = [];
        const adapterA = createJsonWireTransportAdapter(socketA, {
            kind: 'webrtc-datachannel-mock',
            onDrop: (info) => drops.push(info),
        });
        const adapterB = createJsonWireTransportAdapter(socketB, { kind: 'webrtc-datachannel-mock' });
        const busA = createMessageBus({ namespace: 'fidelity', transport: adapterA, tabId: 'dev-1' });
        const busB = createMessageBus({ namespace: 'fidelity', transport: adapterB, tabId: 'dev-2' });

        const received = [];
        const wireErrors = [];
        busB.subscribe('typed', (payload) => received.push(payload));
        busB.on('messageerror', (err) => wireErrors.push(err));

        // 驗證 Date 經 JSON wire 後降級為字串（非 Structured Clone 原型保留）
        const createdAt = new Date('2026-11-24T08:00:00.000Z');
        busA.publish('typed', { createdAt });
        assert.equal(received.length, 1);
        assert.equal(typeof received[0].createdAt, 'string');
        assert.equal(received[0].createdAt instanceof Date, false);
        assert.equal(received[0].createdAt, '2026-11-24T08:00:00.000Z');

        // 驗證惡意含 __proto__ 的遠端 JSON 被拒絕，絕不進入 MessageBus
        for (const fn of listenersB.get('message') || []) {
            fn({ data: '{"v":1,"ns":"fidelity","id":"1","type":"typed","sender":"evil","timestamp":1,"payload":{"__proto__":{"polluted":true}}}' });
        }
        assert.equal(received.length, 1);
        assert.equal(adapterB.getStats().rejectedPayloads, 1);
        assert.equal(wireErrors.length, 1);

        // 3.2 斷線後送出必須記錄為 droppedWhileDisconnected，不隱瞞遺失風險
        socketA.readyState = 3;
        busA.publish('typed', { whileOffline: true });
        assert.equal(adapterA.getStats().droppedWhileDisconnected, 1);
        assert.equal(drops.length, 1);
        assert.equal(drops[0].reason, 'socket-not-open');

        // 3.3 跨裝置無法共用 Web Locks：兩端各自擁有裝置內 LockManager 會同時選為 leader
        const electionDev1 = createLeaderElection({
            namespace: 'fidelity',
            scope: 'primary',
            locks: createLocalLockManager(),
            bus: busA,
        });
        const electionDev2 = createLeaderElection({
            namespace: 'fidelity',
            scope: 'primary',
            locks: createLocalLockManager(),
            bus: busB,
        });

        const [res1, res2] = await Promise.all([electionDev1.start(), electionDev2.start()]);
        assert.equal(res1.acquired, true);
        assert.equal(res1.role, 'leader');
        assert.equal(res2.acquired, true);
        assert.equal(res2.role, 'leader');

        await electionDev1.dispose();
        await electionDev2.dispose();
        busA.close();
        busB.close();
    });
});
