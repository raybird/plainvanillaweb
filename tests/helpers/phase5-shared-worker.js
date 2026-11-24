/**
 * Phase 5（Issue #7）評估用 SharedWorker 最小中繼腳本（僅供測試與 PoC，非生產核心模組）。
 * 採傳統 script 形式以確保各支援 SharedWorker 的瀏覽器環境一致載入並相容 `node -c` 語法檢查。
 */

const ports = new Set();
const hubState = {
    totalConnections: 0,
    relayedCount: 0,
    persistedCounter: 0,
};

function snapshotState() {
    return {
        totalConnections: hubState.totalConnections,
        activePorts: ports.size,
        relayedCount: hubState.relayedCount,
        persistedCounter: hubState.persistedCounter,
    };
}

self.addEventListener('connect', (connectEvent) => {
    const port = connectEvent.ports && connectEvent.ports[0];
    if (!port) return;

    ports.add(port);
    hubState.totalConnections += 1;

    port.onmessage = (event) => {
        const data = event && event.data;
        if (data && typeof data === 'object' && typeof data.__pocControl === 'string') {
            if (data.__pocControl === 'leave') {
                ports.delete(port);
                try {
                    port.close();
                } catch {
                    // ignore
                }
                return;
            }
            if (data.__pocControl === 'bump') {
                hubState.persistedCounter += 1;
                port.postMessage({
                    __pocControl: 'reply',
                    reqId: data.reqId,
                    hubState: snapshotState(),
                });
                return;
            }
            if (data.__pocControl === 'stats') {
                port.postMessage({
                    __pocControl: 'reply',
                    reqId: data.reqId,
                    hubState: snapshotState(),
                });
                return;
            }
        }

        hubState.relayedCount += 1;
        for (const peerPort of ports) {
            if (peerPort === port) continue;
            try {
                peerPort.postMessage(data);
            } catch {
                // ignore stale/broken port
            }
        }
    };

    port.onmessageerror = () => {
        // ignore malformed structured-clone payload
    };

    if (typeof port.start === 'function') {
        port.start();
    }
});
