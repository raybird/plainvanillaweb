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

    /** @param {Array<{ id: string, name: string, type: string, size: number, blob: Blob, createdAt: number }>} inputs */
    async putInputs(inputs) {
        const tx = (await this._db()).transaction('inputs', 'readwrite');
        for (const input of inputs) tx.objectStore('inputs').put(input);
        await committed(tx);
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
