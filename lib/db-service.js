import { BaseService } from './base-service.js';

/**
 * DBService
 * 封裝原生 IndexedDB 操作，提供離線筆記 CRUD，並繼承 BaseService 以支援響應式資料變更監聽。
 */
export class DBService extends BaseService {
    constructor() {
        super();
        this.dbName = 'vanilla-db';
        this.storeName = 'notes';
        this.version = 1;
        this._db = null;
    }

    /**
     * 取得資料庫實例（惰性載入）
     */
    async _getDB() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this._db = request.result;
                resolve(request.result);
            };
            request.onupgradeneeded = (e) => {
                const db = request.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    // 建立筆記 store，以 id 作為 keyPath
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
        });
    }

    /**
     * 讀取所有筆記
     */
    async getAll() {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 新增或更新筆記
     */
    async put(note) {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(note);
            request.onsuccess = () => {
                this.emit('change');
                resolve(note);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 刪除指定筆記
     */
    async delete(id) {
        const db = await this._getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);
            request.onsuccess = () => {
                this.emit('change');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 清空資料庫並寫入預設示範資料
     */
    async resetDemoData() {
        const db = await this._getDB();
        const demoNotes = [
            {
                id: 'demo-1',
                title: '💡 原生 IndexedDB 指南',
                content: 'IndexedDB 是瀏覽器內建的非關係型資料庫。適合儲存大量結構化數據。我們使用 DBService 封裝它，並綁定在組件生命週期中，實現反應式更新。',
                updatedAt: new Date().toISOString()
            },
            {
                id: 'demo-2',
                title: '🧵 Web Worker 離線備份說明',
                content: '當資料量大時，序列化與壓縮會阻塞主執行緒。點擊上方的「導出加密備份」，系統會將資料發送給背景 Worker 執行 Gzip 壓縮與位元 XOR 加密，完成後再提示下載！',
                updatedAt: new Date().toISOString()
            }
        ];

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            store.clear();
            for (const note of demoNotes) {
                store.put(note);
            }

            transaction.oncomplete = () => {
                this.emit('change');
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }
}
export const dbService = new DBService();
