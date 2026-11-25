/**
 * Browser Computing Farm 的 Blob store（#11）：輸入圖片、輸出圖片與批次紀錄存在範例自己的 IndexedDB。
 * `DurableTaskQueue` 的 payload／result 只放這裡的 key（佇列拒收 Blob，見 docs/coordination.md）。
 *
 * 匯入零副作用；第一次讀寫時才開啟資料庫。其他視窗重設資料（versionchange）時自動讓出連線。
 */
import { FARM_SCHEMA_VERSION } from './farm-model.js';

const STORES = ['inputs', 'outputs', 'runs'];

/** @param {IDBRequest} request */
function done(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** @param {IDBTransaction} tx */
function committed(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
}

export class FarmStore {
    /** @param {string} dbName */
    constructor(dbName) {
        this.dbName = dbName;
        /** @type {Promise<IDBDatabase> | null} */
        this._opening = null;
    }

    _db() {
        if (this._opening) return this._opening;
        const opening = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, FARM_SCHEMA_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                // FARM_SCHEMA_VERSION 1：初次建立。之後的版本在這裡依 event.oldVersion 逐版遷移。
                if (!db.objectStoreNames.contains('inputs')) db.createObjectStore('inputs', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('outputs')) {
                    db.createObjectStore('outputs', { keyPath: 'key' }).createIndex('runId', 'runId');
                }
                if (!db.objectStoreNames.contains('runs')) db.createObjectStore('runs', { keyPath: 'id' });
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => this.close();
                resolve(db);
            };
            request.onerror = () => reject(request.error);
        });
        this._opening = opening;
        opening.catch(() => {
            if (this._opening === opening) this._opening = null;
        });
        return opening;
    }

    close() {
        const opening = this._opening;
        this._opening = null;
        opening?.then((db) => db.close(), () => {});
    }

    /**
     * 在同一個 readwrite transaction 內讀出現有輸入、決定要收哪些、再寫入。
     * IndexedDB 讓範圍重疊的 readwrite transaction 依序執行（跨分頁也一樣），
     * 兩個分頁同時匯入時，後執行的一定看得到前一個寫入的張數與容量，不會一起突破上限。
     * `decide` 必須是同步函式（transaction 內不能等待其他非同步工作）；丟出錯誤時整個 transaction 取消。
     * @template R
     * @param {(existing: Array<{ id: string, size: number }>) => { records: object[], result: R }} decide
     * @returns {Promise<R>}
     */
    async addInputsChecked(decide) {
        const db = await this._db();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('inputs', 'readwrite');
            const store = tx.objectStore('inputs');
            const existing = [];
            let outcome;
            let failure = null;
            tx.oncomplete = () => resolve(outcome);
            tx.onabort = () => reject(failure ?? tx.error ?? new Error('IndexedDB transaction aborted'));
            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    existing.push({ id: cursor.value.id, size: cursor.value.size });
                    cursor.continue();
                    return;
                }
                try {
                    const { records, result } = decide(existing);
                    for (const record of records) store.put(record);
                    outcome = result;
                } catch (err) {
                    failure = err;
                    tx.abort();
                }
            };
        });
    }

    /** @param {string} id */
    async getInput(id) {
        return done((await this._db()).transaction('inputs').objectStore('inputs').get(id));
    }

    /** 輸入清單（不含 Blob 內容，避免一次把所有圖片讀進記憶體） */
    async listInputMeta() {
        const db = await this._db();
        const metas = [];
        await new Promise((resolve, reject) => {
            const request = db.transaction('inputs').objectStore('inputs').openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return resolve();
                const { id, name, type, size, createdAt } = cursor.value;
                metas.push({ id, name, type, size, createdAt });
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
        return metas.sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
    }

    /** @param {object} output 以 `key`（taskId:leaseId）為主鍵 */
    async putOutput(output) {
        const tx = (await this._db()).transaction('outputs', 'readwrite');
        tx.objectStore('outputs').put(output);
        await committed(tx);
    }

    /** @param {string} key */
    async getOutput(key) {
        return done((await this._db()).transaction('outputs').objectStore('outputs').get(key));
    }

    /** 輸出清單（不含 Blob 內容） */
    async listOutputMeta() {
        const db = await this._db();
        const metas = [];
        await new Promise((resolve, reject) => {
            const request = db.transaction('outputs').objectStore('outputs').openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return resolve();
                const { blob, ...meta } = cursor.value;
                metas.push(meta);
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
        return metas;
    }

    /** @param {string[]} keys */
    async deleteOutputs(keys) {
        if (!keys.length) return;
        const tx = (await this._db()).transaction('outputs', 'readwrite');
        for (const key of keys) tx.objectStore('outputs').delete(key);
        await committed(tx);
    }

    /** @param {object} run */
    async putRun(run) {
        const tx = (await this._db()).transaction('runs', 'readwrite');
        tx.objectStore('runs').put(run);
        await committed(tx);
    }

    /**
     * 只在批次還存在時更新（單一 transaction 內讀出、合併、寫回）。
     * 批次已被重設刪除時回傳 null，不會把它寫回來。
     * @param {string} id
     * @param {object} patch
     * @returns {Promise<object | null>}
     */
    async updateRun(id, patch) {
        const db = await this._db();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('runs', 'readwrite');
            const store = tx.objectStore('runs');
            let updated = null;
            tx.oncomplete = () => resolve(updated);
            tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
            const request = store.get(id);
            request.onsuccess = () => {
                if (!request.result) return;
                updated = { ...request.result, ...patch };
                store.put(updated);
            };
        });
    }

    async listRuns() {
        const runs = await done((await this._db()).transaction('runs').objectStore('runs').getAll());
        return runs.sort((a, b) => a.createdAt - b.createdAt);
    }

    /** 清空輸入、輸出與批次（不刪資料庫） */
    async clear() {
        const tx = (await this._db()).transaction(STORES, 'readwrite');
        for (const name of STORES) tx.objectStore(name).clear();
        await committed(tx);
    }
}
