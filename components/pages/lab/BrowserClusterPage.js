import { BaseComponent } from "../../../lib/base-component.js";
import { html, unsafe } from "../../../lib/html.js";
import { generateContextId } from "../../../lib/broadcast-channel.js";
import {
    TASK_STATUS,
    createDurableTaskQueue,
    createLeaderElection,
    createMessageBus,
    createPeerDiscovery,
    createRpcChannel,
    getCoordinationCapabilities,
} from "../../../lib/coordination.js";

const DEMO_CHANNEL_NAME = "vanilla_browser_cluster_lab";
const DEFAULT_CLUSTER_NS = "cluster-lab";
const MAX_LOGS = 25;

/**
 * 決定性 FNV-1a 32-bit 校驗碼（供 chunk.checksum 示範任務使用）
 * @param {string} text
 * @returns {string}
 */
function computeFnv1aChecksum(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function readNamespaceFromUrl() {
    try {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const qIndex = hash.indexOf("?");
        if (qIndex !== -1) {
            const ns = new URLSearchParams(hash.slice(qIndex + 1)).get("ns");
            if (ns && ns.trim()) return ns.trim();
        }
        const searchNs = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("ns");
        if (searchNs && searchNs.trim()) return searchNs.trim();
    } catch {
        // ignore URL parse error
    }
    return DEFAULT_CLUSTER_NS;
}

/**
 * 建立明確標註的 Mock SharedConnection 狀態機（供靜態頁面展示 Leader/Follower 代理行為，
 * 真實 WebSocket／SSE 行為請參閱 tests/helpers/realtime-server.mjs 與瀏覽器整合測試）。
 */
function createMockSharedConnection({ bus, nodeId, namespace, onChange }) {
    let state = "idle";
    let mode = "disconnected";
    let activeLeaderId = null;
    let messageCount = 0;
    let unsub = null;

    const TOPIC_MOCK_FRAME = `__cluster_mock_conn:${namespace}`;

    const emitState = () => {
        onChange?.({
            isMock: true,
            label: "MockSharedConnection (靜態展示模擬傳輸層)",
            state,
            mode,
            activeLeaderId,
            messageCount,
        });
    };

    return {
        start() {
            if (!unsub && bus && !bus.closed) {
                unsub = bus.subscribe(
                    TOPIC_MOCK_FRAME,
                    (payload) => {
                        messageCount++;
                        activeLeaderId = payload?.leaderId ?? activeLeaderId;
                        emitState();
                    },
                    { receive: "all" }
                );
            }
            emitState();
        },
        syncLeaderRole(role, leaderId = null) {
            if (role === "leader") {
                state = "connected";
                mode = "leader-upstream-mock";
                activeLeaderId = nodeId;
            } else if (role === "follower") {
                state = "proxied";
                mode = "follower-rpc-proxy-mock";
                activeLeaderId = leaderId;
            } else {
                state = "idle";
                mode = "disconnected";
                activeLeaderId = null;
            }
            emitState();
        },
        emitMockBroadcast(eventType, detail) {
            if (!bus || bus.closed) return;
            bus.publish(
                TOPIC_MOCK_FRAME,
                {
                    eventType,
                    detail,
                    leaderId: activeLeaderId ?? nodeId,
                    at: Date.now(),
                },
                { local: true, remote: true }
            );
        },
        stop() {
            unsub?.();
            unsub = null;
            state = "idle";
            mode = "disconnected";
            activeLeaderId = null;
            emitState();
        },
    };
}

export class BrowserClusterPage extends BaseComponent {
    constructor() {
        super();
        this._mounted = false;
        this._refreshTimer = null;
        this._hiddenRenderTimer = null;
        this._bus = null;
        this._leader = null;
        this._peers = null;
        this._rpc = null;
        this._queue = null;
        this._mockConn = null;
        this._instanceSubscriptions = [];
        this._initialNsApplied = false;

        this.initReactiveState({
            capabilities: {
                broadcastChannel: false,
                webLocks: false,
                indexedDB: false,
            },
            joined: false,
            busy: false,
            namespaceInput: DEFAULT_CLUSTER_NS,
            nodeLabelInput: "",
            leaseMsInput: 3000,
            maxAttemptsInput: 3,
            nodeId: "",
            role: "idle",
            epoch: 0,
            leaderObservedId: null,
            peers: [],
            tasks: [],
            stats: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0, total: 0 },
            mockConnection: {
                isMock: true,
                label: "MockSharedConnection (靜態展示模擬傳輸層)",
                state: "idle",
                mode: "disconnected",
                activeLeaderId: null,
                messageCount: 0,
            },
            taskTypeInput: "chunk.checksum",
            taskPayloadInput: "vanilla-cluster-payload",
            taskIdempotencyInput: "",
            taskDelayMsInput: 80,
            taskFailUntilInput: 0,
            rpcTargetInput: "",
            lastRpcResult: null,
            liveMessage: "就緒：Browser Cluster Lab 採 opt-in 啟動，請點擊「啟動 / 加入叢集」。",
            logs: [],
        });
    }

    scheduleUpdate() {
        if (!this._isRendered || !this.isConnected) return;
        if (typeof document !== "undefined" && document.hidden) {
            if (this._renderPending) return;
            this._renderPending = true;
            this._hiddenRenderTimer = setTimeout(() => {
                this._hiddenRenderTimer = null;
                this._renderPending = false;
                if (this.isConnected) {
                    this.update();
                }
            }, 16);
            return;
        }
        super.scheduleUpdate();
    }

    connectedCallback() {
        const wasRendered = this._isRendered;
        if (!this._mounted) {
            this._mounted = true;
            this.state.capabilities = getCoordinationCapabilities();
            if (!this._initialNsApplied) {
                this.state.namespaceInput = readNamespaceFromUrl();
                this._initialNsApplied = true;
            }
            if (!this.state.nodeId) {
                this.state.nodeId = generateContextId();
            }
        }
        super.connectedCallback();
        if (wasRendered) {
            this.scheduleUpdate();
        }
    }

    disconnectedCallback() {
        this._mounted = false;
        if (this._hiddenRenderTimer !== null) {
            clearTimeout(this._hiddenRenderTimer);
            this._hiddenRenderTimer = null;
        }
        this._renderPending = false;
        void this._teardownCluster({ quiet: true });
        super.disconnectedCallback();
    }

    _pushLog(kind, text) {
        const entry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            time: new Date().toLocaleTimeString(),
            kind,
            text,
        };
        this.state.logs = [entry, ...this.state.logs].slice(0, MAX_LOGS);
    }

    _announce(message) {
        this.state.liveMessage = message;
        this._pushLog("info", message);
    }

    _updateNamespaceUrl(namespace) {
        try {
            const baseRoute = "#/lab/browser-cluster";
            const nextHash = `${baseRoute}?ns=${encodeURIComponent(namespace)}`;
            if (typeof window !== "undefined" && window.location.hash !== nextHash) {
                window.history.replaceState(null, "", nextHash);
            }
        } catch {
            // ignore history errors
        }
    }

    async joinCluster() {
        if (this.state.joined || this.state.busy) return;
        const namespace = (this.state.namespaceInput || DEFAULT_CLUSTER_NS).trim() || DEFAULT_CLUSTER_NS;
        const leaseDurationMs = Math.max(500, Math.min(30000, Number(this.state.leaseMsInput) || 3000));
        const defaultMaxAttempts = Math.max(1, Math.min(10, Math.trunc(Number(this.state.maxAttemptsInput) || 3)));
        const nodeId = this.state.nodeId || generateContextId();

        this.state.namespaceInput = namespace;
        this.state.leaseMsInput = leaseDurationMs;
        this.state.maxAttemptsInput = defaultMaxAttempts;
        this.state.nodeId = nodeId;
        this.state.busy = true;
        this._updateNamespaceUrl(namespace);

        try {
            const bus = createMessageBus({
                channelName: DEMO_CHANNEL_NAME,
                namespace,
                tabId: nodeId,
            });
            const leader = createLeaderElection({
                namespace,
                scope: "cluster",
                bus,
                nodeId,
                heartbeatIntervalMs: 1200,
            });
            const peers = createPeerDiscovery({
                bus,
                namespace,
                nodeId,
                capabilities: ["rpc", "task-worker", "chunk.checksum", "transform.normalize"],
                meta: {
                    label: (this.state.nodeLabelInput || "").trim() || `Node-${nodeId.slice(0, 6)}`,
                },
                heartbeatIntervalMs: 1200,
                peerTimeoutMs: 3800,
            });
            const rpc = createRpcChannel({
                bus,
                timeoutMs: 3000,
            });
            const queue = createDurableTaskQueue({
                namespace,
                workerId: nodeId,
                bus,
                leaseDurationMs,
                pollIntervalMs: 350,
                reclaimIntervalMs: Math.max(250, Math.floor(leaseDurationMs / 3)),
                backoffBaseMs: 250,
                backoffMaxMs: 4000,
                defaultMaxAttempts,
            });

            if (!queue.supported) {
                bus.close();
                await leader.dispose();
                await peers.dispose();
                await rpc.dispose();
                this._announce("目前環境不支援 IndexedDB（DurableTaskQueue.supported = false），無法啟動持久化工作佇列。");
                return;
            }

            // 註冊確定性本地示範處理器（具明確版本號）
            queue.registerHandler(
                "chunk.checksum",
                async (payload, ctx) => {
                    const text = typeof payload?.text === "string" ? payload.text : JSON.stringify(payload ?? "");
                    const delayMs = Math.max(0, Math.min(5000, Number(payload?.simulateDelayMs) || 0));
                    if (delayMs > 0) {
                        await new Promise((resolve, reject) => {
                            if (ctx.signal.aborted) {
                                reject(ctx.signal.reason || new Error("Aborted"));
                                return;
                            }
                            const onAbort = () => {
                                clearTimeout(timer);
                                reject(ctx.signal.reason || new Error("Aborted"));
                            };
                            const timer = setTimeout(() => {
                                ctx.signal.removeEventListener("abort", onAbort);
                                resolve();
                            }, delayMs);
                            ctx.signal.addEventListener("abort", onAbort, { once: true });
                        });
                    }
                    const failUntil = Number(payload?.failUntilAttempt) || 0;
                    if (failUntil > 0 && ctx.attemptCount <= failUntil) {
                        throw new Error(`Simulated failure on attempt ${ctx.attemptCount}/${failUntil}`);
                    }
                    return {
                        checksum: computeFnv1aChecksum(text),
                        length: text.length,
                        workerId: ctx.ownerId,
                        attemptCount: ctx.attemptCount,
                    };
                },
                { version: 1 }
            );

            queue.registerHandler(
                "transform.normalize",
                async (payload, ctx) => {
                    const text = typeof payload?.text === "string" ? payload.text : String(payload?.text ?? "");
                    const delayMs = Math.max(0, Math.min(5000, Number(payload?.simulateDelayMs) || 0));
                    if (delayMs > 0) {
                        await new Promise((resolve, reject) => {
                            if (ctx.signal.aborted) {
                                reject(ctx.signal.reason || new Error("Aborted"));
                                return;
                            }
                            const onAbort = () => {
                                clearTimeout(timer);
                                reject(ctx.signal.reason || new Error("Aborted"));
                            };
                            const timer = setTimeout(() => {
                                ctx.signal.removeEventListener("abort", onAbort);
                                resolve();
                            }, delayMs);
                            ctx.signal.addEventListener("abort", onAbort, { once: true });
                        });
                    }
                    const failUntil = Number(payload?.failUntilAttempt) || 0;
                    if (failUntil > 0 && ctx.attemptCount <= failUntil) {
                        throw new Error(`Simulated normalize error on attempt ${ctx.attemptCount}/${failUntil}`);
                    }
                    const mode = payload?.mode || "lower";
                    let normalized = text.trim().replace(/\s+/g, " ");
                    if (mode === "upper") normalized = normalized.toUpperCase();
                    else if (mode === "lower") normalized = normalized.toLowerCase();
                    return {
                        normalized,
                        originalLength: text.length,
                        normalizedLength: normalized.length,
                        workerId: ctx.ownerId,
                    };
                },
                { version: 1 }
            );

            // 註冊 RPC 方法：cluster.ping / cluster.stats
            rpc.register("cluster.ping", () => ({
                pong: true,
                nodeId,
                role: leader.role,
                epoch: leader.epoch,
                namespace,
                timestamp: Date.now(),
            }));
            rpc.register("cluster.stats", async () => ({
                nodeId,
                role: leader.role,
                epoch: leader.epoch,
                namespace,
                peerCount: peers.getPeers({ includeSelf: true }).length,
                stats: await queue.getStats(),
                timestamp: Date.now(),
            }));

            const mockConn = createMockSharedConnection({
                bus,
                nodeId,
                namespace,
                onChange: (snapshot) => {
                    this.state.mockConnection = snapshot;
                },
            });

            this._bus = bus;
            this._leader = leader;
            this._peers = peers;
            this._rpc = rpc;
            this._queue = queue;
            this._mockConn = mockConn;

            const syncPeersSnapshot = () => {
                if (!this._peers) return;
                this.state.peers = this._peers.getPeers({ includeSelf: true });
            };

            this._instanceSubscriptions = [
                leader.on("role-change", (detail) => {
                    this.state.role = detail.role;
                    this.state.epoch = detail.epoch;
                    if (detail.role === "leader") {
                        this.state.leaderObservedId = nodeId;
                        mockConn.syncLeaderRole("leader", nodeId);
                        mockConn.emitMockBroadcast("leader-elected", { nodeId, epoch: detail.epoch });
                    } else {
                        mockConn.syncLeaderRole(detail.role, leader.observedLeader?.nodeId ?? null);
                    }
                    this._pushLog("leader", `角色變更為 ${detail.role}（epoch=${detail.epoch}, reason=${detail.reason}）`);
                }),
                leader.on("leader-observed", (detail) => {
                    if (detail?.type === "elected") {
                        this.state.leaderObservedId = detail.nodeId;
                        if (leader.role === "follower") {
                            mockConn.syncLeaderRole("follower", detail.nodeId);
                        }
                    }
                }),
                leader.on("leader-heartbeat", (detail) => {
                    if (detail?.nodeId) {
                        this.state.leaderObservedId = detail.nodeId;
                    }
                }),
                peers.on("peer-join", (d) => {
                    syncPeersSnapshot();
                    this._pushLog("peer", `節點加入：${d?.peer?.nodeId?.slice(0, 8)}`);
                }),
                peers.on("peer-update", () => syncPeersSnapshot()),
                peers.on("peer-leave", (d) => {
                    syncPeersSnapshot();
                    this._pushLog("peer", `節點離開：${d?.peer?.nodeId?.slice(0, 8)}，觸發過期/孤兒回收檢查`);
                    void this._reclaimAndRefresh();
                }),
                peers.on("peer-expire", (d) => {
                    syncPeersSnapshot();
                    this._pushLog("warn", `節點心跳逾時：${d?.peer?.nodeId?.slice(0, 8)}（僅代表失去心跳，觸發租約安全檢查）`);
                    void this._reclaimAndRefresh();
                }),
                queue.on("task-enqueued", ({ task }) => {
                    this._pushLog("task", `任務排入：${task.type} (${task.id.slice(0, 8)})`);
                    void this.refreshState();
                }),
                queue.on("task-deduplicated", ({ task }) => {
                    this._pushLog("task", `冪等去重命中：${task.idempotencyKey} -> ${task.id.slice(0, 8)}`);
                }),
                queue.on("task-claimed", ({ task }) => {
                    this._pushLog("task", `認領任務：${task.type} (${task.id.slice(0, 8)}, attempt=${task.attemptCount})`);
                    void this.refreshState();
                }),
                queue.on("task-completed", ({ task }) => {
                    this._pushLog("task", `任務完成：${task.id.slice(0, 8)} -> worker ${task.result?.workerId?.slice(0, 8) ?? "-"}`);
                    mockConn.emitMockBroadcast("task-completed", { id: task.id, type: task.type });
                    void this.refreshState();
                }),
                queue.on("task-retry-scheduled", ({ task, delayMs }) => {
                    this._pushLog("warn", `任務失敗將於 ${delayMs}ms 後重試：${task.id.slice(0, 8)} (${task.attemptCount}/${task.maxAttempts})`);
                    void this.refreshState();
                }),
                queue.on("task-failed", ({ task }) => {
                    this._pushLog("error", `任務達重試上限失敗：${task.id.slice(0, 8)}`);
                    void this.refreshState();
                }),
                queue.on("task-reclaimed", ({ task, transition }) => {
                    this._pushLog("warn", `回收過期／孤兒任務 ${task.id.slice(0, 8)} -> ${transition}`);
                    void this.refreshState();
                }),
            ];

            mockConn.start();
            await peers.start();
            const electionRes = await leader.start();
            this.state.role = electionRes.role;
            this.state.epoch = electionRes.epoch;
            if (electionRes.role === "leader") {
                this.state.leaderObservedId = nodeId;
                mockConn.syncLeaderRole("leader", nodeId);
            } else {
                const observed = leader.observedLeader?.nodeId ?? null;
                this.state.leaderObservedId = observed;
                mockConn.syncLeaderRole(electionRes.role, observed);
            }

            await queue.start();
            syncPeersSnapshot();
            await this.refreshState();

            this._refreshTimer = setInterval(() => {
                if (this._mounted && this._queue) {
                    void this.refreshState();
                }
            }, 800);

            this.state.joined = true;
            this._announce(`已加入命名空間「${namespace}」（角色：${electionRes.role}）。`);
        } catch (err) {
            await this._teardownCluster({ quiet: true });
            this._announce(`加入叢集失敗：${err?.message || err}`);
        } finally {
            this.state.busy = false;
        }
    }

    async leaveCluster() {
        await this._teardownCluster();
    }

    async _teardownCluster({ quiet = false } = {}) {
        if (this._refreshTimer !== null) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
        for (const unsub of this._instanceSubscriptions) {
            try {
                unsub?.();
            } catch {
                // ignore
            }
        }
        this._instanceSubscriptions = [];

        const mockConn = this._mockConn;
        const queue = this._queue;
        const peers = this._peers;
        const rpc = this._rpc;
        const leader = this._leader;
        const bus = this._bus;

        this._mockConn = null;
        this._queue = null;
        this._peers = null;
        this._rpc = null;
        this._leader = null;
        this._bus = null;

        try { mockConn?.stop?.(); } catch { /* ignore */ }
        try { await queue?.dispose?.(); } catch { /* ignore */ }
        try { await peers?.dispose?.(); } catch { /* ignore */ }
        try { await rpc?.dispose?.(); } catch { /* ignore */ }
        try { await leader?.dispose?.(); } catch { /* ignore */ }
        try { bus?.close?.(); } catch { /* ignore */ }

        this.state.joined = false;
        this.state.role = "idle";
        this.state.epoch = 0;
        this.state.leaderObservedId = null;
        this.state.peers = [];
        this.state.mockConnection = {
            isMock: true,
            label: "MockSharedConnection (靜態展示模擬傳輸層)",
            state: "idle",
            mode: "disconnected",
            activeLeaderId: null,
            messageCount: 0,
        };
        if (!quiet) {
            this._announce("已離開叢集並清理本地資源（IndexedDB 持久化任務保留於本機）。");
        }
    }

    async _reclaimAndRefresh() {
        if (!this._queue || this._queue.disposed) return;
        try {
            await this._queue.reclaimExpired();
        } catch {
            // ignore
        }
        await this.refreshState();
    }

    async refreshState() {
        if (!this._queue || this._queue.disposed) return;
        try {
            const [tasks, stats] = await Promise.all([
                this._queue.listTasks({ limit: 50 }),
                this._queue.getStats(),
            ]);
            if (!this._mounted || !this._queue || this._queue.disposed) return;
            this.state.tasks = tasks;
            this.state.stats = stats;
            if (this._peers) {
                this.state.peers = this._peers.getPeers({ includeSelf: true });
            }
        } catch {
            // ignore transient closed errors during teardown
        }
    }

    async enqueueTask(event) {
        event?.preventDefault?.();
        if (!this._queue) {
            this._announce("請先啟動 / 加入叢集再送出任務。");
            return;
        }
        const type = this.state.taskTypeInput || "chunk.checksum";
        const text = this.state.taskPayloadInput || "";
        const idempotencyKey = (this.state.taskIdempotencyInput || "").trim() || undefined;
        const simulateDelayMs = Math.max(0, Math.min(5000, Number(this.state.taskDelayMsInput) || 0));
        const failUntilAttempt = Math.max(0, Math.min(10, Math.trunc(Number(this.state.taskFailUntilInput) || 0)));

        try {
            const res = await this._queue.enqueue({
                type,
                idempotencyKey,
                payload: {
                    text,
                    mode: type === "transform.normalize" ? "lower" : undefined,
                    simulateDelayMs,
                    failUntilAttempt,
                },
            });
            await this.refreshState();
            this._announce(
                res.deduplicated
                    ? `冪等鍵「${idempotencyKey}」已存在，回傳既有任務 ${res.task.id.slice(0, 8)}。`
                    : `已排入持久任務 ${type}（${res.task.id.slice(0, 8)}）。`
            );
        } catch (err) {
            this._announce(`送出任務失敗：${err?.message || err}`);
        }
    }

    async resignLeadership() {
        if (!this._leader || !this._leader.isLeader) return;
        try {
            await this._leader.release("user-resign");
            this.state.role = this._leader.role;
            this._announce("已主動釋放 Leader 鎖；其他等候中分頁可立即接管。");
        } catch (err) {
            this._announce(`讓出 Leader 失敗：${err?.message || err}`);
        }
    }

    async rejoinElection() {
        if (!this._leader || this._leader.role !== "idle") return;
        try {
            const res = await this._leader.start();
            this.state.role = res.role;
            this.state.epoch = res.epoch;
            this._announce(`重新參與選舉結果：${res.role}`);
        } catch (err) {
            this._announce(`重新參選失敗：${err?.message || err}`);
        }
    }

    async callClusterRpc(method) {
        if (!this._rpc) {
            this._announce("請先加入叢集再執行跨分頁 RPC。");
            return;
        }
        const rawTarget = (this.state.rpcTargetInput || "").trim();
        const remotePeers = (this.state.peers || []).filter((p) => p.nodeId !== this.state.nodeId);
        const preferredObserved = this.state.leaderObservedId && this.state.leaderObservedId !== this.state.nodeId
            ? this.state.leaderObservedId
            : null;
        const target = rawTarget || preferredObserved || remotePeers[0]?.nodeId || "";
        if (!target) {
            this._announce("目前無其他遠端節點可呼叫 RPC（請開啟第二個分頁加入相同命名空間）。");
            return;
        }
        try {
            const res = await this._rpc.call(method, {}, { target });
            this.state.lastRpcResult = res;
            this._announce(`RPC ${method} -> ${target?.slice(0, 8)} 成功。`);
        } catch (err) {
            this.state.lastRpcResult = { error: err?.code || "ERROR", message: err?.message || String(err) };
            this._announce(`RPC ${method} 失敗：${err?.message || err}`);
        }
    }

    async cancelTask(taskId) {
        if (!this._queue) return;
        try {
            await this._queue.cancel(taskId);
            await this.refreshState();
            this._announce(`已取消任務 ${taskId.slice(0, 8)}。`);
        } catch (err) {
            this._announce(`取消任務失敗：${err?.message || err}`);
        }
    }

    async retryTask(taskId) {
        if (!this._queue) return;
        try {
            await this._queue.retry(taskId);
            await this.refreshState();
            this._announce(`已重試任務 ${taskId.slice(0, 8)}。`);
        } catch (err) {
            this._announce(`重試任務失敗：${err?.message || err}`);
        }
    }

    async purgeTerminalTasks() {
        if (!this._queue) return;
        try {
            const res = await this._queue.purge({ olderThanMs: 0 });
            await this.refreshState();
            this._announce(`已清除 ${res.purgedCount} 筆終態任務紀錄。`);
        } catch (err) {
            this._announce(`清除失敗：${err?.message || err}`);
        }
    }

    async resetCurrentNamespace() {
        const ns = (this.state.namespaceInput || DEFAULT_CLUSTER_NS).trim() || DEFAULT_CLUSTER_NS;
        try {
            if (this._queue && !this._queue.disposed) {
                const res = await this._queue.clearNamespace();
                await this.refreshState();
                this._announce(`已重置命名空間「${ns}」，刪除 ${res.clearedCount} 筆任務。`);
            } else {
                const tmpQueue = createDurableTaskQueue({ namespace: ns });
                if (!tmpQueue.supported) {
                    this._announce("目前環境不支援 IndexedDB。");
                    return;
                }
                const res = await tmpQueue.clearNamespace();
                await tmpQueue.dispose();
                this.state.tasks = [];
                this.state.stats = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
                this._announce(`已清除離線命名空間「${ns}」的 ${res.clearedCount} 筆持久化資料。`);
            }
        } catch (err) {
            this._announce(`重置命名空間失敗：${err?.message || err}`);
        }
    }

    openSiblingTab() {
        const ns = (this.state.namespaceInput || DEFAULT_CLUSTER_NS).trim() || DEFAULT_CLUSTER_NS;
        const url = `${window.location.origin}${window.location.pathname}#/lab/browser-cluster?ns=${encodeURIComponent(ns)}`;
        window.open(url, "_blank", "noopener");
    }

    _formatJsonCompact(value) {
        if (value === undefined || value === null) return "-";
        try {
            const text = JSON.stringify(value);
            return text.length > 88 ? `${text.slice(0, 85)}...` : text;
        } catch {
            return String(value);
        }
    }

    render() {
        const {
            capabilities,
            joined,
            busy,
            namespaceInput,
            nodeLabelInput,
            leaseMsInput,
            maxAttemptsInput,
            nodeId,
            role,
            epoch,
            leaderObservedId,
            peers,
            tasks,
            stats,
            mockConnection,
            taskTypeInput,
            taskPayloadInput,
            taskIdempotencyInput,
            taskDelayMsInput,
            taskFailUntilInput,
            rpcTargetInput,
            lastRpcResult,
            liveMessage,
            logs,
        } = this.state;

        const remotePeers = peers.filter((p) => p.nodeId !== nodeId);
        const disableConfig = joined || busy;
        const allSupported = capabilities.broadcastChannel && capabilities.webLocks && capabilities.indexedDB;

        return html`
            <style>
                .bc-lab-shell { display: flex; flex-direction: column; gap: 1.25rem; }
                .bc-sr-only {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    white-space: nowrap;
                    border: 0;
                }
                .bc-card {
                    background: var(--card-bg, #ffffff);
                    border: 1px solid var(--border-color, #e2e8f0);
                    border-radius: 10px;
                    padding: 1.25rem;
                    color: var(--text-color, inherit);
                }
                .bc-header-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 1rem; }
                .bc-badges { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
                .bc-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    padding: 0.25rem 0.65rem;
                    border-radius: 999px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    border: 1px solid var(--border-color, #cbd5e1);
                    background: var(--surface-color, #f8fafc);
                }
                .bc-badge--ok { border-color: #16a34a; color: #15803d; }
                .bc-badge--warn { border-color: #d97706; color: #b45309; }
                .bc-badge--leader { background: #1d4ed8; color: #ffffff; border-color: #1d4ed8; }
                .bc-badge--follower { background: #0f766e; color: #ffffff; border-color: #0f766e; }
                .bc-badge--mock { border-style: dashed; border-color: #9333ea; color: #7e22ce; }
                .bc-grid-form {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
                    gap: 0.85rem;
                    margin: 1rem 0;
                }
                .bc-field { display: flex; flex-direction: column; gap: 0.35rem; }
                .bc-field label { font-size: 0.85rem; font-weight: 600; }
                .bc-field input, .bc-field select {
                    padding: 0.5rem 0.65rem;
                    border: 1px solid var(--border-color, #cbd5e1);
                    border-radius: 6px;
                    background: var(--surface-color, #ffffff);
                    color: var(--text-color, inherit);
                    font-size: 0.92rem;
                    min-block-size: 38px;
                }
                .bc-btn-row { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
                .bc-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0.45rem 0.9rem;
                    min-block-size: 36px;
                    min-inline-size: 36px;
                    border-radius: 6px;
                    border: 1px solid var(--border-color, #cbd5e1);
                    background: var(--surface-color, #f8fafc);
                    color: var(--text-color, inherit);
                    font-size: 0.88rem;
                    font-weight: 600;
                    cursor: pointer;
                }
                .bc-btn--primary {
                    background: var(--primary-color, #2563eb);
                    color: #ffffff;
                    border-color: var(--primary-color, #2563eb);
                }
                .bc-btn--danger {
                    border-color: #dc2626;
                    color: #dc2626;
                }
                .bc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .bc-lab-shell button:focus-visible,
                .bc-lab-shell input:focus-visible,
                .bc-lab-shell select:focus-visible,
                .bc-table-wrapper:focus-visible {
                    outline: 2px solid var(--primary-color, #2563eb);
                    outline-offset: 2px;
                }
                .bc-kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 0.75rem;
                }
                .bc-kpi {
                    padding: 0.75rem;
                    border-radius: 8px;
                    border: 1px solid var(--border-color, #e2e8f0);
                    background: var(--surface-color, #f8fafc);
                }
                .bc-kpi-label { font-size: 0.78rem; color: var(--text-subtle, #64748b); }
                .bc-kpi-val { font-size: 1.05rem; font-weight: 700; margin-top: 0.25rem; word-break: break-all; }
                .bc-banner {
                    padding: 0.7rem 0.95rem;
                    border-radius: 8px;
                    border-left: 4px solid var(--primary-color, #2563eb);
                    background: var(--surface-color, #f1f5f9);
                    font-size: 0.88rem;
                }
                .bc-table-wrapper {
                    container-type: inline-size;
                    overflow-x: auto;
                    border: 1px solid var(--border-color, #e2e8f0);
                    border-radius: 8px;
                    margin-top: 0.75rem;
                }
                .bc-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.85rem;
                    text-align: left;
                }
                .bc-table th, .bc-table td {
                    padding: 0.6rem 0.75rem;
                    border-bottom: 1px solid var(--border-color, #e2e8f0);
                    vertical-align: top;
                }
                .bc-table thead th {
                    position: sticky;
                    top: 0;
                    background: var(--surface-color, #f8fafc);
                    font-weight: 700;
                    z-index: 1;
                }
                @container (width < 600px) {
                    .bc-table thead { display: none; }
                    .bc-table tbody tr {
                        display: block;
                        padding: 0.65rem 0;
                        border-bottom: 2px solid var(--border-color, #cbd5e1);
                    }
                    .bc-table th[scope="row"],
                    .bc-table td {
                        display: flex;
                        justify-content: space-between;
                        gap: 0.75rem;
                        border-bottom: 1px dashed var(--border-color, #e2e8f0);
                        padding: 0.35rem 0.75rem;
                    }
                    .bc-table td::before,
                    .bc-table th[scope="row"]::before {
                        content: attr(data-label);
                        font-weight: 600;
                        color: var(--text-subtle, #64748b);
                        flex-shrink: 0;
                    }
                }
                .bc-logs {
                    max-height: 200px;
                    overflow-y: auto;
                    border: 1px solid var(--border-color, #e2e8f0);
                    border-radius: 8px;
                    padding: 0.65rem;
                    background: var(--surface-color, #f8fafc);
                    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                    font-size: 0.8rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.3rem;
                }
                .bc-code {
                    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                    font-size: 0.82rem;
                }
            </style>

            <div class="bc-lab-shell">
                <div id="bc-live-region" class="bc-sr-only" role="status" aria-live="polite">${liveMessage}</div>

                <section class="bc-card" aria-labelledby="bc-title-heading">
                    <div class="bc-header-row">
                        <div>
                            <h2 id="bc-title-heading" style="margin: 0;">🧩 Browser Cluster Lab — 跨分頁叢集與持久工作佇列</h2>
                            <p style="margin: 0.4rem 0 0; color: var(--text-subtle, #64748b); font-size: 0.9rem;">
                                整合 MessageBus、Web Locks LeaderElection、PeerDiscovery、RpcChannel 與 IndexedDB DurableTaskQueue 的真實多分頁實驗室（opt-in 啟動）。
                            </p>
                        </div>
                        <div class="bc-badges">
                            <span class="bc-badge ${capabilities.broadcastChannel ? "bc-badge--ok" : "bc-badge--warn"}">
                                BroadcastChannel: ${capabilities.broadcastChannel ? "支援" : "不支援"}
                            </span>
                            <span class="bc-badge ${capabilities.webLocks ? "bc-badge--ok" : "bc-badge--warn"}">
                                Web Locks: ${capabilities.webLocks ? "支援" : "不支援"}
                            </span>
                            <span class="bc-badge ${capabilities.indexedDB ? "bc-badge--ok" : "bc-badge--warn"}">
                                IndexedDB: ${capabilities.indexedDB ? "支援" : "不支援"}
                            </span>
                            <span class="bc-badge bc-badge--mock">
                                MockSharedConnection（靜態模擬傳輸層）
                            </span>
                        </div>
                    </div>

                    ${!allSupported ? html`
                        <div class="bc-banner" style="margin-top: 0.85rem; border-left-color: #d97706;">
                            ⚠️ 偵測到部份協調 API 不可用；本頁將依實際環境能力明確回報，不偽造跨分頁互斥或持久化保證。
                        </div>
                    ` : ""}

                    <div class="bc-grid-form">
                        <div class="bc-field">
                            <label for="bc-namespace">命名空間 (Namespace)</label>
                            <input
                                id="bc-namespace"
                                type="text"
                                value="${namespaceInput}"
                                oninput="this.closest('page-lab-browser-cluster').state.namespaceInput = this.value"
                                ${unsafe(disableConfig ? " disabled" : "")}
                            />
                        </div>
                        <div class="bc-field">
                            <label for="bc-node-name">節點顯示名稱（選填）</label>
                            <input
                                id="bc-node-name"
                                type="text"
                                placeholder="例：Worker-A"
                                value="${nodeLabelInput}"
                                oninput="this.closest('page-lab-browser-cluster').state.nodeLabelInput = this.value"
                                ${unsafe(disableConfig ? " disabled" : "")}
                            />
                        </div>
                        <div class="bc-field">
                            <label for="bc-lease-ms">租約時長 (ms)</label>
                            <input
                                id="bc-lease-ms"
                                type="number"
                                min="500"
                                max="30000"
                                step="250"
                                value="${String(leaseMsInput)}"
                                oninput="this.closest('page-lab-browser-cluster').state.leaseMsInput = Number(this.value) || 3000"
                                ${unsafe(disableConfig ? " disabled" : "")}
                            />
                        </div>
                        <div class="bc-field">
                            <label for="bc-max-attempts">預設重試上限 (maxAttempts)</label>
                            <input
                                id="bc-max-attempts"
                                type="number"
                                min="1"
                                max="10"
                                value="${String(maxAttemptsInput)}"
                                oninput="this.closest('page-lab-browser-cluster').state.maxAttemptsInput = Number(this.value) || 3"
                                ${unsafe(disableConfig ? " disabled" : "")}
                            />
                        </div>
                    </div>

                    <div class="bc-btn-row">
                        ${!joined ? html`
                            <button
                                id="bc-join-btn"
                                type="button"
                                class="bc-btn bc-btn--primary"
                                onclick="this.closest('page-lab-browser-cluster').joinCluster()"
                                ${unsafe(busy || !capabilities.indexedDB ? " disabled" : "")}
                            >
                                啟動 / 加入叢集
                            </button>
                        ` : html`
                            <button
                                id="bc-leave-btn"
                                type="button"
                                class="bc-btn bc-btn--danger"
                                onclick="this.closest('page-lab-browser-cluster').leaveCluster()"
                            >
                                離開叢集
                            </button>
                        `}
                        <button
                            id="bc-open-tab-btn"
                            type="button"
                            class="bc-btn"
                            onclick="this.closest('page-lab-browser-cluster').openSiblingTab()"
                        >
                            在新分頁開啟同命名空間
                        </button>
                        <button
                            id="bc-resign-btn"
                            type="button"
                            class="bc-btn"
                            onclick="this.closest('page-lab-browser-cluster').resignLeadership()"
                            ${unsafe(!joined || role !== "leader" ? " disabled" : "")}
                        >
                            主動讓出 Leader
                        </button>
                        ${joined && role === "idle" ? html`
                            <button
                                id="bc-rejoin-leader-btn"
                                type="button"
                                class="bc-btn"
                                onclick="this.closest('page-lab-browser-cluster').rejoinElection()"
                            >
                                重新參與選主
                            </button>
                        ` : ""}
                        <button
                            id="bc-refresh-btn"
                            type="button"
                            class="bc-btn"
                            onclick="this.closest('page-lab-browser-cluster')._reclaimAndRefresh()"
                            ${unsafe(!joined ? " disabled" : "")}
                        >
                            回收過期並重新整理
                        </button>
                        <button
                            id="bc-purge-btn"
                            type="button"
                            class="bc-btn"
                            onclick="this.closest('page-lab-browser-cluster').purgeTerminalTasks()"
                            ${unsafe(!joined ? " disabled" : "")}
                        >
                            清除終態紀錄
                        </button>
                        <button
                            id="bc-reset-ns-btn"
                            type="button"
                            class="bc-btn bc-btn--danger"
                            onclick="this.closest('page-lab-browser-cluster').resetCurrentNamespace()"
                            ${unsafe(!capabilities.indexedDB ? " disabled" : "")}
                        >
                            重置目前命名空間
                        </button>
                    </div>

                    <div class="bc-banner" style="margin-top: 0.9rem;">
                        ${liveMessage}
                    </div>
                </section>

                <section class="bc-card" aria-label="叢集與工作狀態總覽">
                    <div class="bc-kpi-grid">
                        <div class="bc-kpi">
                            <div class="bc-kpi-label">本機節點 ID</div>
                            <div class="bc-kpi-val bc-code" id="bc-node-id">${nodeId.slice(0, 12)}</div>
                        </div>
                        <div class="bc-kpi">
                            <div class="bc-kpi-label">選主角色 / Epoch</div>
                            <div class="bc-kpi-val" id="bc-role-badge">
                                <span class="bc-badge ${role === "leader" ? "bc-badge--leader" : role === "follower" ? "bc-badge--follower" : ""}">
                                    ${role} (epoch ${epoch})
                                </span>
                            </div>
                        </div>
                        <div class="bc-kpi">
                            <div class="bc-kpi-label">觀測 Leader 節點</div>
                            <div class="bc-kpi-val bc-code" id="bc-leader-id">${leaderObservedId ? leaderObservedId.slice(0, 12) : "-"}</div>
                        </div>
                        <div class="bc-kpi">
                            <div class="bc-kpi-label">活躍 Peers / 佇列統計</div>
                            <div class="bc-kpi-val" id="bc-stats-summary">
                                ${peers.length} 節點 · P:${stats.pending} R:${stats.running} C:${stats.completed} F:${stats.failed}
                            </div>
                        </div>
                        <div class="bc-kpi">
                            <div class="bc-kpi-label">${mockConnection.label}</div>
                            <div class="bc-kpi-val bc-code" id="bc-mock-conn-state">
                                ${mockConnection.state} (${mockConnection.messageCount} 則模擬幀)
                            </div>
                        </div>
                    </div>
                </section>

                <section class="bc-card" aria-labelledby="bc-tasks-submit-heading">
                    <h3 id="bc-tasks-submit-heading" style="margin-top: 0;">📦 新增持久工作與跨分頁 RPC</h3>
                    <form onsubmit="this.closest('page-lab-browser-cluster').enqueueTask(event)">
                        <div class="bc-grid-form">
                            <div class="bc-field">
                                <label for="bc-task-type">任務處理器 (v1)</label>
                                <select
                                    id="bc-task-type"
                                    onchange="this.closest('page-lab-browser-cluster').state.taskTypeInput = this.value"
                                >
                                    <option value="chunk.checksum" ${unsafe(taskTypeInput === "chunk.checksum" ? " selected" : "")}>chunk.checksum (FNV-1a 校驗)</option>
                                    <option value="transform.normalize" ${unsafe(taskTypeInput === "transform.normalize" ? " selected" : "")}>transform.normalize (字串正規化)</option>
                                </select>
                            </div>
                            <div class="bc-field">
                                <label for="bc-task-input">輸入內容 (payload.text)</label>
                                <input
                                    id="bc-task-input"
                                    type="text"
                                    value="${taskPayloadInput}"
                                    oninput="this.closest('page-lab-browser-cluster').state.taskPayloadInput = this.value"
                                />
                            </div>
                            <div class="bc-field">
                                <label for="bc-task-idempotency">冪等鍵 idempotencyKey（選填）</label>
                                <input
                                    id="bc-task-idempotency"
                                    type="text"
                                    placeholder="同 namespace 內去重"
                                    value="${taskIdempotencyInput}"
                                    oninput="this.closest('page-lab-browser-cluster').state.taskIdempotencyInput = this.value"
                                />
                            </div>
                            <div class="bc-field">
                                <label for="bc-task-delay">模擬處理耗時 (ms)</label>
                                <input
                                    id="bc-task-delay"
                                    type="number"
                                    min="0"
                                    max="5000"
                                    value="${String(taskDelayMsInput)}"
                                    oninput="this.closest('page-lab-browser-cluster').state.taskDelayMsInput = Number(this.value) || 0"
                                />
                            </div>
                            <div class="bc-field">
                                <label for="bc-task-fail-until">前 N 次強制失敗（重試測試）</label>
                                <input
                                    id="bc-task-fail-until"
                                    type="number"
                                    min="0"
                                    max="10"
                                    value="${String(taskFailUntilInput)}"
                                    oninput="this.closest('page-lab-browser-cluster').state.taskFailUntilInput = Number(this.value) || 0"
                                />
                            </div>
                        </div>

                        <div class="bc-btn-row">
                            <button
                                id="bc-enqueue-btn"
                                type="submit"
                                class="bc-btn bc-btn--primary"
                                ${unsafe(!joined ? " disabled" : "")}
                            >
                                加入持久化工作
                            </button>
                            <div class="bc-field" style="min-width: 180px;">
                                <label for="bc-rpc-target" class="bc-sr-only">RPC 目標節點</label>
                                <select
                                    id="bc-rpc-target"
                                    aria-label="RPC 目標節點"
                                    onchange="this.closest('page-lab-browser-cluster').state.rpcTargetInput = this.value"
                                >
                                    <option value="" ${unsafe(rpcTargetInput === "" ? " selected" : "")}>自動選擇目標 (${remotePeers.length > 0 ? "遠端/Leader" : "本機"})</option>
                                    ${peers.map((p) => html`
                                        <option value="${p.nodeId}" ${unsafe(rpcTargetInput === p.nodeId ? " selected" : "")}>
                                            ${p.meta?.label || p.nodeId.slice(0, 8)} (${p.nodeId.slice(0, 8)})
                                        </option>
                                    `)}
                                </select>
                            </div>
                            <button
                                id="bc-rpc-ping-btn"
                                type="button"
                                class="bc-btn"
                                onclick="this.closest('page-lab-browser-cluster').callClusterRpc('cluster.ping')"
                                ${unsafe(!joined ? " disabled" : "")}
                            >
                                RPC cluster.ping
                            </button>
                            <button
                                id="bc-rpc-stats-btn"
                                type="button"
                                class="bc-btn"
                                onclick="this.closest('page-lab-browser-cluster').callClusterRpc('cluster.stats')"
                                ${unsafe(!joined ? " disabled" : "")}
                            >
                                RPC cluster.stats
                            </button>
                        </div>
                    </form>

                    ${lastRpcResult ? html`
                        <pre id="bc-rpc-result" class="bc-logs" style="margin-top: 0.75rem; max-height: 110px;">${JSON.stringify(lastRpcResult, null, 2)}</pre>
                    ` : ""}
                </section>

                <section class="bc-card" aria-labelledby="bc-peers-heading">
                    <h3 id="bc-peers-heading" style="margin-top: 0;">🌐 PeerDiscovery 線上節點清單 (${peers.length})</h3>
                    <div class="bc-table-wrapper" tabindex="0" role="region" aria-labelledby="bc-peers-heading">
                        <table class="bc-table" id="bc-peers-table">
                            <caption class="bc-sr-only">目前命名空間內由 PeerDiscovery 探索到的線上節點</caption>
                            <thead>
                                <tr>
                                    <th scope="col">節點 ID</th>
                                    <th scope="col">標籤 / 身分</th>
                                    <th scope="col">狀態</th>
                                    <th scope="col">能力清單</th>
                                    <th scope="col">最後心跳</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${peers.length === 0 ? html`
                                    <tr>
                                        <td colspan="5">尚無活躍節點（點擊「啟動 / 加入叢集」後顯示）</td>
                                    </tr>
                                ` : peers.map((peer) => html`
                                    <tr>
                                        <th scope="row" data-label="節點 ID" class="bc-code">
                                            ${peer.nodeId.slice(0, 12)}${peer.nodeId === nodeId ? " (本機)" : ""}
                                        </th>
                                        <td data-label="標籤 / 身分">${peer.meta?.label || "-"}</td>
                                        <td data-label="狀態">${peer.status}</td>
                                        <td data-label="能力清單" class="bc-code">${Array.isArray(peer.capabilities) ? peer.capabilities.join(", ") : "-"}</td>
                                        <td data-label="最後心跳">${peer.lastSeenAt ? new Date(peer.lastSeenAt).toLocaleTimeString() : "-"}</td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section class="bc-card" aria-labelledby="bc-tasks-heading">
                    <h3 id="bc-tasks-heading" style="margin-top: 0;">🗃️ DurableTaskQueue 持久化任務表 (${tasks.length})</h3>
                    <div class="bc-table-wrapper" tabindex="0" role="region" aria-labelledby="bc-tasks-heading">
                        <table class="bc-table" id="bc-tasks-table">
                            <caption class="bc-sr-only">儲存在 IndexedDB 的跨分頁持久化任務清單與執行狀態</caption>
                            <thead>
                                <tr>
                                    <th scope="col">任務 ID / 類型</th>
                                    <th scope="col">狀態</th>
                                    <th scope="col">嘗試次數</th>
                                    <th scope="col">持有者 (Owner)</th>
                                    <th scope="col">冪等鍵</th>
                                    <th scope="col">結果 / 錯誤</th>
                                    <th scope="col">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tasks.length === 0 ? html`
                                    <tr>
                                        <td colspan="7">目前命名空間尚無持久化任務。</td>
                                    </tr>
                                ` : tasks.map((task) => html`
                                    <tr data-task-id="${task.id}" data-task-status="${task.status}">
                                        <th scope="row" data-label="任務 ID / 類型">
                                            <div class="bc-code">${task.id.slice(0, 10)}</div>
                                            <div>${task.type} (v${task.handlerVersion})</div>
                                        </th>
                                        <td data-label="狀態">${task.status}</td>
                                        <td data-label="嘗試次數">${task.attemptCount} / ${task.maxAttempts}</td>
                                        <td data-label="持有者 (Owner)" class="bc-code">${task.ownerId ? task.ownerId.slice(0, 10) : "-"}</td>
                                        <td data-label="冪等鍵" class="bc-code">${task.idempotencyKey || "-"}</td>
                                        <td data-label="結果 / 錯誤" class="bc-code">
                                            ${task.status === TASK_STATUS.COMPLETED
                                                ? this._formatJsonCompact(task.result)
                                                : task.lastError
                                                    ? `${task.lastError.code}: ${task.lastError.message}`
                                                    : "-"}
                                        </td>
                                        <td data-label="操作">
                                            <div class="bc-btn-row">
                                                ${(task.status === TASK_STATUS.FAILED || task.status === TASK_STATUS.CANCELLED) ? html`
                                                    <button
                                                        type="button"
                                                        class="bc-btn"
                                                        data-task-id="${task.id}"
                                                        onclick="this.closest('page-lab-browser-cluster').retryTask(this.dataset.taskId)"
                                                        ${unsafe(!joined ? " disabled" : "")}
                                                    >
                                                        重試
                                                    </button>
                                                ` : ""}
                                                ${(task.status === TASK_STATUS.PENDING || task.status === TASK_STATUS.RUNNING) ? html`
                                                    <button
                                                        type="button"
                                                        class="bc-btn bc-btn--danger"
                                                        data-task-id="${task.id}"
                                                        onclick="this.closest('page-lab-browser-cluster').cancelTask(this.dataset.taskId)"
                                                        ${unsafe(!joined ? " disabled" : "")}
                                                    >
                                                        取消
                                                    </button>
                                                ` : ""}
                                            </div>
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section class="bc-card" aria-labelledby="bc-guide-heading">
                    <h3 id="bc-guide-heading" style="margin-top: 0;">🛡️ 語義邊界、復原演練指引與即時事件</h3>
                    <ul style="margin: 0.5rem 0 1rem; padding-left: 1.25rem; font-size: 0.88rem; line-height: 1.6;">
                        <li><strong>投遞語義（At-least-once）</strong>：透過 IndexedDB 單一 transaction 原子認領與 <code>leaseId</code> 寫入防護確保同時只有一位 Worker 寫入結果；但瀏覽器強制中斷仍可能導致工作被接手重複執行，請搭配 <code>idempotencyKey</code> 與具冪等性的處理邏輯。<strong>不宣稱</strong> exactly-once。</li>
                        <li><strong>活躍頁籤前提（不宣稱背景必執行）</strong>：當所有分頁皆關閉時任務不會在背景秘密執行，但會安全保留於 IndexedDB，待任一分頁重新加入同一命名空間後自動續作與回收過期租約。</li>
                        <li><strong>Mock SharedConnection 聲明</strong>：上方 SharedConnection 狀態為靜態頁面展示模擬層；真實 WebSocket／SSE 轉發與單向限制由 <code>tests/helpers/realtime-server.mjs</code> 與整合測試驗證。</li>
                        <li><strong>斷線接管演練</strong>：將「模擬處理耗時」設為 <code>2500</code> ms，在任一分頁送出任務後立刻關閉執行中的分頁，觀察存活分頁透過 Web Locks 孤兒偵測或租約到期接手完成任務。</li>
                    </ul>
                    <div class="bc-logs" aria-label="叢集事件日誌">
                        ${logs.length === 0 ? html`<div>尚無事件紀錄。</div>` : logs.map((log) => html`
                            <div>[${log.time}] [${log.kind}] ${log.text}</div>
                        `)}
                    </div>
                </section>
            </div>
        `;
    }
}

if (!customElements.get("page-lab-browser-cluster")) {
    customElements.define("page-lab-browser-cluster", BrowserClusterPage);
}
