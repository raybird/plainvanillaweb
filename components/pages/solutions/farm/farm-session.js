/**
 * Browser Computing Farm 分頁工作階段（#11）。每個分頁是一個節點：可以匯入圖片、建立批次，
 * 也可以選擇「加入處理」，以 1–4 條 lane 從 `DurableTaskQueue` 認領任務。
 *
 * - 圖片（輸入與輸出）存在範例自己的 Blob store；佇列 payload／result 只放 key。
 * - 輸出以 `taskId:leaseId` 為 key 寫入；只有 `completeAtomic` 成功（租約仍有效）的那一份會被任務 result 引用，
 *   過期租約留下的輸出由 `findOrphanOutputs` 判定後清除，舊 worker 不會覆蓋新結果。
 * - 寫入後以 MessageBus 發出 `farm:changed`，各分頁重讀；佇列狀態本身就在 IndexedDB，
 *   所有分頁關閉後重新開啟、加入處理，未完成的任務會繼續。
 */
import { TASK_STATUS, createDurableTaskQueue, createMessageBus, createPeerDiscovery } from '../../../../lib/coordination.js';
import { createTeardown, detectFeatures, resetSolutionData, resolveNamespace, solutionStorageName } from '../solution-kit.js';
import {
    FARM_HANDLER_VERSION,
    FARM_LIMITS,
    FARM_TASK_TYPE,
    FarmError,
    checkImport,
    findOrphanOutputs,
    normalizeParams,
    outputKey,
    outputName,
} from './farm-model.js';
import { createBrokenImage, generateSampleImage } from './farm-image.js';
import { FarmStore } from './farm-store.js';
import { ImageProcessor } from './farm-processor.js';

export const FARM_SLUG = 'farm';
export const FARM_TOPIC_CHANGED = 'farm:changed';
const MAX_ATTEMPTS = 3;
const REFRESH_THROTTLE_MS = 200;

/**
 * 必要：IndexedDB、BroadcastChannel、createImageBitmap。
 * 選用：Worker 與 OffscreenCanvas（沒有時在主執行緒處理）、Web Locks（沒有時只靠租約逾時回收中斷的任務）、
 * storage.estimate（沒有時無法事先檢查剩餘空間）。
 */
export function detectFarmFeatures() {
    return detectFeatures({
        indexedDB: () => typeof indexedDB !== 'undefined',
        broadcastChannel: () => typeof BroadcastChannel === 'function',
        createImageBitmap: () => typeof createImageBitmap === 'function',
        offscreenCanvas: () => typeof OffscreenCanvas === 'function' && typeof Worker === 'function',
        webLocks: () => !!navigator.locks,
        storageEstimate: () => !!navigator.storage?.estimate,
    });
}

export class FarmSession {
    static get supported() {
        const { supported } = detectFarmFeatures();
        return supported.indexedDB && supported.broadcastChannel && supported.createImageBitmap;
    }

    /** @param {{ hash?: string, onChange: (snapshot: object) => void }} options */
    constructor({ hash = location.hash, onChange }) {
        this.namespace = resolveNamespace(FARM_SLUG, hash);
        this.store = new FarmStore(solutionStorageName(this.namespace, 'blobs'));
        this._onChange = onChange;
        this._teardown = createTeardown();
        this._teardown.add(() => this.store.close());
        /** @type {Array<{ queue: any, processor: ImageProcessor }>} */
        this._lanes = [];
        this.processed = 0;
        this._timer = null;
        this._refreshing = null;
        this._dirty = false;
        this._disposed = false;
        this.snapshot = null;
    }

    get nodeId() {
        return this._peers?.nodeId ?? null;
    }

    get joined() {
        return this._lanes.length > 0;
    }

    get engine() {
        return this._lanes[0]?.processor.engine ?? null;
    }

    async start() {
        this._bus = createMessageBus({ namespace: this.namespace });
        this._teardown.add(() => this._bus.dispose());
        this._teardown.add(this._bus.subscribe(FARM_TOPIC_CHANGED, () => this.refreshSoon()));
        // 不啟動的控制用佇列：建立批次、列出任務、重試與清除，不認領任務
        this._control = createDurableTaskQueue({ namespace: this.namespace, bus: this._bus });
        this._teardown.add(() => this._control.dispose());
        this._peers = createPeerDiscovery({
            bus: this._bus,
            capabilities: { imageFarm: false },
            meta: { lanes: 0, processed: 0, engine: null },
            heartbeatIntervalMs: 1000,
            peerTimeoutMs: 3500,
        });
        this._teardown.add(() => this._peers.dispose());
        for (const type of ['peer-join', 'peer-leave', 'peer-expire', 'peer-update']) {
            this._teardown.add(this._peers.on(type, () => this.refreshSoon()));
        }
        this._peers.start();
        const onVisible = () => {
            if (document.visibilityState === 'visible') this.refreshSoon();
        };
        document.addEventListener('visibilitychange', onVisible);
        this._teardown.add(() => document.removeEventListener('visibilitychange', onVisible));
        this._teardown.add(() => clearTimeout(this._timer));
        await this.refresh();
    }

    /** 事件很密集（每張圖完成都會通知），合併成最多每 200ms 重讀一次 */
    refreshSoon() {
        if (this._disposed || this._timer) return;
        this._timer = setTimeout(() => {
            this._timer = null;
            this.refresh();
        }, REFRESH_THROTTLE_MS);
    }

    refresh() {
        if (this._disposed) return Promise.resolve();
        if (this._refreshing) {
            this._dirty = true;
            return this._refreshing;
        }
        this._refreshing = (async () => {
            do {
                this._dirty = false;
                try {
                    const [tasks, inputs, outputs, runs] = await Promise.all([
                        this._control.listTasks({ type: FARM_TASK_TYPE }),
                        this.store.listInputMeta(),
                        this.store.listOutputMeta(),
                        this.store.listRuns(),
                    ]);
                    const orphans = findOrphanOutputs(outputs, tasks, Date.now());
                    if (orphans.length) await this.store.deleteOutputs(orphans);
                    const orphanSet = new Set(orphans);
                    this.snapshot = {
                        tasks,
                        inputs,
                        outputs: outputs.filter((o) => !orphanSet.has(o.key)),
                        runs,
                        peers: this._peers.getPeers({ includeSelf: true }),
                        joined: this.joined,
                        lanes: this._lanes.length,
                        engine: this.engine,
                        processed: this.processed,
                        orphansRemoved: orphans.length,
                        error: null,
                    };
                } catch (err) {
                    this.snapshot = { ...(this.snapshot ?? {}), error: err };
                }
                if (this._disposed) return;
                this._onChange(this.snapshot);
            } while (this._dirty && !this._disposed);
        })().finally(() => {
            this._refreshing = null;
        });
        return this._refreshing;
    }

    _notify(detail) {
        this._bus.publish(FARM_TOPIC_CHANGED, detail);
        this.refreshSoon();
    }

    /** 剩餘儲存空間；不支援 estimate 時回傳 null */
    async _available() {
        if (!navigator.storage?.estimate) return null;
        const { quota = 0, usage = 0 } = await navigator.storage.estimate();
        return quota ? Math.max(0, quota - usage) : null;
    }

    /**
     * 匯入圖片（File 或 { name, type, size, blob }）。超出限制的檔案列在 rejected，不會中斷其他檔案。
     * @param {Array<File | { name: string, type: string, size: number, blob: Blob }>} files
     */
    async addFiles(files) {
        const existing = await this.store.listInputMeta();
        const metas = files.map((f) => ({ name: f.name, type: f.type, size: f.size, source: f }));
        const { accepted, rejected } = checkImport(metas, {
            existingCount: existing.length,
            existingBytes: existing.reduce((sum, i) => sum + i.size, 0),
            available: await this._available(),
        });
        const now = Date.now();
        await this.store.putInputs(accepted.map((meta, index) => ({
            id: crypto.randomUUID(),
            name: meta.name,
            type: meta.type,
            size: meta.size,
            blob: meta.source.blob ?? meta.source,
            createdAt: now + index,
        })));
        this._notify({ kind: 'inputs' });
        return { accepted: accepted.length, rejected };
    }

    /**
     * 產生內建測試圖片；可加入一張無法解碼的圖片來展示失敗與重試。
     * @param {number} count
     * @param {{ broken?: boolean, width?: number, height?: number }} [options]
     */
    async addSamples(count, { broken = false, width, height } = {}) {
        const existing = (await this.store.listInputMeta()).length;
        const files = [];
        for (let i = 0; i < count; i++) {
            const blob = await generateSampleImage(existing + i, { width, height });
            files.push({ name: `sample-${String(existing + i + 1).padStart(2, '0')}.png`, type: blob.type, size: blob.size, blob });
        }
        if (broken) {
            const blob = createBrokenImage();
            files.push({ name: 'broken.png', type: blob.type, size: blob.size, blob });
        }
        return this.addFiles(files);
    }

    /**
     * 為目前所有輸入建立一個批次。同一批次重送時 idempotencyKey 去重，不會重複建立任務。
     * @param {{ maxWidth?: any, format?: any, quality?: any }} rawParams
     */
    async createRun(rawParams) {
        const params = normalizeParams(rawParams);
        const inputs = await this.store.listInputMeta();
        if (!inputs.length) throw new FarmError('INVALID_INPUT', '還沒有匯入圖片');
        const runId = crypto.randomUUID();
        const createdAt = Date.now();
        const taskIds = [];
        for (const input of inputs) {
            const { task } = await this._control.enqueue({
                type: FARM_TASK_TYPE,
                handlerVersion: FARM_HANDLER_VERSION,
                payload: { runId, inputId: input.id, name: input.name, params },
                idempotencyKey: `${runId}:${input.id}`,
                maxAttempts: MAX_ATTEMPTS,
            });
            taskIds.push(task.id);
        }
        const nodesAtStart = this._peers.getPeers({ includeSelf: true, capability: 'imageFarm' }).length;
        await this.store.putRun({ id: runId, createdAt, params, taskIds, nodesAtStart });
        this._notify({ kind: 'run', runId });
        return runId;
    }

    /**
     * 加入處理：建立 1–4 條 lane，每條有自己的佇列實例（各自的 workerId）與圖片處理器（各自的 Worker）。
     * @param {number} laneCount
     */
    async join(laneCount = 1) {
        if (this.joined) return;
        const count = Math.min(Math.max(1, Math.trunc(laneCount) || 1), FARM_LIMITS.maxLanes);
        for (let i = 0; i < count; i++) {
            const processor = new ImageProcessor();
            await processor.init();
            const queue = createDurableTaskQueue({
                namespace: this.namespace,
                bus: this._bus,
                workerId: `${this.nodeId}#${i + 1}`,
                pollIntervalMs: 400,
            });
            const lane = { queue, processor };
            queue.registerHandler(FARM_TASK_TYPE, (payload, ctx) => this._handle(lane, payload, ctx), { version: FARM_HANDLER_VERSION });
            for (const type of ['task-claimed', 'task-completed', 'task-failed', 'task-retry-scheduled', 'task-reclaimed', 'lease-lost']) {
                queue.on(type, () => this._notify({ kind: type }));
            }
            this._lanes.push(lane);
            await queue.start();
        }
        this._updatePeer();
        this.refreshSoon();
    }

    /**
     * 停止處理。只用 `dispose()`、不先 `stop({ abortActive: true })`：後者會讓中止的任務走 failAtomic，
     * 算一次失敗並等退避。dispose 不改寫資料庫，執行中的任務由 Web Lock 孤兒偵測或租約到期回收，
     * 與分頁被關閉時相同（回收同樣計入 maxAttempts）。
     */
    async leave() {
        const lanes = this._lanes;
        this._lanes = [];
        await Promise.allSettled(lanes.map(async ({ queue, processor }) => {
            await queue.dispose();
            processor.dispose();
        }));
        if (!this._disposed) {
            this._updatePeer();
            this.refreshSoon();
        }
    }

    _updatePeer() {
        if (this._disposed) return;
        this._peers.updateCapabilities({ imageFarm: this.joined }, { lanes: this._lanes.length, processed: this.processed, engine: this.engine });
    }

    async _handle(lane, payload, ctx) {
        const input = await this.store.getInput(payload.inputId);
        if (!input) throw new Error('找不到輸入圖片（可能已重設）');
        const started = performance.now();
        const out = await lane.processor.process(input.blob, payload.params);
        // 租約已失效（例如本節點被凍結太久、任務已被接手）：不寫輸出，交給新的擁有者
        if (ctx.signal?.aborted) throw new Error('租約已失效，放棄這次結果');
        const key = outputKey(ctx.taskId, ctx.leaseId);
        const name = outputName(payload.name, out.blob.type, out.width);
        const durationMs = Math.round(performance.now() - started);
        await this.store.putOutput({
            key,
            taskId: ctx.taskId,
            leaseId: ctx.leaseId,
            runId: payload.runId,
            inputId: payload.inputId,
            name,
            blob: out.blob,
            type: out.blob.type,
            size: out.blob.size,
            width: out.width,
            height: out.height,
            createdAt: Date.now(),
        });
        this.processed++;
        this._updatePeer();
        return {
            outputKey: key,
            name,
            type: out.blob.type,
            size: out.blob.size,
            width: out.width,
            height: out.height,
            sourceWidth: out.sourceWidth,
            sourceHeight: out.sourceHeight,
            durationMs,
            nodeId: this.nodeId,
            workerId: ctx.ownerId,
            engine: lane.processor.engine,
            finishedAt: Date.now(),
        };
    }

    async retryFailed() {
        const failed = await this._control.listTasks({ type: FARM_TASK_TYPE, status: TASK_STATUS.FAILED });
        for (const task of failed) await this._control.retry(task.id);
        this._notify({ kind: 'retry' });
        return failed.length;
    }

    /** @param {string} key */
    async getOutputBlob(key) {
        return (await this.store.getOutput(key))?.blob ?? null;
    }

    /**
     * 重設：停止本節點、清除佇列中這個 namespace 的任務（共用資料庫只清 namespace），
     * 再刪除 Blob store。其他分頁的連線在 versionchange 時自動讓出。
     */
    async reset() {
        await this.leave();
        await this._control.clearNamespace();
        this.store.close();
        const report = await resetSolutionData({ databases: [this.store.dbName] });
        this._notify({ kind: 'reset' });
        await this.refresh();
        return report;
    }

    async dispose() {
        this._disposed = true;
        await this.leave();
        await this._teardown.run();
    }
}
