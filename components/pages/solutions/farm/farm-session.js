/**
 * Browser Computing Farm 分頁工作階段（#11）。每個分頁是一個節點：可以匯入圖片、建立批次，
 * 也可以選擇「加入處理」，以 1–4 條 lane 從 `DurableTaskQueue` 認領任務。
 *
 * - 圖片（輸入與輸出）存在範例自己的 Blob store；佇列 payload／result 只放 key。
 * - 輸出以 `taskId:leaseId` 為 key 寫入；只有 `completeAtomic` 成功（租約仍有效）的那一份會被任務 result 引用，
 *   過期租約留下的輸出由 `findOrphanOutputs` 判定後清除，舊 worker 不會覆蓋新結果。
 * - 寫入後以 MessageBus 發出 `farm:changed`，各分頁重讀；佇列狀態本身就在 IndexedDB，
 *   所有分頁關閉後重新開啟、加入處理，未完成的任務會繼續。
 * - 建立批次時先寫入 `creating` 的批次清單，再以固定的冪等鍵排入任務，最後標記 `ready`。
 *   建立者持有批次的 Web Lock；鎖已釋放（建立者中途關閉）而批次仍是 `creating` 時，任何分頁都會依清單補齊。
 * - 生命週期：加入、停止處理與釋放依序執行（`_serial`），每個 `await` 之後檢查是否已釋放，
 *   初始化中途離開路由時把已建立的 Worker 與佇列撤回，不會遺留。
 * - 寫入鎖 `vanilla_solution:<ns>:mutation`：匯入、建立與補齊批次、重試、寫入輸出取 shared，重設取 exclusive，
 *   重設期間不會有任務、批次或 Blob 寫進來；取得鎖後一律重讀，不沿用重設前讀到的資料。
 *   鎖順序固定為寫入鎖 → 批次鎖，重設只取寫入鎖，不會死結。
 */
import { TASK_STATUS, createDurableTaskQueue, createMessageBus, createPeerDiscovery } from '../../../../lib/coordination.js';
import { createTeardown, detectFeatures, resetSolutionData, resolveNamespace, solutionStorageName } from '../solution-kit.js';
import {
    FARM_HANDLER_VERSION,
    FARM_LIMITS,
    FARM_TASK_TYPE,
    FarmError,
    RUN_STATUS,
    runTaskKey,
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
/** 沒有 Web Locks 時無法得知建立者是否還在，`creating` 批次放置這麼久才補齊（補齊本身是冪等的） */
const RECOVER_WITHOUT_LOCKS_MS = 15000;

/** @param {Array<{ queue: any, processor: ImageProcessor }>} lanes */
export async function disposeLanes(lanes) {
    // 佇列釋放失敗也要終止 Worker；各 lane 互不影響
    await Promise.allSettled(lanes.map(async ({ queue, processor }) => {
        try {
            await queue?.dispose();
        } finally {
            processor.dispose();
        }
    }));
}

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
        /** 加入／停止／釋放依序執行 */
        this._lifecycle = Promise.resolve();
        this._recovering = null;
        /** @type {Set<ReturnType<typeof setTimeout>>} */
        this._timers = new Set();
        this._teardown.add(() => {
            for (const timer of this._timers) clearTimeout(timer);
            this._timers.clear();
        });
        this.recoveredRuns = 0;
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
                    this._recoverRuns(runs);
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
        if (this._disposed) return;
        this._bus.publish(FARM_TOPIC_CHANGED, detail);
        this.refreshSoon();
    }

    /** @param {() => void} fn @param {number} ms */
    _later(fn, ms) {
        if (this._disposed) return;
        const timer = setTimeout(() => {
            this._timers.delete(timer);
            fn();
        }, ms);
        this._timers.add(timer);
    }

    /**
     * 依序執行生命週期動作；前一個失敗不影響下一個。
     * @template T
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    _serial(fn) {
        const run = this._lifecycle.then(fn);
        this._lifecycle = run.catch(() => {});
        return run;
    }

    /**
     * 批次鎖：建立者持有到任務全部排入；恢復時以 ifAvailable 嘗試，取不到代表建立者還在。
     * 沒有 Web Locks 時直接執行（`held` 為 true）。
     * @template T
     * @param {string} runId
     * @param {boolean} ifAvailable
     * @param {(held: boolean) => Promise<T>} fn
     * @returns {Promise<T>}
     */
    _withRunLock(runId, ifAvailable, fn) {
        if (!navigator.locks) return fn(true);
        return navigator.locks.request(`${solutionStorageName(this.namespace, 'run')}:${runId}`, { ifAvailable }, (lock) => fn(Boolean(lock)));
    }

    /**
     * 寫入鎖：會寫入任務、批次或 Blob 的動作取 shared（可同時進行），重設取 exclusive。
     * 持有寫入鎖時只能再取批次鎖，不能再取寫入鎖（等待中的 exclusive 會擋住後到的 shared）。
     * 沒有 Web Locks 時直接執行：跨分頁沒有互斥，限制見 docs/solutions/farm.md。
     * @template T
     * @param {'shared' | 'exclusive'} mode
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    _withMutation(mode, fn) {
        if (!navigator.locks) return fn();
        return navigator.locks.request(solutionStorageName(this.namespace, 'mutation'), { mode }, () => fn());
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
        const available = await this._available();
        const now = Date.now();
        const metas = files.map((f) => ({ name: f.name, type: f.type, size: f.size, source: f }));
        // 檢查與寫入在同一個 transaction：兩個分頁同時匯入也不會一起突破張數與容量上限
        const result = await this._withMutation('shared', () => this.store.addInputsChecked((existing) => {
            const { accepted, rejected } = checkImport(metas, {
                existingCount: existing.length,
                existingBytes: existing.reduce((sum, i) => sum + i.size, 0),
                available,
            });
            return {
                records: accepted.map((meta, index) => ({
                    id: crypto.randomUUID(),
                    name: meta.name,
                    type: meta.type,
                    size: meta.size,
                    blob: meta.source.blob ?? meta.source,
                    createdAt: now + index,
                })),
                result: { accepted: accepted.length, rejected },
            };
        }));
        this._notify({ kind: 'inputs' });
        return result;
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
     * 為目前所有輸入建立一個批次：先寫入 `creating` 批次清單，再依清單排入任務，最後標記 `ready`。
     * @param {{ maxWidth?: any, format?: any, quality?: any }} rawParams
     */
    async createRun(rawParams) {
        const params = normalizeParams(rawParams);
        // 輸入在取得寫入鎖之後才讀：等到的若是剛完成的重設，這裡讀到的是重設後的狀態
        const runId = await this._withMutation('shared', async () => {
            const inputs = await this.store.listInputMeta();
            if (!inputs.length) throw new FarmError('INVALID_INPUT', '還沒有匯入圖片');
            const run = {
                id: crypto.randomUUID(),
                createdAt: Date.now(),
                status: RUN_STATUS.CREATING,
                params,
                inputs: inputs.map(({ id, name }) => ({ id, name })),
                taskIds: [],
                nodesAtStart: this._peers.getPeers({ includeSelf: true, capability: 'imageFarm' }).length,
            };
            await this._withRunLock(run.id, false, async () => {
                await this.store.putRun(run);
                await this._fillRun(run);
            });
            return run.id;
        });
        this._notify({ kind: 'run', runId });
        return runId;
    }

    /**
     * 依批次清單排入任務（冪等鍵去重：已排入的得到同一個任務），再把批次標記為 `ready`。
     * 呼叫者持有寫入鎖（shared），重設不會在這期間進行。沒有 Web Locks 時批次可能在這期間被重設刪除，
     * 此時撤銷這次排入的任務。
     * @param {{ id: string, params: object, inputs: Array<{ id: string, name: string }> }} run
     * @returns {Promise<boolean>} 是否完成
     */
    async _fillRun(run) {
        const taskIds = [];
        for (const input of run.inputs) {
            const { task } = await this._control.enqueue({
                type: FARM_TASK_TYPE,
                handlerVersion: FARM_HANDLER_VERSION,
                payload: { runId: run.id, inputId: input.id, name: input.name, params: run.params },
                idempotencyKey: runTaskKey(run.id, input.id),
                maxAttempts: MAX_ATTEMPTS,
            });
            taskIds.push(task.id);
        }
        const updated = await this.store.updateRun(run.id, { status: RUN_STATUS.READY, taskIds });
        if (!updated) {
            for (const id of taskIds) await this._control.cancel(id).catch(() => {});
            return false;
        }
        return true;
    }

    /**
     * 補齊建立中途中斷的批次。建立者還持有批次鎖時跳過（它會自己完成）；多個分頁同時恢復時，
     * 鎖讓同一時間只有一個在補，就算重疊，冪等鍵也保證不會有重複任務。
     * @param {Array<{ id: string, status?: string, createdAt: number }>} runs
     */
    _recoverRuns(runs) {
        if (this._recovering || this._disposed) return;
        const creating = runs.filter((run) => run.status === RUN_STATUS.CREATING);
        if (!creating.length) return;
        this._recovering = (async () => {
            let recovered = 0;
            let waiting = false;
            for (const run of creating) {
                if (this._disposed) return;
                if (!navigator.locks) {
                    const wait = RECOVER_WITHOUT_LOCKS_MS - (Date.now() - run.createdAt);
                    if (wait > 0) {
                        this._later(() => this.refreshSoon(), wait);
                        continue;
                    }
                }
                await this._withMutation('shared', () => this._withRunLock(run.id, true, async (held) => {
                    if (!held) waiting = true;
                    if (!held || this._disposed) return;
                    // 拿到鎖後重讀：建立者可能剛好完成，或批次已被重設刪除
                    const fresh = (await this.store.listRuns()).find((r) => r.id === run.id);
                    if (fresh?.status !== RUN_STATUS.CREATING) return;
                    if (await this._fillRun(fresh)) recovered++;
                }));
            }
            // 建立者還持有鎖：它會自己完成；若它其實正在關閉（離開訊息比鎖釋放早到），稍後再檢查
            if (waiting) this._later(() => this.refreshSoon(), 2000);
            if (recovered) {
                this.recoveredRuns += recovered;
                this._notify({ kind: 'run-recovered', count: recovered });
            }
        })().catch((err) => {
            if (!this._disposed) console.warn('[Farm] 恢復批次失敗', err);
        }).finally(() => {
            this._recovering = null;
        });
    }

    /**
     * 加入處理：建立 1–4 條 lane，每條有自己的佇列實例（各自的 workerId）與圖片處理器（各自的 Worker）。
     * 全部建立完成才生效；中途失敗或離開路由時撤回已建立的 lane。
     * @param {number} laneCount
     */
    join(laneCount = 1) {
        return this._serial(async () => {
            if (this._disposed || this.joined) return;
            const count = Math.min(Math.max(1, Math.trunc(laneCount) || 1), FARM_LIMITS.maxLanes);
            const lanes = [];
            try {
                for (let i = 0; i < count && !this._disposed; i++) {
                    const lane = { processor: new ImageProcessor(), queue: null };
                    lanes.push(lane);
                    await lane.processor.init();
                    if (this._disposed) break;
                    lane.queue = createDurableTaskQueue({
                        namespace: this.namespace,
                        bus: this._bus,
                        workerId: `${this.nodeId}#${i + 1}`,
                        pollIntervalMs: 400,
                    });
                    lane.queue.registerHandler(FARM_TASK_TYPE, (payload, ctx) => this._handle(lane, payload, ctx), { version: FARM_HANDLER_VERSION });
                    for (const type of ['task-claimed', 'task-completed', 'task-failed', 'task-retry-scheduled', 'task-reclaimed', 'lease-lost']) {
                        lane.queue.on(type, () => this._notify({ kind: type }));
                    }
                    await lane.queue.start();
                }
            } catch (err) {
                await disposeLanes(lanes);
                throw err;
            }
            if (this._disposed) {
                await disposeLanes(lanes);
                return;
            }
            this._lanes = lanes;
            this._updatePeer();
            this.refreshSoon();
        });
    }

    /**
     * 停止處理。只用 `dispose()`、不先 `stop({ abortActive: true })`：後者會讓中止的任務走 failAtomic，
     * 算一次失敗並等退避。dispose 不改寫資料庫，執行中的任務由 Web Lock 孤兒偵測或租約到期回收，
     * 與分頁被關閉時相同（回收同樣計入 maxAttempts）。
     */
    leave() {
        return this._serial(() => this._stopLanes());
    }

    async _stopLanes() {
        const lanes = this._lanes;
        this._lanes = [];
        await disposeLanes(lanes);
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
        // 處理期間可能已重設：任務不在了就不寫，不在重設後的資料庫留下舊世代的輸出。
        // 寫完到 completeAtomic 之間發生的重設會連同這份輸出一起刪除，completeAtomic 也找不到任務。
        await this._withMutation('shared', async () => {
            if (!(await this._control.getTask(ctx.taskId))) throw new Error('任務已不存在（可能已重設），放棄這次結果');
            if (ctx.signal?.aborted) throw new Error('租約已失效，放棄這次結果');
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
        const count = await this._withMutation('shared', async () => {
            const failed = await this._control.listTasks({ type: FARM_TASK_TYPE, status: TASK_STATUS.FAILED });
            for (const task of failed) await this._control.retry(task.id);
            return failed.length;
        });
        this._notify({ kind: 'retry' });
        return count;
    }

    /** @param {string} key */
    async getOutputBlob(key) {
        return (await this.store.getOutput(key))?.blob ?? null;
    }

    /**
     * 重設：停止本節點，取得 exclusive 寫入鎖後清除佇列中這個 namespace 的任務（共用資料庫只清 namespace），
     * 再刪除 Blob store。等待中的建立、補齊與輸出寫入在重設完成後才進行，並重讀重設後的狀態。
     * 其他分頁的連線在 versionchange 時自動讓出。
     */
    async reset() {
        await this.leave();
        const report = await this._withMutation('exclusive', async () => {
            await this._control.clearNamespace();
            this.store.close();
            return resetSolutionData({ databases: [this.store.dbName] });
        });
        this._notify({ kind: 'reset' });
        await this.refresh();
        return report;
    }

    async dispose() {
        this._disposed = true;
        // 排在進行中的 join 之後：join 在下一個 await 之後看到已釋放，撤回自己建立的 lane
        await this._serial(() => this._stopLanes());
        await this._teardown.run();
    }
}
