/**
 * Multi-Window POS 的權威資料（#10，ADR 0108）：菜單與訂單存在範例自己的 IndexedDB。
 *
 * 每個寫入都在單一 readwrite transaction 內完成「讀出 → 依 pos-model 判斷 → 寫回」。
 * IndexedDB 保證範圍重疊的 readwrite transaction 依序執行（跨分頁、跨連線也一樣），
 * 所以兩個廚房同時認領同一張單，第二個 transaction 一定看到第一個寫入的結果。
 *
 * 匯入零副作用；第一次讀寫時才開啟資料庫。
 */
import {
    DEFAULT_MENU,
    POS_ERROR_CODES,
    POS_SCHEMA_VERSION,
    PosError,
    createOrder,
    decideTransition,
} from './pos-model.js';

const STORE_PRODUCTS = 'products';
const STORE_ORDERS = 'orders';
const STORE_META = 'meta';
const SEQUENCE_KEY = 'sequence';

/**
 * 在一個 transaction 內執行 body，transaction 完成（commit）後才 resolve。
 * body 內一律用 request 的 onsuccess 回呼串接，不跨 await，避免 transaction 提早自動提交。
 * body 或回呼拋出的錯誤會中止 transaction，並以該錯誤 reject。
 * @param {IDBDatabase} db
 * @param {string[]} storeNames
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction, ctx: { set: (value: any) => void, step: (fn: Function) => Function }) => void} body
 * @returns {Promise<any>}
 */
export function runTransaction(db, storeNames, mode, body) {
    return new Promise((resolve, reject) => {
        let tx;
        try {
            tx = db.transaction(storeNames, mode);
        } catch (err) {
            reject(err);
            return;
        }
        let outcome;
        let failure = null;
        const fail = (err) => {
            failure ??= err;
            try {
                tx.abort();
            } catch {
                // 已經結束的 transaction 不能再 abort，onabort／onerror 會帶出原因
            }
        };
        const step = (fn) => (...args) => {
            try {
                fn(...args);
            } catch (err) {
                fail(err);
            }
        };
        tx.oncomplete = () => resolve(outcome);
        tx.onabort = () => reject(failure ?? tx.error ?? new Error('IndexedDB transaction aborted'));
        step(() => body(tx, { set: (value) => { outcome = value; }, step }))();
    });
}

/**
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
export function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export class PosRepository {
    /**
     * @param {{ dbName: string, menu?: ReadonlyArray<object>, now?: () => number, generateId?: () => string }} options
     */
    constructor({ dbName, menu = DEFAULT_MENU, now = () => Date.now(), generateId = () => crypto.randomUUID() }) {
        if (typeof dbName !== 'string' || !dbName) throw new TypeError('PosRepository 需要 dbName');
        this.dbName = dbName;
        this._menu = menu;
        this._now = now;
        this._generateId = generateId;
        /** @type {Promise<IDBDatabase> | null} */
        this._opening = null;
    }

    /** 環境是否支援 IndexedDB */
    static get supported() {
        return typeof globalThis.indexedDB !== 'undefined';
    }

    /**
     * 取得連線；連線被關閉（包含其他視窗重設資料觸發的 versionchange）後，下一次呼叫會重新開啟。
     * 新建立的資料庫在 onupgradeneeded 內寫入示範菜單，因此重設後第一個開啟的視窗會自動補回菜單。
     * @returns {Promise<IDBDatabase>}
     */
    _db() {
        if (!PosRepository.supported) {
            return Promise.reject(new PosError(POS_ERROR_CODES.UNSUPPORTED, '此瀏覽器不支援 IndexedDB'));
        }
        if (this._opening) return this._opening;
        const opening = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, POS_SCHEMA_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                // POS_SCHEMA_VERSION 1：初次建立。之後的版本在這裡依 event.oldVersion 逐版遷移。
                if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
                    const products = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
                    for (const product of this._menu) products.put({ ...product });
                }
                if (!db.objectStoreNames.contains(STORE_ORDERS)) {
                    const orders = db.createObjectStore(STORE_ORDERS, { keyPath: 'id' });
                    orders.createIndex('requestId', 'requestId', { unique: true });
                    orders.createIndex('sequence', 'sequence');
                }
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                // 其他視窗要刪除或升級資料庫時立即讓出連線（docs/solutions/conventions.md §4）
                db.onversionchange = () => this.close();
                db.onclose = () => {
                    if (this._opening === opening) this._opening = null;
                };
                resolve(db);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
                // 舊連線還沒關：等它關閉後 open 會自動繼續，不需要處理
            };
        });
        this._opening = opening;
        opening.catch(() => {
            if (this._opening === opening) this._opening = null;
        });
        return opening;
    }

    /** 關閉連線；之後的讀寫會重新開啟 */
    close() {
        const opening = this._opening;
        this._opening = null;
        opening?.then((db) => db.close(), () => {});
    }

    /** @returns {Promise<object[]>} 菜單 */
    async listProducts() {
        const db = await this._db();
        return requestToPromise(db.transaction(STORE_PRODUCTS).objectStore(STORE_PRODUCTS).getAll());
    }

    /** @returns {Promise<object[]>} 全部訂單，依取餐序號排序 */
    async listOrders() {
        const db = await this._db();
        return requestToPromise(db.transaction(STORE_ORDERS).objectStore(STORE_ORDERS).index('sequence').getAll());
    }

    /** @param {string} id */
    async getOrder(id) {
        const db = await this._db();
        return requestToPromise(db.transaction(STORE_ORDERS).objectStore(STORE_ORDERS).get(id));
    }

    /**
     * 建立訂單。同一個 requestId 重送時不會產生第二張單，而是回傳第一次建立的訂單（`noop`）。
     * 取餐序號與訂單在同一個 transaction 內遞增與寫入。
     * @param {{ items: Array<{ productId: string, qty: number }>, requestId: string, by?: string }} input
     * @returns {Promise<{ result: 'applied' | 'noop', order: object }>}
     */
    async placeOrder({ items, requestId, by }) {
        const db = await this._db();
        return runTransaction(db, [STORE_ORDERS, STORE_PRODUCTS, STORE_META], 'readwrite', (tx, { set, step }) => {
            const orders = tx.objectStore(STORE_ORDERS);
            const existing = orders.index('requestId').get(String(requestId ?? ''));
            existing.onsuccess = step(() => {
                if (existing.result) {
                    set({ result: 'noop', order: existing.result });
                    return;
                }
                const products = tx.objectStore(STORE_PRODUCTS).getAll();
                products.onsuccess = step(() => {
                    const meta = tx.objectStore(STORE_META);
                    const counter = meta.get(SEQUENCE_KEY);
                    counter.onsuccess = step(() => {
                        const sequence = (counter.result?.value ?? 0) + 1;
                        const order = createOrder({ items, requestId, id: this._generateId(), sequence, now: this._now(), by }, products.result);
                        orders.add(order);
                        meta.put({ key: SEQUENCE_KEY, value: sequence });
                        set({ result: 'applied', order });
                    });
                });
            });
        });
    }

    /**
     * 對訂單執行動作（見 pos-model 的 ORDER_ACTIONS）。判斷與寫入在同一個 transaction 內。
     * @param {string} orderId
     * @param {{ action: string, actor: string, fromStation?: string }} request
     * @returns {Promise<{ result: 'applied' | 'noop', order: object }>}
     */
    async transition(orderId, { action, actor, fromStation }) {
        const db = await this._db();
        return runTransaction(db, [STORE_ORDERS], 'readwrite', (tx, { set, step }) => {
            const orders = tx.objectStore(STORE_ORDERS);
            const current = orders.get(orderId);
            current.onsuccess = step(() => {
                const decision = decideTransition(current.result, { action, actor, fromStation, now: this._now() });
                if (decision.result === 'applied') orders.put(decision.order);
                set(decision);
            });
        });
    }
}

/**
 * @param {ConstructorParameters<typeof PosRepository>[0]} options
 * @returns {PosRepository}
 */
export function createPosRepository(options) {
    return new PosRepository(options);
}
