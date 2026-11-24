import { BaseService } from './base-service.js';
import {
    DEFAULT_NAMESPACE,
    generateContextId,
    getCoordinationCapabilities,
} from './broadcast-channel.js';

/** 工作資料結構版本 */
export const TASK_SCHEMA_VERSION = 1;

/** 預設 IndexedDB 資料庫名稱 */
export const DEFAULT_TASK_DB_NAME = 'vanilla_coordination_tasks';

/** 預設 IndexedDB ObjectStore 名稱 */
export const DEFAULT_TASK_STORE_NAME = 'tasks';

/** 預設租約毫秒數 */
export const DEFAULT_LEASE_DURATION_MS = 5000;

/** 預設輪詢間隔毫秒數 */
export const DEFAULT_POLL_INTERVAL_MS = 1000;

/** 預設過期回收檢查間隔毫秒數 */
export const DEFAULT_RECLAIM_INTERVAL_MS = 2500;

/** 預設失敗重試次數上限 */
export const DEFAULT_MAX_ATTEMPTS = 3;

/** 預設完成／失敗／取消紀錄保留毫秒數（7 天） */
export const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const TOPIC_WAKEUP_PREFIX = '__tq:wakeup:';
const TASK_LOCK_PREFIX = 'vanilla:coord:tq';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** 任務狀態列舉 */
export const TASK_STATUS = Object.freeze({
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

const TERMINAL_STATUSES = new Set([
    TASK_STATUS.COMPLETED,
    TASK_STATUS.FAILED,
    TASK_STATUS.CANCELLED,
]);

/** DurableTaskQueue 標準錯誤代碼 */
export const TASK_QUEUE_ERROR_CODES = Object.freeze({
    UNSUPPORTED_ENVIRONMENT: 'UNSUPPORTED_ENVIRONMENT',
    INVALID_TASK: 'INVALID_TASK',
    HANDLER_NOT_FOUND: 'HANDLER_NOT_FOUND',
    HANDLER_VERSION_MISMATCH: 'HANDLER_VERSION_MISMATCH',
    LEASE_LOST: 'LEASE_LOST',
    TASK_NOT_FOUND: 'TASK_NOT_FOUND',
    INVALID_STATE: 'INVALID_STATE',
    SERIALIZATION_ERROR: 'SERIALIZATION_ERROR',
    DISPOSED: 'DISPOSED',
    STORAGE_ERROR: 'STORAGE_ERROR',
});

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isNonNegativeFinite(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * 檢查並深度複製可結構化複製之安全資料（禁止原型污染鍵與循環參照）
 * @param {unknown} value
 * @param {string} [path]
 * @param {WeakSet<object>} [seen]
 */
function assertSafeStructuredValue(value, path = 'value', seen = new WeakSet()) {
    if (value === undefined || value === null || typeof value !== 'object') {
        if (typeof value === 'function' || typeof value === 'symbol') {
            throw new TaskQueueError(
                TASK_QUEUE_ERROR_CODES.SERIALIZATION_ERROR,
                `Task ${path} cannot contain functions or symbols`
            );
        }
        return;
    }

    if (seen.has(value)) {
        throw new TaskQueueError(
            TASK_QUEUE_ERROR_CODES.SERIALIZATION_ERROR,
            `Task ${path} contains circular reference`
        );
    }

    seen.add(value);
    try {
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                throw new TaskQueueError(
                    TASK_QUEUE_ERROR_CODES.SERIALIZATION_ERROR,
                    `Task ${path} contains Invalid Date`
                );
            }
            return;
        }
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                assertSafeStructuredValue(value[i], `${path}[${i}]`, seen);
            }
            return;
        }
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            throw new TaskQueueError(
                TASK_QUEUE_ERROR_CODES.SERIALIZATION_ERROR,
                `Task ${path} nested objects must be plain objects, arrays, or Dates`
            );
        }
        for (const key of Object.keys(value)) {
            if (FORBIDDEN_KEYS.has(key)) {
                throw new TaskQueueError(
                    TASK_QUEUE_ERROR_CODES.SERIALIZATION_ERROR,
                    `Task ${path} contains forbidden key: ${key}`
                );
            }
            assertSafeStructuredValue(value[key], `${path}.${key}`, seen);
        }
    } finally {
        seen.delete(value);
    }
}

function cloneStructuredValue(value, path = 'value') {
    assertSafeStructuredValue(value, path);
    if (value === undefined || value === null || typeof value !== 'object') {
        return value;
    }
    try {
        if (typeof globalThis.structuredClone === 'function') {
            return globalThis.structuredClone(value);
        }
        return JSON.parse(JSON.stringify(value));
    } catch (err) {
        throw new TaskQueueError(
            TASK_QUEUE_ERROR_CODES.SERIALIZATION_ERROR,
            `Task ${path} failed structured clone: ${err?.message || err}`,
            { cause: err }
        );
    }
}

function buildIdempotencyCompositeKey(namespace, idempotencyKey) {
    if (!isNonEmptyString(idempotencyKey)) return undefined;
    return `${encodeURIComponent(namespace)}:${encodeURIComponent(idempotencyKey)}`;
}

function buildTaskLockName(namespace, taskId) {
    return `${TASK_LOCK_PREFIX}:${encodeURIComponent(namespace)}:${encodeURIComponent(taskId)}`;
}

function cloneTaskRecord(record) {
    if (!record) return null;
    return {
        id: record.id,
        schemaVersion: record.schemaVersion,
        namespace: record.namespace,
        type: record.type,
        handlerVersion: record.handlerVersion,
        payload: cloneStructuredValue(record.payload, 'payload'),
        status: record.status,
        priority: record.priority,
        idempotencyKey: record.idempotencyKey ?? null,
        attemptCount: record.attemptCount,
        maxAttempts: record.maxAttempts,
        ownerId: record.ownerId ?? null,
        leaseId: record.leaseId ?? null,
        leaseExpiresAt: record.leaseExpiresAt ?? null,
        lockProtected: Boolean(record.lockProtected),
        lockName: record.lockName ?? null,
        nextRunAt: record.nextRunAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        startedAt: record.startedAt ?? null,
        completedAt: record.completedAt ?? null,
        failedAt: record.failedAt ?? null,
        cancelledAt: record.cancelledAt ?? null,
        result: record.result !== undefined ? cloneStructuredValue(record.result, 'result') : undefined,
        lastError: record.lastError ? { ...record.lastError } : null,
    };
}

function toStoredRecord(record) {
    const out = cloneTaskRecord(record);
    const composite = buildIdempotencyCompositeKey(out.namespace, out.idempotencyKey);
    if (composite !== undefined) {
        out.idempotencyCompositeKey = composite;
    }
    return out;
}

function serializeTaskError(error, now) {
    let code = TASK_QUEUE_ERROR_CODES.STORAGE_ERROR;
    let message = 'Unknown task error';
    let name = 'Error';

    if (error instanceof Error) {
        name = error.name || 'Error';
        message = error.message || name;
        if (isNonEmptyString(error.code)) {
            code = error.code;
        }
    } else if (typeof error === 'string') {
        message = error;
    } else if (isPlainObject(error)) {
        if (isNonEmptyString(error.code)) code = error.code;
        if (isNonEmptyString(error.message)) message = error.message;
        if (isNonEmptyString(error.name)) name = error.name;
    }

    return { code, message, name, at: now };
}

function compareClaimCandidates(a, b) {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.nextRunAt !== b.nextRunAt) return a.nextRunAt - b.nextRunAt;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function applyReclaimToRecord(record, now, reasonCode = 'LEASE_EXPIRED') {
    const exhausted = record.attemptCount >= record.maxAttempts;
    if (exhausted) {
        return {
            transition: 'failed',
            record: {
                ...record,
                status: TASK_STATUS.FAILED,
                ownerId: null,
                leaseId: null,
                leaseExpiresAt: null,
                lockProtected: false,
                failedAt: now,
                updatedAt: now,
                lastError: {
                    code: `${reasonCode}_MAX_ATTEMPTS`,
                    message: `Task exceeded maxAttempts (${record.maxAttempts}) after lease expiration`,
                    name: 'TaskQueueError',
                    at: now,
                },
            },
        };
    }

    return {
        transition: 'pending',
        record: {
            ...record,
            status: TASK_STATUS.PENDING,
            ownerId: null,
            leaseId: null,
            leaseExpiresAt: null,
            lockProtected: false,
            nextRunAt: now,
            updatedAt: now,
            lastError: {
                code: reasonCode,
                message: 'Previous worker lease expired or orphaned; reclaimed for retry',
                name: 'TaskQueueError',
                at: now,
            },
        },
    };
}

/**
 * DurableTaskQueue 標準錯誤類別
 */
export class TaskQueueError extends Error {
    /**
     * @param {string} code 錯誤代碼（見 TASK_QUEUE_ERROR_CODES）
     * @param {string} message 錯誤訊息
     * @param {{ data?: any, cause?: unknown }} [options]
     */
    constructor(code, message, options = {}) {
        super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = 'TaskQueueError';
        this.code = isNonEmptyString(code) ? code : TASK_QUEUE_ERROR_CODES.STORAGE_ERROR;
        if (options?.data !== undefined) {
            this.data = options.data;
        }
    }
}

/**
 * 建立純記憶體原子任務儲存配接器（供單元測試與多實例共用模擬）。
 * 同一個 storage 實例可注入多個 DurableTaskQueue 模擬共享 IndexedDB。
 * 匯入與建立時零副作用。
 * @returns {object}
 */
export function createMemoryTaskStorage() {
    /** @type {Map<string, any>} */
    const records = new Map();
    /** @type {Map<string, string>} */
    const idempotencyIndex = new Map();

    const putRecord = (next) => {
        const stored = toStoredRecord(next);
        records.set(stored.id, stored);
        if (stored.idempotencyCompositeKey) {
            idempotencyIndex.set(stored.idempotencyCompositeKey, stored.id);
        }
        return cloneTaskRecord(stored);
    };

    const deleteRecord = (id) => {
        const existing = records.get(id);
        if (!existing) return false;
        if (existing.idempotencyCompositeKey) {
            idempotencyIndex.delete(existing.idempotencyCompositeKey);
        }
        records.delete(id);
        return true;
    };

    return {
        kind: 'memory',
        async open() {
            return { opened: true };
        },
        async close() {
            // Memory adapter 不清除共享 Map，由 clearNamespace/dispose 範圍決定
        },
        async enqueueAtomic(record) {
            const composite = buildIdempotencyCompositeKey(record.namespace, record.idempotencyKey);
            if (composite && idempotencyIndex.has(composite)) {
                const existingId = idempotencyIndex.get(composite);
                const existing = records.get(existingId);
                if (existing) {
                    return { deduplicated: true, task: cloneTaskRecord(existing) };
                }
                idempotencyIndex.delete(composite);
            }
            const saved = putRecord(record);
            return { deduplicated: false, task: saved };
        },
        async claimAtomic({ namespace, ownerId, leaseId, now, leaseMs, acceptedHandlers }) {
            const reclaimed = [];
            const mismatches = [];
            const candidates = [];

            for (const rec of records.values()) {
                if (rec.namespace !== namespace) continue;
                if (rec.status === TASK_STATUS.RUNNING && rec.leaseExpiresAt !== null && rec.leaseExpiresAt <= now) {
                    const outcome = applyReclaimToRecord(rec, now, 'LEASE_EXPIRED');
                    const updated = putRecord(outcome.record);
                    reclaimed.push({ transition: outcome.transition, task: updated });
                }
            }

            for (const rec of records.values()) {
                if (rec.namespace !== namespace) continue;
                if (rec.status !== TASK_STATUS.PENDING) continue;
                if (rec.nextRunAt > now) continue;
                if (rec.schemaVersion !== TASK_SCHEMA_VERSION) {
                    mismatches.push({
                        taskId: rec.id,
                        type: rec.type,
                        reason: 'SCHEMA_VERSION_MISMATCH',
                        expectedVersion: TASK_SCHEMA_VERSION,
                        actualVersion: rec.schemaVersion,
                    });
                    continue;
                }
                if (!Object.hasOwn(acceptedHandlers, rec.type)) continue;
                const localVersion = acceptedHandlers[rec.type];
                if (rec.handlerVersion !== localVersion) {
                    mismatches.push({
                        taskId: rec.id,
                        type: rec.type,
                        reason: TASK_QUEUE_ERROR_CODES.HANDLER_VERSION_MISMATCH,
                        expectedVersion: localVersion,
                        actualVersion: rec.handlerVersion,
                    });
                    continue;
                }
                candidates.push(rec);
            }

            if (candidates.length === 0) {
                return { claimed: null, reclaimed, mismatches };
            }

            candidates.sort(compareClaimCandidates);
            const target = candidates[0];
            const updated = putRecord({
                ...target,
                status: TASK_STATUS.RUNNING,
                ownerId,
                leaseId,
                leaseExpiresAt: now + leaseMs,
                lockProtected: false,
                lockName: buildTaskLockName(namespace, target.id),
                attemptCount: target.attemptCount + 1,
                startedAt: target.startedAt ?? now,
                updatedAt: now,
            });
            return { claimed: updated, reclaimed, mismatches };
        },
        async markLockProtectedAtomic({ namespace, id, ownerId, leaseId, lockName, now }) {
            const existing = records.get(id);
            if (
                !existing ||
                existing.namespace !== namespace ||
                existing.status !== TASK_STATUS.RUNNING ||
                existing.ownerId !== ownerId ||
                existing.leaseId !== leaseId
            ) {
                return { updated: false, reason: TASK_QUEUE_ERROR_CODES.LEASE_LOST };
            }
            const updated = putRecord({
                ...existing,
                lockProtected: true,
                lockName: lockName ?? existing.lockName,
                updatedAt: now,
            });
            return { updated: true, task: updated };
        },
        async renewLeaseAtomic({ namespace, id, ownerId, leaseId, now, leaseMs }) {
            const existing = records.get(id);
            if (
                !existing ||
                existing.namespace !== namespace ||
                existing.status !== TASK_STATUS.RUNNING ||
                existing.ownerId !== ownerId ||
                existing.leaseId !== leaseId
            ) {
                return { renewed: false, reason: TASK_QUEUE_ERROR_CODES.LEASE_LOST, task: cloneTaskRecord(existing) };
            }
            const updated = putRecord({
                ...existing,
                leaseExpiresAt: now + leaseMs,
                updatedAt: now,
            });
            return { renewed: true, task: updated };
        },
        async completeAtomic({ namespace, id, ownerId, leaseId, result, now }) {
            const existing = records.get(id);
            if (!existing || existing.namespace !== namespace) {
                return { updated: false, reason: TASK_QUEUE_ERROR_CODES.TASK_NOT_FOUND, task: null };
            }
            if (
                existing.status !== TASK_STATUS.RUNNING ||
                existing.ownerId !== ownerId ||
                existing.leaseId !== leaseId
            ) {
                return { updated: false, reason: TASK_QUEUE_ERROR_CODES.LEASE_LOST, task: cloneTaskRecord(existing) };
            }
            const updated = putRecord({
                ...existing,
                status: TASK_STATUS.COMPLETED,
                ownerId: null,
                leaseId: null,
                leaseExpiresAt: null,
                lockProtected: false,
                completedAt: now,
                updatedAt: now,
                result: result !== undefined ? cloneStructuredValue(result, 'result') : undefined,
                lastError: null,
            });
            return { updated: true, task: updated };
        },
        async failAtomic({ namespace, id, ownerId, leaseId, error, now, nextRunAt }) {
            const existing = records.get(id);
            if (!existing || existing.namespace !== namespace) {
                return { updated: false, reason: TASK_QUEUE_ERROR_CODES.TASK_NOT_FOUND, task: null };
            }
            if (
                existing.status !== TASK_STATUS.RUNNING ||
                existing.ownerId !== ownerId ||
                existing.leaseId !== leaseId
            ) {
                return { updated: false, reason: TASK_QUEUE_ERROR_CODES.LEASE_LOST, task: cloneTaskRecord(existing) };
            }
            const errRecord = serializeTaskError(error, now);
            const exhausted = existing.attemptCount >= existing.maxAttempts;
            const updated = putRecord({
                ...existing,
                status: exhausted ? TASK_STATUS.FAILED : TASK_STATUS.PENDING,
                ownerId: null,
                leaseId: null,
                leaseExpiresAt: null,
                lockProtected: false,
                nextRunAt: exhausted ? existing.nextRunAt : nextRunAt,
                failedAt: exhausted ? now : null,
                updatedAt: now,
                lastError: errRecord,
            });
            return { updated: true, exhausted, task: updated };
        },
        async reclaimExpiredAtomic({ namespace, now }) {
            const reclaimed = [];
            const lockCandidates = [];
            for (const rec of records.values()) {
                if (rec.namespace !== namespace || rec.status !== TASK_STATUS.RUNNING) continue;
                if (rec.leaseExpiresAt !== null && rec.leaseExpiresAt <= now) {
                    const outcome = applyReclaimToRecord(rec, now, 'LEASE_EXPIRED');
                    const updated = putRecord(outcome.record);
                    reclaimed.push({ transition: outcome.transition, task: updated });
                } else if (rec.lockProtected && isNonEmptyString(rec.lockName)) {
                    lockCandidates.push({
                        id: rec.id,
                        ownerId: rec.ownerId,
                        leaseId: rec.leaseId,
                        lockName: rec.lockName,
                    });
                }
            }
            return { reclaimed, lockCandidates };
        },
        async reclaimOrphanAtomic({ namespace, id, expectedLeaseId, now }) {
            const existing = records.get(id);
            if (
                !existing ||
                existing.namespace !== namespace ||
                existing.status !== TASK_STATUS.RUNNING ||
                existing.leaseId !== expectedLeaseId ||
                !existing.lockProtected
            ) {
                return { reclaimed: false, task: cloneTaskRecord(existing) };
            }
            const outcome = applyReclaimToRecord(existing, now, 'LEASE_ORPHANED');
            const updated = putRecord(outcome.record);
            return { reclaimed: true, transition: outcome.transition, task: updated };
        },
        async cancelAtomic({ namespace, id, now }) {
            const existing = records.get(id);
            if (!existing || existing.namespace !== namespace) {
                return { cancelled: false, reason: TASK_QUEUE_ERROR_CODES.TASK_NOT_FOUND, task: null };
            }
            if (TERMINAL_STATUSES.has(existing.status)) {
                return {
                    cancelled: false,
                    alreadyTerminal: true,
                    reason: existing.status === TASK_STATUS.CANCELLED ? 'ALREADY_CANCELLED' : 'ALREADY_TERMINAL',
                    task: cloneTaskRecord(existing),
                };
            }
            const updated = putRecord({
                ...existing,
                status: TASK_STATUS.CANCELLED,
                ownerId: null,
                leaseId: null,
                leaseExpiresAt: null,
                lockProtected: false,
                cancelledAt: now,
                updatedAt: now,
            });
            return { cancelled: true, task: updated };
        },
        async retryAtomic({ namespace, id, now, maxAttempts }) {
            const existing = records.get(id);
            if (!existing || existing.namespace !== namespace) {
                return { retried: false, reason: TASK_QUEUE_ERROR_CODES.TASK_NOT_FOUND, task: null };
            }
            if (existing.status !== TASK_STATUS.FAILED && existing.status !== TASK_STATUS.CANCELLED) {
                return { retried: false, reason: TASK_QUEUE_ERROR_CODES.INVALID_STATE, task: cloneTaskRecord(existing) };
            }
            const updated = putRecord({
                ...existing,
                status: TASK_STATUS.PENDING,
                attemptCount: 0,
                maxAttempts: maxAttempts ?? existing.maxAttempts,
                ownerId: null,
                leaseId: null,
                leaseExpiresAt: null,
                lockProtected: false,
                nextRunAt: now,
                failedAt: null,
                cancelledAt: null,
                lastError: null,
                updatedAt: now,
            });
            return { retried: true, task: updated };
        },
        async getTask({ namespace, id }) {
            const existing = records.get(id);
            if (!existing || existing.namespace !== namespace) return null;
            return cloneTaskRecord(existing);
        },
        async listTasks({ namespace, status, type, limit } = {}) {
            const out = [];
            for (const rec of records.values()) {
                if (rec.namespace !== namespace) continue;
                if (status && rec.status !== status) continue;
                if (type && rec.type !== type) continue;
                out.push(cloneTaskRecord(rec));
            }
            out.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
            return isPositiveInteger(limit) ? out.slice(0, limit) : out;
        },
        async getStats({ namespace }) {
            const counts = {
                pending: 0,
                running: 0,
                completed: 0,
                failed: 0,
                cancelled: 0,
                total: 0,
            };
            for (const rec of records.values()) {
                if (rec.namespace !== namespace) continue;
                counts.total++;
                if (Object.hasOwn(counts, rec.status)) {
                    counts[rec.status]++;
                }
            }
            return counts;
        },
        async purge({ namespace, cutoffAt, statuses }) {
            const allowed = new Set(statuses);
            const purgedIds = [];
            for (const rec of [...records.values()]) {
                if (rec.namespace !== namespace || !allowed.has(rec.status)) continue;
                const terminalAt = rec.completedAt ?? rec.failedAt ?? rec.cancelledAt ?? rec.updatedAt;
                if (terminalAt <= cutoffAt) {
                    deleteRecord(rec.id);
                    purgedIds.push(rec.id);
                }
            }
            return { purgedCount: purgedIds.length, taskIds: purgedIds };
        },
        async clearNamespace({ namespace }) {
            let clearedCount = 0;
            for (const rec of [...records.values()]) {
                if (rec.namespace === namespace) {
                    deleteRecord(rec.id);
                    clearedCount++;
                }
            }
            return { clearedCount };
        },
    };
}

/**
 * 建立 IndexedDB 持久化原子任務儲存配接器。
 * 僅在實際執行操作／`open()` 時開啟 IndexedDB，匯入與建立時零副作用。
 * @param {object} [options]
 * @param {string} [options.dbName]
 * @param {string} [options.storeName]
 * @param {IDBFactory} [options.indexedDB]
 * @returns {object}
 */
export function createIndexedDBTaskStorage(options = {}) {
    if (options !== undefined && !isPlainObject(options)) {
        throw new TypeError('createIndexedDBTaskStorage options must be a plain object');
    }
    const dbName = options?.dbName ?? DEFAULT_TASK_DB_NAME;
    const storeName = options?.storeName ?? DEFAULT_TASK_STORE_NAME;
    if (!isNonEmptyString(dbName)) {
        throw new TypeError('dbName must be a non-empty string');
    }
    if (!isNonEmptyString(storeName)) {
        throw new TypeError('storeName must be a non-empty string');
    }

    const resolveFactory = () => {
        if (options?.indexedDB !== undefined) return options.indexedDB;
        try {
            if (typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null) {
                return globalThis.indexedDB;
            }
        } catch {
            return null;
        }
        return null;
    };

    let db = null;
    let openPromise = null;

    const close = async () => {
        const pending = openPromise;
        openPromise = null;
        if (db) {
            try {
                db.close();
            } catch {
                // ignore
            }
            db = null;
            return;
        }
        if (pending) {
            try {
                const opened = await pending;
                try {
                    opened?.close?.();
                } finally {
                    if (db === opened) {
                        db = null;
                    }
                }
            } catch {
                // ignore
            }
        }
    };

    const ensureOpen = () => {
        if (db) return Promise.resolve(db);
        if (openPromise) return openPromise;

        const factory = resolveFactory();
        if (!factory || typeof factory.open !== 'function') {
            return Promise.reject(
                new TaskQueueError(
                    TASK_QUEUE_ERROR_CODES.UNSUPPORTED_ENVIRONMENT,
                    'IndexedDB is not available in this environment'
                )
            );
        }

        openPromise = new Promise((resolve, reject) => {
            let req;
            try {
                req = factory.open(dbName, TASK_SCHEMA_VERSION);
            } catch (err) {
                openPromise = null;
                reject(new TaskQueueError(TASK_QUEUE_ERROR_CODES.STORAGE_ERROR, `Failed to open IndexedDB: ${err?.message || err}`, { cause: err }));
                return;
            }

            req.onupgradeneeded = (event) => {
                const database = event.target.result;
                let store;
                if (!database.objectStoreNames.contains(storeName)) {
                    store = database.createObjectStore(storeName, { keyPath: 'id' });
                } else {
                    store = event.target.transaction.objectStore(storeName);
                }
                if (!store.indexNames.contains('by_namespace')) {
                    store.createIndex('by_namespace', 'namespace', { unique: false });
                }
                if (!store.indexNames.contains('by_namespace_status')) {
                    store.createIndex('by_namespace_status', ['namespace', 'status'], { unique: false });
                }
                if (!store.indexNames.contains('by_idempotency')) {
                    store.createIndex('by_idempotency', 'idempotencyCompositeKey', { unique: true });
                }
            };

            req.onblocked = () => {
                // 不阻塞 reject，等待現有連線完成版本升級
            };

            req.onsuccess = (event) => {
                db = event.target.result;
                db.onversionchange = () => {
                    try {
                        db?.close();
                    } catch {
                        // ignore
                    }
                    db = null;
                    openPromise = null;
                };
                db.onclose = () => {
                    db = null;
                    openPromise = null;
                };
                openPromise = null;
                resolve(db);
            };

            req.onerror = (event) => {
                openPromise = null;
                reject(
                    new TaskQueueError(
                        TASK_QUEUE_ERROR_CODES.STORAGE_ERROR,
                        `IndexedDB open failed: ${event?.target?.error?.message || 'unknown error'}`,
                        { cause: event?.target?.error }
                    )
                );
            };
        });

        return openPromise;
    };

    /**
     * 在單一同步連鎖的 IndexedDB transaction 內執行操作，並於 tx.oncomplete 才 resolve。
     * 注意：executor 內嚴禁 await 任何外部 Promise。
     * @template T
     * @param {'readonly' | 'readwrite'} mode
     * @param {(store: IDBObjectStore, setResult: (val: T) => void) => void} executor
     * @returns {Promise<T>}
     */
    const runTx = async (mode, executor) => {
        const database = await ensureOpen();
        return new Promise((resolve, reject) => {
            let tx;
            try {
                tx = database.transaction(storeName, mode);
            } catch (err) {
                reject(new TaskQueueError(TASK_QUEUE_ERROR_CODES.STORAGE_ERROR, `IndexedDB transaction creation failed: ${err?.message || err}`, { cause: err }));
                return;
            }
            const store = tx.objectStore(storeName);
            let result;
            let settled = false;

            const fail = (err) => {
                if (settled) return;
                settled = true;
                try {
                    tx.abort();
                } catch {
                    // ignore
                }
                if (err instanceof TaskQueueError) {
                    reject(err);
                } else {
                    reject(
                        new TaskQueueError(
                            TASK_QUEUE_ERROR_CODES.STORAGE_ERROR,
                            `IndexedDB transaction error: ${err?.message || err}`,
                            { cause: err }
                        )
                    );
                }
            };

            tx.oncomplete = () => {
                if (!settled) {
                    settled = true;
                    resolve(result);
                }
            };
            tx.onabort = () => {
                if (!settled) {
                    settled = true;
                    reject(
                        new TaskQueueError(
                            TASK_QUEUE_ERROR_CODES.STORAGE_ERROR,
                            `IndexedDB transaction aborted: ${tx.error?.message || 'aborted'}`,
                            { cause: tx.error }
                        )
                    );
                }
            };
            tx.onerror = () => {
                if (!settled) {
                    settled = true;
                    reject(
                        new TaskQueueError(
                            TASK_QUEUE_ERROR_CODES.STORAGE_ERROR,
                            `IndexedDB transaction failed: ${tx.error?.message || 'error'}`,
                            { cause: tx.error }
                        )
                    );
                }
            };

            try {
                executor(store, (val) => {
                    result = val;
                }, fail);
            } catch (err) {
                fail(err);
            }
        });
    };

    const scanIndexCursor = (index, keyRange, onItem, onDone, onError) => {
        const req = index.openCursor(keyRange);
        req.onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) {
                onDone();
                return;
            }
            try {
                onItem(cursor, () => cursor.continue());
            } catch (err) {
                onError(err);
            }
        };
        req.onerror = (event) => onError(event?.target?.error || new Error('Cursor failed'));
    };

    return {
        kind: 'indexeddb',
        async open() {
            await ensureOpen();
            return { opened: true };
        },
        close,
        enqueueAtomic(record) {
            return runTx('readwrite', (store, setResult, fail) => {
                const stored = toStoredRecord(record);
                const doInsert = () => {
                    const addReq = store.add(stored);
                    addReq.onsuccess = () => {
                        setResult({ deduplicated: false, task: cloneTaskRecord(stored) });
                    };
                    addReq.onerror = (event) => fail(event?.target?.error);
                };

                if (stored.idempotencyCompositeKey) {
                    const idx = store.index('by_idempotency');
                    const getReq = idx.get(stored.idempotencyCompositeKey);
                    getReq.onsuccess = (event) => {
                        const existing = event.target.result;
                        if (existing) {
                            setResult({ deduplicated: true, task: cloneTaskRecord(existing) });
                            return;
                        }
                        doInsert();
                    };
                    getReq.onerror = (event) => fail(event?.target?.error);
                } else {
                    doInsert();
                }
            });
        },
        claimAtomic({ namespace, ownerId, leaseId, now, leaseMs, acceptedHandlers }) {
            return runTx('readwrite', (store, setResult, fail) => {
                const statusIndex = store.index('by_namespace_status');
                const reclaimed = [];
                const mismatches = [];
                const candidates = [];

                const scanPending = () => {
                    scanIndexCursor(
                        statusIndex,
                        globalThis.IDBKeyRange.only([namespace, TASK_STATUS.PENDING]),
                        (cursor, next) => {
                            const rec = cursor.value;
                            if (rec.nextRunAt <= now) {
                                if (rec.schemaVersion !== TASK_SCHEMA_VERSION) {
                                    mismatches.push({
                                        taskId: rec.id,
                                        type: rec.type,
                                        reason: 'SCHEMA_VERSION_MISMATCH',
                                        expectedVersion: TASK_SCHEMA_VERSION,
                                        actualVersion: rec.schemaVersion,
                                    });
                                } else if (Object.hasOwn(acceptedHandlers, rec.type)) {
                                    const localVersion = acceptedHandlers[rec.type];
                                    if (rec.handlerVersion !== localVersion) {
                                        mismatches.push({
                                            taskId: rec.id,
                                            type: rec.type,
                                            reason: TASK_QUEUE_ERROR_CODES.HANDLER_VERSION_MISMATCH,
                                            expectedVersion: localVersion,
                                            actualVersion: rec.handlerVersion,
                                        });
                                    } else {
                                        candidates.push(rec);
                                    }
                                }
                            }
                            next();
                        },
                        () => {
                            if (candidates.length === 0) {
                                setResult({ claimed: null, reclaimed, mismatches });
                                return;
                            }
                            candidates.sort(compareClaimCandidates);
                            const winner = candidates[0];
                            const updated = {
                                ...winner,
                                status: TASK_STATUS.RUNNING,
                                ownerId,
                                leaseId,
                                leaseExpiresAt: now + leaseMs,
                                lockProtected: false,
                                lockName: buildTaskLockName(namespace, winner.id),
                                attemptCount: winner.attemptCount + 1,
                                startedAt: winner.startedAt ?? now,
                                updatedAt: now,
                            };
                            const stored = toStoredRecord(updated);
                            const putReq = store.put(stored);
                            putReq.onsuccess = () => {
                                setResult({ claimed: cloneTaskRecord(stored), reclaimed, mismatches });
                            };
                            putReq.onerror = (event) => fail(event?.target?.error);
                        },
                        fail
                    );
                };

                // 先同一個 readwrite transaction 回收已逾時 running 任務
                scanIndexCursor(
                    statusIndex,
                    globalThis.IDBKeyRange.only([namespace, TASK_STATUS.RUNNING]),
                    (cursor, next) => {
                        const rec = cursor.value;
                        if (rec.leaseExpiresAt !== null && rec.leaseExpiresAt <= now) {
                            const outcome = applyReclaimToRecord(rec, now, 'LEASE_EXPIRED');
                            const stored = toStoredRecord(outcome.record);
                            const updReq = cursor.update(stored);
                            updReq.onsuccess = () => {
                                reclaimed.push({ transition: outcome.transition, task: cloneTaskRecord(stored) });
                                next();
                            };
                            updReq.onerror = (event) => fail(event?.target?.error);
                            return;
                        }
                        next();
                    },
                    scanPending,
                    fail
                );
            });
        },
        markLockProtectedAtomic({ namespace, id, ownerId, leaseId, lockName, now }) {
            return runTx('readwrite', (store, setResult, fail) => {
                const getReq = store.get(id);
                getReq.onsuccess = (event) => {
                    const existing = event.target.result;
                    if (
                        !existing ||
                        existing.namespace !== namespace ||
                        existing.status !== TASK_STATUS.RUNNING ||
                        existing.ownerId !== ownerId ||
                        existing.leaseId !== leaseId
                    ) {
                        setResult({ updated: false, reason: TASK_QUEUE_ERROR_CODES.LEASE_LOST });
                        return;
                    }
                    const stored = toStoredRecord({
                        ...existing,
                        lockProtected: true,
                        lockName: lockName ?? existing.lockName,
                        updatedAt: now,
                    });
                    const putReq = store.put(stored);
                    putReq.onsuccess = () => setResult({ updated: true, task: cloneTaskRecord(stored) });
                    putReq.onerror = (ev) => fail(ev?.target?.error);
                };
                getReq.onerror = (event) => fail(event?.target?.error);
            });
        },
        renewLeaseAtomic({ namespace, id, ownerId, leaseId, now, leaseMs }) {
            return runTx('readwrite', (store, setResult, fail) => {
                const getReq = store.get(id);
                getReq.onsuccess = (event) => {
                    const existing = event.target.result;
                    if (
                        !existing ||
                        existing.namespace !== namespace ||
                        existing.status !== TASK_STATUS.RUNNING ||
                        existing.ownerId !== ownerId ||
                        existing.leaseId !== leaseId
                    ) {
                        setResult({ renewed: false, reason: TASK_QUEUE_ERROR_CODES.LEASE_LOST, task: cloneTaskRecord(existing) });
                        return;
                    }
                    const stored = toStoredRecord({
                        ...existing,
                        leaseExpiresAt: now + leaseMs,
                        updatedAt: now,
                    });
                    const putReq = store.put(stored);
                    putReq.onsuccess = () => setResult({ renewed: true, task: cloneTaskRecord(stored) });
                    putReq.onerror = (ev) => fail(ev?.target?.error);
                };
                getReq.onerror = (event) => fail(event?.target?.error);
            });
        },
        completeAtomic({ namespace, id, ownerId, leaseId, result, now }) {
            return runTx('readwrite', (store, setResult, fail) => {
                const safeResult = result !== undefined ? cloneStructuredValue(result, 'result') : undefined;
                const getReq = store.get(id);
                getReq.onsuccess = (event) => {
                    const existing = event.target.result;
                    if (!existing || existing.namespace !== namespace) {
                        setResult({ updated: false, reason: TASK_QUEUE_ERROR_CODES.TASK_NOT_FOUND, task: null });
                        return;
                    }
                    if (
                        existing.status !== TASK_STATUS.RUNNING ||
                        existing.ownerId !== ownerId ||
                        existing.leaseId !== leaseId
                    ) {
                        setResult({ updated: false, reason: TASK_QUEUE_ERROR_CODES.LEASE_LOST, task: cloneTaskRecord(existing) });
                        return;
                    }
                    const stored = toStoredRecord({
                        ...existing,
                        status: TASK_STATUS.COMPLETED,
                        ownerId: null,
                        leaseId: null,
                        leaseExpiresAt: null,
                        lockProtected: false,
                        completedAt: now,
                        updatedAt: now,
                        result: safeResult,
                        lastError: null,
                    });
                    const putReq = store.put(stored);
                    putReq.onsuccess = () => setResult({ updated: true, task: cloneTaskRecord(stored) });
                    putReq.onerror = (ev) => fail(ev?.target?.error);
                };
                getReq.onerror = (event) => fail(event?.target?.error);
            });
        },
        failAtomic({ namespace, id, ownerId, leaseId, error, now, nextRunAt }) {
            return runTx('readwrite', (store, setResult, fail) => {
                const errRecord = serializeTaskError(error, now);
                const getReq = store.get(id);
                getReq.onsuccess = (event) => {
                    const existing = event.target.result;
                    if (!existing || existing.namespace !== namespace) {
                        setResult({ updated: false, reason: TASK_QUEUE_ERROR_CODES.TASK_NOT_FOUND, task: null });
                        return;
                    }
                    if (
                        existing.status !== TASK_STATUS.RUNNING ||
                        existing.ownerId !== ownerId ||
                        existing.leaseId !== leaseId
                    ) {
                        setResult({ updated: false, reason: TASK_QUEUE_ERROR_CODES.LEASE_LOST, task: cloneTaskRecord(existing) });
                        return;
                    }
                    const exhausted = existing.attemptCount >= existing.maxAttempts;
                    const stored = toStoredRecord({
                        ...existing,
                        status: exhausted ? TASK_STATUS.FAILED : TASK_STATUS.PENDING,
                        ownerId: null,
                        leaseId: null,
                        leaseExpiresAt: null,
                        lockProtected: false,
                        nextRunAt: exhausted ? existing.nextRunAt : nextRunAt,
                        failedAt: exhausted ? now : null,
                        updatedAt: now,
                        lastError: errRecord,
                    });
                    const putReq = store.put(stored);
                    putReq.onsuccess = () => setResult({ updated: true, exhausted, task: cloneTaskRecord(stored) });
                    putReq.onerror = (ev) => fail(ev?.target?.error);
                };
                getReq.onerror = (event) => fail(event?.target?.error);
            });
        },
        reclaimExpiredAtomic({ namespace, now }) {
            return runTx('readwrite', (store, setResult, fail) => {
                const statusIndex = store.index('by_namespace_status');
                const reclaimed = [];
                const lockCandidates = [];
                scanIndexCursor(
                    statusIndex,
                    globalThis.IDBKeyRange.only([namespace, TASK_STATUS.RUNNING]),
                    (cursor, next) => {
                        const rec = cursor.value;
                        if (rec.leaseExpiresAt !== null && rec.leaseExpiresAt <= now) {
                            const outcome = applyReclaimToRecord(rec, now, 'LEASE_EXPIRED');
                            const stored = toStoredRecord(outcome.record);
                            const updReq = cursor.update(stored);
                            updReq.onsuccess = () => {
                                reclaimed.push({ transition: outcome.transition, task: cloneTaskRecord(stored) });
                                next();
                            };
                            updReq.onerror = (ev) => fail(ev?.target?.error);
                            return;
                        }
                        if (rec.lockProtected && isNonEmptyString(rec.lockName)) {
                            lockCandidates.push({
                                id: rec.id,
                                ownerId: rec.ownerId,
                                leaseId: rec.leaseId,
                                lockName: rec.lockName,
                            });
                        }
                        next();
                    },
                    () => setResult({ reclaimed, lockCandidates }),
                    fail
                );
            });
        },
        reclaimOrphanAtomic({ namespace, id, expectedLeaseId, now }) {
            return runTx('readwrite', (store, setResult, fail) => {
                const getReq = store.get(id);
                getReq.onsuccess = (event) => {
                    const existing = event.target.result;
                    if (
                        !existing ||
                        existing.namespace !== namespace ||
                        existing.status !== TASK_STATUS.RUNNING ||
                        existing.leaseId !== expectedLeaseId ||
                        !existing.lockProtected
                    ) {
                        setResult({ reclaimed: false, task: cloneTaskRecord(existing) });
                        return;
                    }
                    const outcome = applyReclaimToRecord(existing, now, 'LEASE_ORPHANED');
                    const stored = toStoredRecord(outcome.record);
                    const putReq = store.put(stored);
                    putReq.onsuccess = () => setResult({ reclaimed: true, transition: outcome.transition, task: cloneTaskRecord(stored) });
                    putReq.onerror = (ev) => fail(ev?.target?.error);
                };
                getReq.onerror = (event) => fail(event?.target?.error);
            });
        },
        cancelAtomic({ namespace, id, now }) {
            return runTx('readwrite', (store, setResult, fail) => {
                const getReq = store.get(id);
                getReq.onsuccess = (event) => {
                    const existing = event.target.result;
                    if (!existing || existing.namespace !== namespace) {
                        setResult({ cancelled: false, reason: TASK_QUEUE_ERROR_CODES.TASK_NOT_FOUND, task: null });
                        return;
                    }
                    if (TERMINAL_STATUSES.has(existing.status)) {
                        setResult({
                            cancelled: false,
                            alreadyTerminal: true,
                            reason: existing.status === TASK_STATUS.CANCELLED ? 'ALREADY_CANCELLED' : 'ALREADY_TERMINAL',
                            task: cloneTaskRecord(existing),
                        });
                        return;
                    }
                    const stored = toStoredRecord({
                        ...existing,
                        status: TASK_STATUS.CANCELLED,
                        ownerId: null,
                        leaseId: null,
                        leaseExpiresAt: null,
                        lockProtected: false,
                        cancelledAt: now,
                        updatedAt: now,
                    });
                    const putReq = store.put(stored);
                    putReq.onsuccess = () => setResult({ cancelled: true, task: cloneTaskRecord(stored) });
                    putReq.onerror = (ev) => fail(ev?.target?.error);
                };
                getReq.onerror = (event) => fail(event?.target?.error);
            });
        },
        retryAtomic({ namespace, id, now, maxAttempts }) {
            return runTx('readwrite', (store, setResult, fail) => {
                const getReq = store.get(id);
                getReq.onsuccess = (event) => {
                    const existing = event.target.result;
                    if (!existing || existing.namespace !== namespace) {
                        setResult({ retried: false, reason: TASK_QUEUE_ERROR_CODES.TASK_NOT_FOUND, task: null });
                        return;
                    }
                    if (existing.status !== TASK_STATUS.FAILED && existing.status !== TASK_STATUS.CANCELLED) {
                        setResult({ retried: false, reason: TASK_QUEUE_ERROR_CODES.INVALID_STATE, task: cloneTaskRecord(existing) });
                        return;
                    }
                    const stored = toStoredRecord({
                        ...existing,
                        status: TASK_STATUS.PENDING,
                        attemptCount: 0,
                        maxAttempts: maxAttempts ?? existing.maxAttempts,
                        ownerId: null,
                        leaseId: null,
                        leaseExpiresAt: null,
                        lockProtected: false,
                        nextRunAt: now,
                        failedAt: null,
                        cancelledAt: null,
                        lastError: null,
                        updatedAt: now,
                    });
                    const putReq = store.put(stored);
                    putReq.onsuccess = () => setResult({ retried: true, task: cloneTaskRecord(stored) });
                    putReq.onerror = (ev) => fail(ev?.target?.error);
                };
                getReq.onerror = (event) => fail(event?.target?.error);
            });
        },
        getTask({ namespace, id }) {
            return runTx('readonly', (store, setResult, fail) => {
                const req = store.get(id);
                req.onsuccess = (event) => {
                    const rec = event.target.result;
                    setResult(rec && rec.namespace === namespace ? cloneTaskRecord(rec) : null);
                };
                req.onerror = (ev) => fail(ev?.target?.error);
            });
        },
        listTasks({ namespace, status, type, limit } = {}) {
            return runTx('readonly', (store, setResult, fail) => {
                const out = [];
                const index = status ? store.index('by_namespace_status') : store.index('by_namespace');
                const range = status
                    ? globalThis.IDBKeyRange.only([namespace, status])
                    : globalThis.IDBKeyRange.only(namespace);
                scanIndexCursor(
                    index,
                    range,
                    (cursor, next) => {
                        const rec = cursor.value;
                        if (!type || rec.type === type) {
                            out.push(cloneTaskRecord(rec));
                        }
                        next();
                    },
                    () => {
                        out.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
                        setResult(isPositiveInteger(limit) ? out.slice(0, limit) : out);
                    },
                    fail
                );
            });
        },
        getStats({ namespace }) {
            return runTx('readonly', (store, setResult, fail) => {
                const counts = {
                    pending: 0,
                    running: 0,
                    completed: 0,
                    failed: 0,
                    cancelled: 0,
                    total: 0,
                };
                scanIndexCursor(
                    store.index('by_namespace'),
                    globalThis.IDBKeyRange.only(namespace),
                    (cursor, next) => {
                        const rec = cursor.value;
                        counts.total++;
                        if (Object.hasOwn(counts, rec.status)) {
                            counts[rec.status]++;
                        }
                        next();
                    },
                    () => setResult(counts),
                    fail
                );
            });
        },
        purge({ namespace, cutoffAt, statuses }) {
            const allowed = new Set(statuses);
            return runTx('readwrite', (store, setResult, fail) => {
                const taskIds = [];
                scanIndexCursor(
                    store.index('by_namespace'),
                    globalThis.IDBKeyRange.only(namespace),
                    (cursor, next) => {
                        const rec = cursor.value;
                        if (allowed.has(rec.status)) {
                            const terminalAt = rec.completedAt ?? rec.failedAt ?? rec.cancelledAt ?? rec.updatedAt;
                            if (terminalAt <= cutoffAt) {
                                const delReq = cursor.delete();
                                delReq.onsuccess = () => {
                                    taskIds.push(rec.id);
                                    next();
                                };
                                delReq.onerror = (ev) => fail(ev?.target?.error);
                                return;
                            }
                        }
                        next();
                    },
                    () => setResult({ purgedCount: taskIds.length, taskIds }),
                    fail
                );
            });
        },
        clearNamespace({ namespace }) {
            return runTx('readwrite', (store, setResult, fail) => {
                let clearedCount = 0;
                scanIndexCursor(
                    store.index('by_namespace'),
                    globalThis.IDBKeyRange.only(namespace),
                    (cursor, next) => {
                        const delReq = cursor.delete();
                        delReq.onsuccess = () => {
                            clearedCount++;
                            next();
                        };
                        delReq.onerror = (ev) => fail(ev?.target?.error);
                    },
                    () => setResult({ clearedCount }),
                    fail
                );
            });
        },
    };
}

/**
 * DurableTaskQueue - 基於 IndexedDB 單一 transaction 原子認領與租約防護的跨分頁持久化工作佇列。
 *
 * 語義保證：
 * - 完全 opt-in，匯入或建構實例絕不開啟 IndexedDB、不建立通道、不請求 Web Locks。
 * - 提供 **at-least-once** 投遞語義，搭配每一個 `(namespace, idempotencyKey)` 去重、版本化處理器及 `leaseId` 寫入防護。
 * - **不保證** exactly-once，亦**不保證**在所有瀏覽器分頁／Worker 皆關閉後仍能在背景執行；任務會保留至下一次活躍分頁開啟後復原。
 */
export class DurableTaskQueue extends BaseService {
    /**
     * @param {object} [options]
     * @param {string} [options.namespace] 邏輯命名空間（預設 'default'）
     * @param {string} [options.workerId] Worker 識別碼（預設沿用 bus.tabId 或自動產生）
     * @param {object} [options.storage] 自訂任務儲存配接器（例如 `createMemoryTaskStorage()`）
     * @param {string} [options.dbName] IndexedDB 資料庫名稱
     * @param {string} [options.storeName] IndexedDB ObjectStore 名稱
     * @param {IDBFactory} [options.indexedDB] 自訂 IndexedDB 工廠（測試用）
     * @param {{ request: Function }} [options.locks] 自訂 LockManager（測試用）
     * @param {boolean} [options.useWebLocks] 是否啟用 Web Locks 孤兒偵測快收（預設 true，僅用 `{ ifAvailable: true }`，絕不用 `steal`）
     * @param {import('./message-bus.js').MessageBus | null} [options.bus] 選用 MessageBus，用於低延遲喚醒訊號（dispose 時不代關）
     * @param {number} [options.leaseDurationMs] 租約毫秒數（預設 5000）
     * @param {number} [options.renewIntervalMs] 續約間隔毫秒數（預設 `Math.floor(leaseDurationMs / 3)`，0 表示停用）
     * @param {number} [options.pollIntervalMs] 輪詢間隔毫秒數（預設 1000）
     * @param {number} [options.reclaimIntervalMs] 過期回收檢查間隔毫秒數（預設 2500）
     * @param {number} [options.backoffBaseMs] 失敗重試退避基準毫秒（預設 200）
     * @param {number} [options.backoffMaxMs] 失敗重試退避上限毫秒（預設 30000）
     * @param {number} [options.backoffFactor] 指數退避倍數（預設 2）
     * @param {number} [options.defaultMaxAttempts] 預設最大嘗試次數（預設 3）
     * @param {number} [options.retentionMs] 預設終態任務保留時間毫秒（預設 7 天）
     * @param {() => number} [options.now] 自訂時鐘函式（測試用）
     */
    constructor(options = {}) {
        super();
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('DurableTaskQueue options must be a plain object');
        }
        const opts = options || {};

        let injectedBus = null;
        if (opts.bus !== undefined && opts.bus !== null) {
            const candidate = opts.bus;
            if (
                typeof candidate !== 'object' ||
                typeof candidate.publish !== 'function' ||
                typeof candidate.subscribe !== 'function' ||
                !isNonEmptyString(candidate.tabId)
            ) {
                throw new TypeError('DurableTaskQueue options.bus must be a valid MessageBus-compatible instance');
            }
            if (
                opts.namespace !== undefined &&
                isNonEmptyString(candidate.namespace) &&
                opts.namespace !== candidate.namespace
            ) {
                throw new TypeError('DurableTaskQueue options.namespace does not match injected bus.namespace');
            }
            injectedBus = candidate;
        }

        const namespace = opts.namespace ?? (isNonEmptyString(injectedBus?.namespace) ? injectedBus.namespace : DEFAULT_NAMESPACE);
        if (!isNonEmptyString(namespace)) {
            throw new TypeError('DurableTaskQueue namespace must be a non-empty string');
        }

        const workerId = opts.workerId ?? injectedBus?.tabId ?? generateContextId();
        if (!isNonEmptyString(workerId)) {
            throw new TypeError('DurableTaskQueue workerId must be a non-empty string');
        }

        const leaseDurationMs = opts.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
        if (typeof leaseDurationMs !== 'number' || !Number.isFinite(leaseDurationMs) || leaseDurationMs < 50) {
            throw new TypeError('DurableTaskQueue leaseDurationMs must be a finite number >= 50');
        }

        const renewIntervalMs = opts.renewIntervalMs ?? Math.max(20, Math.floor(leaseDurationMs / 3));
        if (!isNonNegativeFinite(renewIntervalMs) || (renewIntervalMs > 0 && renewIntervalMs >= leaseDurationMs)) {
            throw new TypeError('DurableTaskQueue renewIntervalMs must be 0 or strictly less than leaseDurationMs');
        }

        const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        if (typeof pollIntervalMs !== 'number' || !Number.isFinite(pollIntervalMs) || pollIntervalMs < 10) {
            throw new TypeError('DurableTaskQueue pollIntervalMs must be a finite number >= 10');
        }

        const reclaimIntervalMs = opts.reclaimIntervalMs ?? Math.min(DEFAULT_RECLAIM_INTERVAL_MS, Math.max(50, Math.floor(leaseDurationMs / 2)));
        if (typeof reclaimIntervalMs !== 'number' || !Number.isFinite(reclaimIntervalMs) || reclaimIntervalMs < 10) {
            throw new TypeError('DurableTaskQueue reclaimIntervalMs must be a finite number >= 10');
        }

        const backoffBaseMs = opts.backoffBaseMs ?? 200;
        if (!isNonNegativeFinite(backoffBaseMs)) {
            throw new TypeError('DurableTaskQueue backoffBaseMs must be a non-negative finite number');
        }

        const backoffMaxMs = opts.backoffMaxMs ?? 30000;
        if (!isNonNegativeFinite(backoffMaxMs) || backoffMaxMs < backoffBaseMs) {
            throw new TypeError('DurableTaskQueue backoffMaxMs must be >= backoffBaseMs');
        }

        const backoffFactor = opts.backoffFactor ?? 2;
        if (typeof backoffFactor !== 'number' || !Number.isFinite(backoffFactor) || backoffFactor < 1) {
            throw new TypeError('DurableTaskQueue backoffFactor must be a finite number >= 1');
        }

        const defaultMaxAttempts = opts.defaultMaxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        if (!isPositiveInteger(defaultMaxAttempts)) {
            throw new TypeError('DurableTaskQueue defaultMaxAttempts must be a positive integer');
        }

        const retentionMs = opts.retentionMs ?? DEFAULT_RETENTION_MS;
        if (!isNonNegativeFinite(retentionMs)) {
            throw new TypeError('DurableTaskQueue retentionMs must be a non-negative finite number');
        }

        if (opts.useWebLocks !== undefined && typeof opts.useWebLocks !== 'boolean') {
            throw new TypeError('DurableTaskQueue useWebLocks must be a boolean');
        }

        const nowFn = opts.now ?? (() => Date.now());
        if (typeof nowFn !== 'function') {
            throw new TypeError('DurableTaskQueue now must be a function');
        }

        if (opts.locks !== undefined && opts.locks !== null) {
            if (typeof opts.locks !== 'object' || typeof opts.locks.request !== 'function') {
                throw new TypeError('DurableTaskQueue options.locks must provide a request() method');
            }
            this._locks = opts.locks;
        } else {
            const caps = getCoordinationCapabilities();
            this._locks = caps.webLocks ? globalThis.navigator.locks : null;
        }

        if (opts.storage !== undefined && opts.storage !== null) {
            if (typeof opts.storage !== 'object' || typeof opts.storage.claimAtomic !== 'function') {
                throw new TypeError('DurableTaskQueue options.storage must implement the task storage interface');
            }
            this._storage = opts.storage;
            this._supported = true;
            this._ownsStorageClose = false;
        } else {
            const hasExplicitIdb = opts.indexedDB !== undefined;
            const hasValidInjectedIdb = Boolean(opts.indexedDB && typeof opts.indexedDB.open === 'function');
            const caps = hasExplicitIdb
                ? { indexedDB: hasValidInjectedIdb }
                : getCoordinationCapabilities();
            if (caps.indexedDB) {
                this._storage = createIndexedDBTaskStorage({
                    dbName: opts.dbName,
                    storeName: opts.storeName,
                    indexedDB: opts.indexedDB,
                });
                this._supported = true;
                this._ownsStorageClose = true;
            } else {
                this._storage = null;
                this._supported = false;
                this._ownsStorageClose = false;
            }
        }

        this._namespace = namespace;
        this._workerId = workerId;
        this._bus = injectedBus;
        this._useWebLocks = opts.useWebLocks !== undefined ? opts.useWebLocks : true;
        this._leaseDurationMs = leaseDurationMs;
        this._renewIntervalMs = renewIntervalMs;
        this._pollIntervalMs = pollIntervalMs;
        this._reclaimIntervalMs = reclaimIntervalMs;
        this._backoffBaseMs = backoffBaseMs;
        this._backoffMaxMs = backoffMaxMs;
        this._backoffFactor = backoffFactor;
        this._defaultMaxAttempts = defaultMaxAttempts;
        this._retentionMs = retentionMs;
        this._now = nowFn;

        /** @type {Map<string, { version: number, handler: Function }>} */
        this._handlers = new Map();
        /** @type {Map<string, { controller: AbortController, releaseLock: Function | null, lockDone: Promise<void> | null, leaseId: string }>} */
        this._activeExecutions = new Map();
        /** @type {Set<Promise<any>>} */
        this._inFlightTasks = new Set();

        this._started = false;
        this._disposed = false;
        this._disposing = false;
        this._pollTimer = null;
        this._reclaimTimer = null;
        this._wakeupUnsub = null;
        this._serialChain = Promise.resolve();
    }

    get supported() {
        return this._supported;
    }

    get started() {
        return this._started;
    }

    get disposed() {
        return this._disposed;
    }

    get namespace() {
        return this._namespace;
    }

    get workerId() {
        return this._workerId;
    }

    get deliverySemantics() {
        return 'at-least-once';
    }

    get webLocksEnabled() {
        return Boolean(this._useWebLocks && this._locks);
    }

    /** @private */
    _assertReady() {
        if (this._disposed || this._disposing) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.DISPOSED, 'DurableTaskQueue has been disposed');
        }
        if (!this._supported || !this._storage) {
            throw new TaskQueueError(
                TASK_QUEUE_ERROR_CODES.UNSUPPORTED_ENVIRONMENT,
                'IndexedDB is not available and no custom storage adapter was provided'
            );
        }
    }

    /** @private */
    _getAcceptedHandlersObject() {
        const out = Object.create(null);
        for (const [type, entry] of this._handlers.entries()) {
            out[type] = entry.version;
        }
        return out;
    }

    /** @private */
    _emitWakeup(reason = 'enqueue', extra = {}) {
        if (!this._bus || this._bus.closed || !this._bus.supported) return;
        try {
            this._bus.publish(
                `${TOPIC_WAKEUP_PREFIX}${this._namespace}`,
                {
                    workerId: this._workerId,
                    namespace: this._namespace,
                    reason,
                    timestamp: this._now(),
                    ...extra,
                },
                { local: false, remote: true }
            );
        } catch {
            // 喚醒訊號失敗不影響 IndexedDB 狀態
        }
    }

    /** @private */
    _computeRetryDelayMs(attemptCount) {
        if (this._backoffBaseMs === 0) return 0;
        const exponent = Math.max(0, attemptCount - 1);
        const raw = this._backoffBaseMs * Math.pow(this._backoffFactor, exponent);
        return Math.min(this._backoffMaxMs, Math.round(raw));
    }

    /**
     * 註冊具明確版本的任務處理器。
     * @param {string} type 任務類型名稱
     * @param {(payload: any, context: object) => any | Promise<any>} handler
     * @param {{ version?: number }} [options]
     * @returns {() => void} 取消註冊函式
     */
    registerHandler(type, handler, options = {}) {
        if (this._disposed) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.DISPOSED, 'Cannot register handler on a disposed DurableTaskQueue');
        }
        if (!isNonEmptyString(type) || FORBIDDEN_KEYS.has(type)) {
            throw new TypeError('Task handler type must be a safe non-empty string');
        }
        if (typeof handler !== 'function') {
            throw new TypeError('Task handler must be a function');
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('registerHandler options must be a plain object');
        }
        const version = options?.version ?? 1;
        if (!isPositiveInteger(version)) {
            throw new TypeError('Task handler version must be a positive integer');
        }

        const entry = { version, handler };
        this._handlers.set(type, entry);
        return () => {
            if (this._handlers.get(type) === entry) {
                this._handlers.delete(type);
            }
        };
    }

    /**
     * 新增持久化任務（支援同 namespace 內的 `idempotencyKey` 去重）。
     * @param {object} input
     * @param {string} input.type 任務類型
     * @param {any} [input.payload] 任務酬載
     * @param {string} [input.idempotencyKey] 冪等鍵
     * @param {number} [input.handlerVersion] 所需處理器版本（預設沿用本地註冊版本或 1）
     * @param {number} [input.maxAttempts] 最大嘗試次數
     * @param {number} [input.priority] 優先權（越大越先執行，預設 0）
     * @param {number} [input.delayMs] 延遲執行毫秒數（預設 0）
     * @returns {Promise<{ deduplicated: boolean, task: object }>}
     */
    async enqueue(input) {
        this._assertReady();
        if (!isPlainObject(input)) {
            throw new TypeError('enqueue input must be a plain object');
        }
        const {
            type,
            payload = null,
            idempotencyKey,
            handlerVersion,
            maxAttempts = this._defaultMaxAttempts,
            priority = 0,
            delayMs = 0,
        } = input;

        if (!isNonEmptyString(type) || FORBIDDEN_KEYS.has(type)) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.INVALID_TASK, 'Task type must be a safe non-empty string');
        }
        if (idempotencyKey !== undefined && idempotencyKey !== null && !isNonEmptyString(idempotencyKey)) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.INVALID_TASK, 'idempotencyKey must be a non-empty string');
        }
        const resolvedVersion = handlerVersion ?? this._handlers.get(type)?.version ?? 1;
        if (!isPositiveInteger(resolvedVersion)) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.INVALID_TASK, 'handlerVersion must be a positive integer');
        }
        if (!isPositiveInteger(maxAttempts)) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.INVALID_TASK, 'maxAttempts must be a positive integer');
        }
        if (typeof priority !== 'number' || !Number.isFinite(priority)) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.INVALID_TASK, 'priority must be a finite number');
        }
        if (!isNonNegativeFinite(delayMs)) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.INVALID_TASK, 'delayMs must be a non-negative finite number');
        }

        const safePayload = cloneStructuredValue(payload, 'payload');
        const now = this._now();
        const record = {
            id: generateContextId(),
            schemaVersion: TASK_SCHEMA_VERSION,
            namespace: this._namespace,
            type,
            handlerVersion: resolvedVersion,
            payload: safePayload,
            status: TASK_STATUS.PENDING,
            priority,
            idempotencyKey: idempotencyKey ?? null,
            attemptCount: 0,
            maxAttempts,
            ownerId: null,
            leaseId: null,
            leaseExpiresAt: null,
            lockProtected: false,
            lockName: null,
            nextRunAt: now + delayMs,
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            completedAt: null,
            failedAt: null,
            cancelledAt: null,
            result: undefined,
            lastError: null,
        };

        const res = await this._storage.enqueueAtomic(record);
        this.emit(res.deduplicated ? 'task-deduplicated' : 'task-enqueued', {
            task: res.task,
            deduplicated: res.deduplicated,
        });
        if (!res.deduplicated && this._started && !this._disposing) {
            this._emitWakeup('enqueue', { taskId: res.task.id, type: res.task.type });
            this._kickLoop();
        }
        return res;
    }

    /**
     * 啟動 Worker 輪詢與過期回收。
     * @returns {Promise<{ started: boolean, running: boolean, supported: boolean }>}
     */
    async start() {
        if (this._disposed || this._disposing) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.DISPOSED, 'Cannot start a disposed DurableTaskQueue');
        }
        if (!this._supported || !this._storage) {
            this.emit('unsupported', { namespace: this._namespace });
            return { started: false, running: false, supported: false };
        }
        if (this._started) {
            return { started: true, running: true, supported: true };
        }

        await this._storage.open?.();
        if (this._disposed || this._disposing) {
            return { started: false, running: false, supported: true };
        }

        this._started = true;

        if (this._bus && !this._bus.closed && !this._wakeupUnsub) {
            this._wakeupUnsub = this._bus.subscribe(
                `${TOPIC_WAKEUP_PREFIX}${this._namespace}`,
                () => {
                    if (this._started && !this._disposing) {
                        this._kickLoop();
                    }
                },
                { receive: 'remote' }
            );
        }

        this._pollTimer = setInterval(() => {
            if (this._started && !this._disposing) {
                this._kickLoop();
            }
        }, this._pollIntervalMs);

        this._reclaimTimer = setInterval(() => {
            if (this._started && !this._disposing) {
                void this.reclaimExpired().then((res) => {
                    if ((res?.reclaimed?.length || 0) > 0) {
                        this._kickLoop();
                    }
                }).catch((err) => {
                    if (!this._disposed && !this._disposing) {
                        this.emit('error', { error: err });
                    }
                });
            }
        }, this._reclaimIntervalMs);

        this.emit('started', { namespace: this._namespace, workerId: this._workerId });
        this._kickLoop();
        return { started: true, running: true, supported: true };
    }

    /**
     * 停止背景輪詢。
     * @param {{ abortActive?: boolean }} [options]
     */
    async stop(options = {}) {
        const abortActive = Boolean(options?.abortActive);
        this._started = false;

        if (this._pollTimer !== null) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        if (this._reclaimTimer !== null) {
            clearInterval(this._reclaimTimer);
            this._reclaimTimer = null;
        }
        if (this._wakeupUnsub) {
            this._wakeupUnsub();
            this._wakeupUnsub = null;
        }

        if (abortActive) {
            for (const active of this._activeExecutions.values()) {
                try {
                    active.controller.abort(
                        new TaskQueueError(TASK_QUEUE_ERROR_CODES.DISPOSED, 'Worker stopped with abortActive')
                    );
                } catch {
                    // ignore
                }
            }
        }

        await Promise.allSettled([...this._inFlightTasks]);
        this.emit('stopped', { namespace: this._namespace, workerId: this._workerId });
    }

    /**
     * 釋放本地資源（計時器、Web Locks 與連線句柄）；不刪除既有 IndexedDB 任務資料。
     */
    async dispose() {
        if (this._disposed) return;
        this._disposing = true;
        try {
            await this.stop({ abortActive: true });
            if (this._ownsStorageClose) {
                await this._storage?.close?.();
            }
        } finally {
            this._disposed = true;
            this._disposing = false;
            this.emit('disposed', { namespace: this._namespace, workerId: this._workerId });
        }
    }

    /** @private */
    _kickLoop() {
        this._serialChain = this._serialChain
            .then(async () => {
                while (this._started && !this._disposing && !this._disposed) {
                    const processed = await this._processNextInternal();
                    if (!processed) break;
                }
            })
            .catch((err) => {
                if (!this._disposed && !this._disposing) {
                    this.emit('error', { error: err });
                }
            });
    }

    /**
     * 嘗試原子認領並執行一筆可處理任務（無可處理任務時回傳 null）。
     * @returns {Promise<object | null>}
     */
    async processOnce() {
        this._assertReady();
        const taskPromise = this._serialChain.then(() => this._processNextInternal());
        this._serialChain = taskPromise.catch(() => null);
        return taskPromise;
    }

    /** @private */
    async _processNextInternal() {
        if (this._disposed || this._disposing || !this._storage) return null;

        const acceptedHandlers = this._getAcceptedHandlersObject();
        const leaseId = generateContextId();
        const claimRes = await this._storage.claimAtomic({
            namespace: this._namespace,
            ownerId: this._workerId,
            leaseId,
            now: this._now(),
            leaseMs: this._leaseDurationMs,
            acceptedHandlers,
        });

        for (const item of claimRes.reclaimed || []) {
            this.emit('task-reclaimed', item);
        }
        for (const mismatch of claimRes.mismatches || []) {
            this.emit('task-version-mismatch', mismatch);
        }

        if (!claimRes.claimed) return null;

        const task = claimRes.claimed;
        this.emit('task-claimed', { task });

        const execPromise = this._executeClaimedTask(task);
        this._inFlightTasks.add(execPromise);
        try {
            return await execPromise;
        } finally {
            this._inFlightTasks.delete(execPromise);
        }
    }

    /** @private */
    async _acquireTaskLock(task, state) {
        if (!this._useWebLocks || !this._locks || !isNonEmptyString(task.lockName)) return;

        let resolveStarted;
        const started = new Promise((resolve) => {
            resolveStarted = resolve;
        });

        const lockDone = this._locks
            .request(task.lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
                if (!lock || this._disposed || this._disposing || state.controller.signal.aborted) {
                    resolveStarted(false);
                    return;
                }
                let heldResolve;
                const held = new Promise((resolve) => {
                    heldResolve = resolve;
                });
                state.releaseLock = heldResolve;
                resolveStarted(true);
                await held;
            })
            .catch(() => {
                resolveStarted(false);
            });

        state.lockDone = lockDone;
        const acquired = await started;
        if (acquired && !this._disposed && !this._disposing && !state.controller.signal.aborted) {
            try {
                await this._storage.markLockProtectedAtomic({
                    namespace: this._namespace,
                    id: task.id,
                    ownerId: this._workerId,
                    leaseId: task.leaseId,
                    lockName: task.lockName,
                    now: this._now(),
                });
            } catch {
                // 標記鎖保護失敗不中斷既有租約防護執行
            }
        }
    }

    /** @private */
    async _executeClaimedTask(task) {
        const controller = new AbortController();
        const state = {
            controller,
            releaseLock: null,
            lockDone: null,
            leaseId: task.leaseId,
        };
        this._activeExecutions.set(task.id, state);

        let renewTimer = null;
        let leaseLost = false;

        try {
            await this._acquireTaskLock(task, state);

            const handlerEntry = this._handlers.get(task.type);
            if (!handlerEntry) {
                throw new TaskQueueError(
                    TASK_QUEUE_ERROR_CODES.HANDLER_NOT_FOUND,
                    `No handler registered for task type "${task.type}"`
                );
            }
            if (handlerEntry.version !== task.handlerVersion) {
                throw new TaskQueueError(
                    TASK_QUEUE_ERROR_CODES.HANDLER_VERSION_MISMATCH,
                    `Handler version mismatch for "${task.type}": expected ${handlerEntry.version}, task requires ${task.handlerVersion}`
                );
            }

            if (this._renewIntervalMs > 0) {
                let renewing = false;
                renewTimer = setInterval(async () => {
                    if (renewing || this._disposing || this._disposed || controller.signal.aborted) return;
                    renewing = true;
                    try {
                        const res = await this._storage.renewLeaseAtomic({
                            namespace: this._namespace,
                            id: task.id,
                            ownerId: this._workerId,
                            leaseId: task.leaseId,
                            now: this._now(),
                            leaseMs: this._leaseDurationMs,
                        });
                        if (!res.renewed) {
                            leaseLost = true;
                            const err = new TaskQueueError(TASK_QUEUE_ERROR_CODES.LEASE_LOST, `Lease lost during execution of ${task.id}`);
                            controller.abort(err);
                            this.emit('lease-lost', { taskId: task.id, leaseId: task.leaseId, reason: res.reason });
                        }
                    } catch {
                        // 下次輪詢仍會再檢查或逾時由租約到期防護
                    } finally {
                        renewing = false;
                    }
                }, this._renewIntervalMs);
            }

            let handlerResult;
            let handlerError = null;
            try {
                const rawResult = await handlerEntry.handler(cloneStructuredValue(task.payload, 'payload'), {
                    taskId: task.id,
                    type: task.type,
                    namespace: task.namespace,
                    attemptCount: task.attemptCount,
                    maxAttempts: task.maxAttempts,
                    handlerVersion: task.handlerVersion,
                    leaseId: task.leaseId,
                    ownerId: this._workerId,
                    signal: controller.signal,
                });
                handlerResult = rawResult !== undefined ? cloneStructuredValue(rawResult, 'result') : undefined;
            } catch (err) {
                handlerError = err;
            }

            if (renewTimer !== null) {
                clearInterval(renewTimer);
                renewTimer = null;
            }

            // dispose 模擬頁面強制重載／關閉時，不覆寫資料庫狀態，交由租約過期／Web Lock 孤兒機制復原
            if (this._disposing || this._disposed) {
                return task;
            }
            if (leaseLost) {
                return await this.getTask(task.id).catch(() => task);
            }

            if (handlerError === null) {
                const doneRes = await this._storage.completeAtomic({
                    namespace: this._namespace,
                    id: task.id,
                    ownerId: this._workerId,
                    leaseId: task.leaseId,
                    result: handlerResult,
                    now: this._now(),
                });
                if (!doneRes.updated) {
                    if (doneRes.reason === TASK_QUEUE_ERROR_CODES.LEASE_LOST) {
                        this.emit('lease-lost', { taskId: task.id, leaseId: task.leaseId, phase: 'complete' });
                    }
                    return doneRes.task;
                }
                this.emit('task-completed', { task: doneRes.task });
                return doneRes.task;
            }

            const now = this._now();
            const delayMs = this._computeRetryDelayMs(task.attemptCount);
            const failRes = await this._storage.failAtomic({
                namespace: this._namespace,
                id: task.id,
                ownerId: this._workerId,
                leaseId: task.leaseId,
                error: handlerError,
                now,
                nextRunAt: now + delayMs,
            });
            if (!failRes.updated) {
                if (failRes.reason === TASK_QUEUE_ERROR_CODES.LEASE_LOST) {
                    this.emit('lease-lost', { taskId: task.id, leaseId: task.leaseId, phase: 'fail' });
                }
                return failRes.task;
            }
            this.emit(failRes.exhausted ? 'task-failed' : 'task-retry-scheduled', {
                task: failRes.task,
                error: serializeTaskError(handlerError, now),
                delayMs: failRes.exhausted ? 0 : delayMs,
            });
            return failRes.task;
        } finally {
            if (renewTimer !== null) {
                clearInterval(renewTimer);
            }
            this._activeExecutions.delete(task.id);
            if (state.releaseLock) {
                state.releaseLock();
            }
            if (state.lockDone) {
                await state.lockDone.catch(() => {});
            }
        }
    }

    /**
     * 主動檢查並回收租約已到期之任務；若啟用 Web Locks 且任務受鎖保護，亦嘗試以非搶奪式探測快速回收已關閉分頁的孤兒任務。
     * @returns {Promise<{ reclaimed: Array<{ transition: string, task: object }>, orphansReclaimed: number }>}
     */
    async reclaimExpired() {
        this._assertReady();
        const now = this._now();
        const res = await this._storage.reclaimExpiredAtomic({
            namespace: this._namespace,
            now,
        });
        const reclaimed = [...(res.reclaimed || [])];
        let orphansReclaimed = 0;

        if (this._useWebLocks && this._locks && Array.isArray(res.lockCandidates)) {
            for (const candidate of res.lockCandidates) {
                if (this._disposed || this._disposing) break;
                if (candidate.ownerId === this._workerId) continue;

                let orphanOutcome = null;
                try {
                    await this._locks.request(
                        candidate.lockName,
                        { mode: 'exclusive', ifAvailable: true },
                        async (lock) => {
                            if (!lock || this._disposed || this._disposing) return;
                            orphanOutcome = await this._storage.reclaimOrphanAtomic({
                                namespace: this._namespace,
                                id: candidate.id,
                                expectedLeaseId: candidate.leaseId,
                                now: this._now(),
                            });
                        }
                    );
                } catch {
                    // 孤兒探測失敗不阻斷其餘回收流程
                }

                if (orphanOutcome?.reclaimed) {
                    orphansReclaimed++;
                    reclaimed.push({
                        transition: orphanOutcome.transition,
                        task: orphanOutcome.task,
                    });
                }
            }
        }

        for (const item of reclaimed) {
            this.emit('task-reclaimed', item);
        }
        if (reclaimed.length > 0 && this._started && !this._disposing) {
            this._emitWakeup('reclaim', { count: reclaimed.length });
        }

        return { reclaimed, orphansReclaimed };
    }

    /**
     * 取消任務（僅 `pending` 或 `running` 可取消）。
     * @param {string} taskId
     * @returns {Promise<{ cancelled: boolean, alreadyTerminal?: boolean, reason?: string, task: object | null }>}
     */
    async cancel(taskId) {
        this._assertReady();
        if (!isNonEmptyString(taskId)) {
            throw new TypeError('cancel taskId must be a non-empty string');
        }
        const active = this._activeExecutions.get(taskId);
        if (active) {
            try {
                active.controller.abort(new TaskQueueError(TASK_QUEUE_ERROR_CODES.INVALID_STATE, `Task ${taskId} was cancelled`));
            } catch {
                // ignore
            }
        }
        const res = await this._storage.cancelAtomic({
            namespace: this._namespace,
            id: taskId,
            now: this._now(),
        });
        if (res.cancelled) {
            this.emit('task-cancelled', { task: res.task });
        }
        return res;
    }

    /**
     * 手動重試處於 `failed` 或 `cancelled` 狀態的任務（重設 attemptCount 與退避）。
     * @param {string} taskId
     * @param {{ maxAttempts?: number }} [options]
     * @returns {Promise<{ retried: boolean, task: object }>}
     */
    async retry(taskId, options = {}) {
        this._assertReady();
        if (!isNonEmptyString(taskId)) {
            throw new TypeError('retry taskId must be a non-empty string');
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('retry options must be a plain object');
        }
        if (options?.maxAttempts !== undefined && !isPositiveInteger(options.maxAttempts)) {
            throw new TaskQueueError(TASK_QUEUE_ERROR_CODES.INVALID_TASK, 'retry maxAttempts must be a positive integer');
        }
        const res = await this._storage.retryAtomic({
            namespace: this._namespace,
            id: taskId,
            now: this._now(),
            maxAttempts: options?.maxAttempts,
        });
        if (!res.retried) {
            throw new TaskQueueError(
                res.reason || TASK_QUEUE_ERROR_CODES.INVALID_STATE,
                `Cannot retry task ${taskId}: ${res.reason}`
            );
        }
        this.emit('task-retried', { task: res.task });
        if (this._started && !this._disposing) {
            this._emitWakeup('retry', { taskId });
            this._kickLoop();
        }
        return res;
    }

    /**
     * 取得單一任務快照（僅限當前 namespace）。
     * @param {string} taskId
     * @returns {Promise<object | null>}
     */
    async getTask(taskId) {
        this._assertReady();
        if (!isNonEmptyString(taskId)) {
            throw new TypeError('getTask taskId must be a non-empty string');
        }
        return this._storage.getTask({ namespace: this._namespace, id: taskId });
    }

    /**
     * 列出當前 namespace 的任務清單。
     * @param {{ status?: string, type?: string, limit?: number }} [filter]
     * @returns {Promise<object[]>}
     */
    async listTasks(filter = {}) {
        this._assertReady();
        if (filter !== undefined && !isPlainObject(filter)) {
            throw new TypeError('listTasks filter must be a plain object');
        }
        return this._storage.listTasks({
            namespace: this._namespace,
            status: filter?.status,
            type: filter?.type,
            limit: filter?.limit,
        });
    }

    /**
     * 統計當前 namespace 各狀態任務數量。
     * @returns {Promise<{ pending: number, running: number, completed: number, failed: number, cancelled: number, total: number }>}
     */
    async getStats() {
        this._assertReady();
        return this._storage.getStats({ namespace: this._namespace });
    }

    /**
     * 清除已過保留期限的終態任務（`completed` / `failed` / `cancelled`）。
     * @param {{ olderThanMs?: number, statuses?: string[] }} [options]
     * @returns {Promise<{ purgedCount: number, taskIds: string[] }>}
     */
    async purge(options = {}) {
        this._assertReady();
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('purge options must be a plain object');
        }
        const olderThanMs = options?.olderThanMs ?? this._retentionMs;
        if (!isNonNegativeFinite(olderThanMs)) {
            throw new TypeError('purge olderThanMs must be a non-negative finite number');
        }
        const statuses = options?.statuses ?? [TASK_STATUS.COMPLETED, TASK_STATUS.FAILED, TASK_STATUS.CANCELLED];
        if (!Array.isArray(statuses) || statuses.some((s) => !TERMINAL_STATUSES.has(s))) {
            throw new TypeError('purge statuses may only contain completed, failed, or cancelled');
        }
        const cutoffAt = this._now() - olderThanMs;
        const res = await this._storage.purge({
            namespace: this._namespace,
            cutoffAt,
            statuses,
        });
        if (res.purgedCount > 0) {
            this.emit('tasks-purged', res);
        }
        return res;
    }

    /**
     * 清空當前 namespace 內的所有任務紀錄（不影響其他 namespace）。
     * @returns {Promise<{ clearedCount: number }>}
     */
    async clearNamespace() {
        this._assertReady();
        for (const active of this._activeExecutions.values()) {
            try {
                active.controller.abort(new TaskQueueError(TASK_QUEUE_ERROR_CODES.DISPOSED, 'Namespace cleared'));
            } catch {
                // ignore
            }
        }
        const res = await this._storage.clearNamespace({ namespace: this._namespace });
        this.emit('namespace-cleared', { namespace: this._namespace, ...res });
        return res;
    }
}

/**
 * 建立 DurableTaskQueue 實例的便利工廠函式。
 * @param {object} [options]
 * @returns {DurableTaskQueue}
 */
export function createDurableTaskQueue(options = {}) {
    return new DurableTaskQueue(options);
}
