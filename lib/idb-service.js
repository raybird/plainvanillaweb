import { BaseService } from './base-service.js';

/**
 * IDBService - 進階 IndexedDB 服務
 * 支援多個 Object Store 與非同步操作。
 */
export class IDBService extends BaseService {
    constructor(dbName = 'VanillaDB', version = 3) {
        super();
        this.dbName = dbName;
        this.version = version;
        this._db = null;
        this.stores = {
            CACHE: 'api_cache',
            QUEUE: 'actions_queue'
        };
    }

    async _getDB() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.stores.CACHE)) {
                    db.createObjectStore(this.stores.CACHE);
                }
                if (!db.objectStoreNames.contains(this.stores.QUEUE)) {
                    db.createObjectStore(this.stores.QUEUE, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (e) => {
                this._db = e.target.result;
                resolve(this._db);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    async put(storeName, data, key) {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = key ? store.put(data, key) : store.put(data);
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = () => reject(tx.error);
        });
    }

    async get(storeName, key) {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName) {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.delete(key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    // --- 舊介面相容區 ---
    async set(key, value, ttlMinutes = 60) {
        const entry = { value, expiry: Date.now() + (ttlMinutes * 60 * 1000) };
        return this.put(this.stores.CACHE, entry, key);
    }

    async getCache(key) {
        const entry = await this.get(this.stores.CACHE, key);
        if (!entry) return null;
        if (Date.now() > entry.expiry) {
            this.delete(this.stores.CACHE, key);
            return null;
        }
        return entry.value;
    }
    
    // 別名
    async fetch(key) { return this.getCache(key); }
    // 修復 RepoSearch 使用的 get
    async getLegacy(key) { return this.getCache(key); }

    async clear() {
        const db = await this._getDB();
        const tx = db.transaction(this.stores.CACHE, 'readwrite');
        tx.objectStore(this.stores.CACHE).clear();
    }

    async getStats() {
        const db = await this._getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(this.stores.CACHE, 'readonly');
            const request = tx.objectStore(this.stores.CACHE).count();
            request.onsuccess = () => resolve({ count: request.result, usage: 'N/A' });
        });
    }
}

// 代理舊的 get 方法到 getCache
const idbInstance = new IDBService();
export const idbService = new Proxy(idbInstance, {
    get(target, prop) {
        if (prop === 'get') return target.getCache.bind(target);
        return target[prop];
    }
});
