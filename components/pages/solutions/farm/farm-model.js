/**
 * Browser Computing Farm 的規則（#11）：處理參數、匯入限制、輸出命名、孤兒輸出判定與批次統計。
 * 純函式、匯入零副作用，Node 測試可直接驗證。
 */

export const FARM_TASK_TYPE = 'image.process';
export const FARM_HANDLER_VERSION = 1;
export const FARM_SCHEMA_VERSION = 1;

/** 匯入限制：展示用，避免把瀏覽器儲存空間塞滿 */
export const FARM_LIMITS = Object.freeze({
    maxFiles: 40,
    maxFileBytes: 15 * 1024 * 1024,
    maxTotalBytes: 150 * 1024 * 1024,
    maxLanes: 4,
    minWidth: 16,
    maxWidth: 4096,
});

export const OUTPUT_FORMATS = Object.freeze({
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
});

export const DEFAULT_PARAMS = Object.freeze({ maxWidth: 640, format: 'image/webp', quality: 0.8 });

export class FarmError extends Error {
    /**
     * @param {'INVALID_PARAMS' | 'INVALID_INPUT' | 'QUOTA_EXCEEDED' | 'UNSUPPORTED'} code
     * @param {string} message
     */
    constructor(code, message) {
        super(message);
        this.name = 'FarmError';
        this.code = code;
    }
}

/**
 * 驗證並正規化處理參數。
 * @param {{ maxWidth?: any, format?: any, quality?: any }} input
 * @returns {{ maxWidth: number, format: string, quality: number }}
 */
export function normalizeParams(input = {}) {
    const maxWidth = Number(input.maxWidth ?? DEFAULT_PARAMS.maxWidth);
    if (!Number.isInteger(maxWidth) || maxWidth < FARM_LIMITS.minWidth || maxWidth > FARM_LIMITS.maxWidth) {
        throw new FarmError('INVALID_PARAMS', `最大寬度必須是 ${FARM_LIMITS.minWidth}–${FARM_LIMITS.maxWidth} 的整數`);
    }
    const format = String(input.format ?? DEFAULT_PARAMS.format);
    if (!Object.hasOwn(OUTPUT_FORMATS, format)) throw new FarmError('INVALID_PARAMS', `不支援的輸出格式：${format}`);
    const quality = Number(input.quality ?? DEFAULT_PARAMS.quality);
    if (!(quality > 0 && quality <= 1)) throw new FarmError('INVALID_PARAMS', '品質必須介於 0（不含）到 1 之間');
    return { maxWidth, format, quality };
}

/**
 * 依最大寬度等比例縮小（不放大）。
 * @param {number} width
 * @param {number} height
 * @param {number} maxWidth
 * @returns {{ width: number, height: number }}
 */
export function fitWidth(width, height, maxWidth) {
    if (width <= maxWidth) return { width, height };
    return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

/**
 * 檢查一批匯入檔案（只看中繼資料，不讀內容）。
 * @param {Array<{ name: string, type: string, size: number }>} files
 * @param {{ existingCount?: number, existingBytes?: number, available?: number | null }} [context]
 *   available：`navigator.storage.estimate()` 算出的剩餘空間；未知時為 null
 * @returns {{ accepted: Array<{ name: string, type: string, size: number }>, rejected: Array<{ name: string, reason: string }>, totalBytes: number }}
 */
export function checkImport(files, { existingCount = 0, existingBytes = 0, available = null } = {}) {
    const accepted = [];
    const rejected = [];
    let totalBytes = existingBytes;
    for (const file of files) {
        if (!/^image\//.test(file.type)) {
            rejected.push({ name: file.name, reason: '不是圖片檔' });
        } else if (file.size > FARM_LIMITS.maxFileBytes) {
            rejected.push({ name: file.name, reason: `超過單檔上限 ${formatBytes(FARM_LIMITS.maxFileBytes)}` });
        } else if (existingCount + accepted.length >= FARM_LIMITS.maxFiles) {
            rejected.push({ name: file.name, reason: `超過 ${FARM_LIMITS.maxFiles} 張上限` });
        } else if (totalBytes + file.size > FARM_LIMITS.maxTotalBytes) {
            rejected.push({ name: file.name, reason: `超過總容量上限 ${formatBytes(FARM_LIMITS.maxTotalBytes)}` });
        } else {
            accepted.push(file);
            totalBytes += file.size;
        }
    }
    // 輸入與輸出都要存，預留兩倍空間
    const needed = (totalBytes - existingBytes) * 2;
    if (available !== null && needed > available) {
        throw new FarmError('QUOTA_EXCEEDED', `瀏覽器剩餘儲存空間不足：需要約 ${formatBytes(needed)}，剩餘 ${formatBytes(available)}`);
    }
    return { accepted, rejected, totalBytes };
}

/**
 * 輸出檔名：原檔名去掉副檔名，加上寬度與新副檔名。
 * @param {string} inputName
 * @param {string} type 實際輸出的 MIME type（瀏覽器不支援要求的格式時會改用 PNG）
 * @param {number} width
 */
export function outputName(inputName, type, width) {
    const base = String(inputName).replace(/\.[^./\\]+$/, '') || 'image';
    return `${base}-${width}w.${OUTPUT_FORMATS[type] ?? 'bin'}`;
}

/**
 * 輸出的儲存 key：每次認領都有新的 leaseId，舊租約與新租約的輸出不會互相覆蓋；
 * 以 completeAtomic 成功寫入任務 result 的那一個 key 為準。
 * @param {string} taskId
 * @param {string} leaseId
 */
export function outputKey(taskId, leaseId) {
    return `${taskId}:${leaseId}`;
}

/**
 * 找出孤兒輸出：沒有被任何已完成任務的 result 引用，也不屬於正在執行中的租約。
 * 例如 worker 寫完輸出後租約已被別人接手，completeAtomic 被拒絕。剛寫入的輸出保留一段寬限時間。
 * @param {Array<{ key: string, createdAt: number }>} outputs
 * @param {Array<{ id: string, status: string, leaseId?: string | null, result?: { outputKey?: string } | null }>} tasks
 * @param {number} now
 * @param {number} [graceMs]
 * @returns {string[]} 可刪除的 key
 */
export function findOrphanOutputs(outputs, tasks, now, graceMs = 30000) {
    const keep = new Set();
    for (const task of tasks) {
        if (task.status === 'completed' && task.result?.outputKey) keep.add(task.result.outputKey);
        if (task.status === 'running' && task.leaseId) keep.add(outputKey(task.id, task.leaseId));
    }
    return outputs.filter((o) => !keep.has(o.key) && now - o.createdAt > graceMs).map((o) => o.key);
}

/**
 * 批次統計：進度、耗時、吞吐量、各節點完成數、重試與失敗。
 * 耗時從建立批次算到最後一張完成；還沒全部結束時算到 now。
 * @param {{ createdAt: number, taskIds: string[] }} run
 * @param {object[]} tasks 這個批次的任務
 * @param {number} now
 */
export function summarizeRun(run, tasks, now) {
    const byStatus = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    const perNode = {};
    let lastFinished = run.createdAt;
    let retried = 0;
    let processingMs = 0;
    for (const task of tasks) {
        byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
        if (task.attemptCount > 1) retried++;
        if (task.status === 'completed' && task.result) {
            const node = task.result.nodeId ?? 'unknown';
            perNode[node] = (perNode[node] ?? 0) + 1;
            lastFinished = Math.max(lastFinished, task.result.finishedAt ?? task.updatedAt ?? run.createdAt);
            processingMs += task.result.durationMs ?? 0;
        }
    }
    const total = run.taskIds.length;
    const done = byStatus.completed + byStatus.failed + byStatus.cancelled;
    const finished = total > 0 && done >= total;
    const elapsedMs = Math.max(0, (finished ? lastFinished : now) - run.createdAt);
    return {
        total,
        byStatus,
        finished,
        progress: total ? done / total : 0,
        elapsedMs,
        throughput: elapsedMs > 0 ? byStatus.completed / (elapsedMs / 1000) : 0,
        perNode,
        nodeCount: Object.keys(perNode).length,
        retried,
        avgProcessingMs: byStatus.completed ? Math.round(processingMs / byStatus.completed) : null,
    };
}

/** @param {number} bytes */
export function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
