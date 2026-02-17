import { BaseService } from './base-service.js';

/**
 * IDBService - 基於 IndexedDB 的非同步持久化快取服務
 * 繼承自 BaseService 以維持架構一致性。
 * 優點：非同步不阻塞、容量大 (50MB+)，適合快取 API 響應數據。
 */
export class IDBService extends BaseService {
    constructor(dbName = 'VanillaCache', storeName = 'api_cache') {
        super();
        this.dbName = dbName;
        this.storeName = storeName;
        this._db = null;
    }

    /**
     * 獲取資料庫實例（單例模式）
     */
    async _getDB() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    // 建立一個簡單的鍵值對存儲
                    db.createObjectStore(this.storeName);
                }
            };

            request.onsuccess = (e) => {
                this._db = e.target.result;
                this.emit('ready', { dbName: this.dbName });
                resolve(this._db);
            };

            request.onerror = (e) => {
                this.emit('error', { error: e.target.error });
                reject(e.target.error);
            };
        });
    }

    /**
     * 存儲數據
     * @param {string} key 
     * @param {any} value 
     * @param {number} ttlMinutes 過期時間 (分鐘)，預設 60 分鐘
     */
    async set(key, value, ttlMinutes = 60) {
        try {
            const db = await this._getDB();
            const expiry = Date.now() + (ttlMinutes * 60 * 1000);
            
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.put({ value, expiry, updatedAt: Date.now() }, key);
                
                tx.oncomplete = () => {
                    this.emit('set', { key });
                    resolve(true);
                };
                tx.onerror = () => reject(tx.error);
            });
        } catch (err) {
            console.error('[IDBService] Set Error:', err);
            return false;
        }
    }

    /**
     * 讀取數據
     * @param {string} key 
     */
    async get(key) {
        try {
            const db = await this._getDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.get(key);

                request.onsuccess = () => {
                    const entry = request.result;
                    if (!entry) return resolve(null);

                    // 檢查是否過期
                    if (Date.now() > entry.expiry) {
                        this.delete(key);
                        return resolve(null);
                    }
                    resolve(entry.value);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            console.error('[IDBService] Get Error:', err);
            return null;
        }
    }

    /**
     * 刪除指定數據
     * @param {string} key 
     */
    async delete(key) {
        const db = await this._getDB();
        const tx = db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).delete(key);
        this.emit('delete', { key });
    }

    /**
     * 清空所有快取
     */
    async clear() {
        const db = await this._getDB();
        const tx = db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).clear();
        this.emit('clear');
    }
}

export const idbService = new IDBService();
