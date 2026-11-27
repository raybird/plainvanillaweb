/**
 * POS v2 的權威資料（#16，ADR 0109）：訂單、桌位與用餐場次、授權、配對票存在主機自己的 IndexedDB。
 *
 * 和第一代相同，每個寫入都在單一 readwrite transaction 內完成「讀出 → 依 pos-v2-model 判斷 → 寫回」，
 * 跨裝置的互斥由這些 transaction 依序執行保證。雜湊與隨機值需要非同步的 WebCrypto，
 * 一律在 transaction 開始前算好，transaction 內只用 request 的 onsuccess 串接，不跨 await。
 *
 * 房間（roomId、hostSecret）存在另一個資料庫：「重設 demo 資料」只刪除訂單資料庫，保留房間。
 * 匯入零副作用；第一次讀寫時才開啟資料庫。
 */
import { DEFAULT_MENU, createOrder, decideTransition } from '../pos/pos-model.js';
import { requestToPromise, runTransaction } from '../pos/pos-repository.js';
import { resetSolutionData } from '../solution-kit.js';
import {
    CREDENTIAL_KIND,
    POS_V2_ERROR_CODES,
    POS_V2_SCHEMA_VERSION,
    PosError,
    SESSION_STATUS,
    assertPairingValid,
    closeDiningSession,
    createDeviceCredential,
    createPairingTicket,
    createTableCredential,
    decidePlaceOrder,
    decideTableJoin,
    deriveViewToken,
    hashSecret,
    openDiningSession,
    principalOf,
    randomCode,
    randomToken,
    rotateSessionCode,
    safeEqual,
    verifyCredential,
    withV2Fields,
} from './pos-v2-model.js';

const STORE = Object.freeze({
    PRODUCTS: 'products',
    ORDERS: 'orders',
    META: 'meta',
    TABLES: 'tables',
    SESSIONS: 'sessions',
    CREDENTIALS: 'credentials',
    PAIRING: 'pairing',
});
const SEQUENCE_KEY = 'sequence';
const ROOM_STORE = 'room';
const ROOM_KEY = 'room';
const ROOM_SCHEMA_VERSION = 1;

/** 示範桌位 */
export const DEFAULT_TABLES = Object.freeze(['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].map((id) => Object.freeze({ id, name: `${id} 桌` })));

/** 對外（管理頁、店家入口）的場次欄位：不含入桌碼雜湊 */
function publicSession(session) {
    if (!session) return null;
    const { codeHash: _codeHash, ...rest } = session;
    return rest;
}

/** 對外的授權欄位：不含 secret 雜湊 */
function publicCredential(record) {
    const { secretHash: _secretHash, ...rest } = record;
    return rest;
}

/**
 * 一張桌目前的場次：開啟中的那一個（同一桌最多一個），沒有時取最晚開的。
 * 不能只比開桌時間：關桌後馬上再開，兩個場次可能落在同一毫秒。
 */
function latestSession(sessions) {
    return sessions.find((session) => session.status === SESSION_STATUS.OPEN)
        ?? sessions.reduce((latest, session) => (!latest || session.openedAt > latest.openedAt ? session : latest), null);
}

function assertString(value, name) {
    if (typeof value !== 'string' || !value) throw new PosError(POS_V2_ERROR_CODES.BAD_MESSAGE, `缺少 ${name}`);
}

/**
 * 開啟資料庫並在連線被關閉（包含其他分頁重設資料觸發的 versionchange）後讓下一次呼叫重新開啟。
 */
class LazyDatabase {
    /**
     * @param {string} name
     * @param {number} version
     * @param {(db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void} upgrade
     */
    constructor(name, version, upgrade) {
        this.name = name;
        this._version = version;
        this._upgrade = upgrade;
        /** @type {Promise<IDBDatabase> | null} */
        this._opening = null;
    }

    get() {
        if (typeof globalThis.indexedDB === 'undefined') {
            return Promise.reject(new PosError(POS_V2_ERROR_CODES.UNSUPPORTED, '此瀏覽器不支援 IndexedDB'));
        }
        if (this._opening) return this._opening;
        const opening = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this._version);
            request.onupgradeneeded = (event) => this._upgrade(request.result, request.transaction, event.oldVersion);
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => this.close();
                db.onclose = () => {
                    if (this._opening === opening) this._opening = null;
                };
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
}

export class PosV2Repository {
    /**
     * @param {{ dbName: string, roomDbName: string, menu?: ReadonlyArray<object>, tables?: ReadonlyArray<object>, now?: () => number, generateId?: () => string }} options
     */
    constructor({ dbName, roomDbName, menu = DEFAULT_MENU, tables = DEFAULT_TABLES, now = () => Date.now(), generateId = () => crypto.randomUUID() }) {
        if (typeof dbName !== 'string' || !dbName) throw new TypeError('PosV2Repository 需要 dbName');
        if (typeof roomDbName !== 'string' || !roomDbName || roomDbName === dbName) throw new TypeError('PosV2Repository 需要獨立的 roomDbName');
        this.dbName = dbName;
        this.roomDbName = roomDbName;
        this._now = now;
        this._generateId = generateId;
        this._orders = new LazyDatabase(dbName, POS_V2_SCHEMA_VERSION, (db) => {
            // POS_V2_SCHEMA_VERSION 1：初次建立。之後的版本在這裡依 oldVersion 逐版遷移。
            if (!db.objectStoreNames.contains(STORE.PRODUCTS)) {
                const products = db.createObjectStore(STORE.PRODUCTS, { keyPath: 'id' });
                for (const product of menu) products.put({ ...product });
            }
            if (!db.objectStoreNames.contains(STORE.ORDERS)) {
                const orders = db.createObjectStore(STORE.ORDERS, { keyPath: 'id' });
                // 去重鍵是「身分＋requestId」：拿別人的 requestId 查不到別人的訂單（協定規格 5.4）
                orders.createIndex('principalRequest', ['principal', 'requestId'], { unique: true });
                orders.createIndex('sequence', 'sequence');
            }
            if (!db.objectStoreNames.contains(STORE.META)) db.createObjectStore(STORE.META, { keyPath: 'key' });
            if (!db.objectStoreNames.contains(STORE.TABLES)) {
                const store = db.createObjectStore(STORE.TABLES, { keyPath: 'id' });
                for (const table of tables) store.put({ ...table });
            }
            if (!db.objectStoreNames.contains(STORE.SESSIONS)) {
                db.createObjectStore(STORE.SESSIONS, { keyPath: 'id' }).createIndex('tableId', 'tableId');
            }
            if (!db.objectStoreNames.contains(STORE.CREDENTIALS)) db.createObjectStore(STORE.CREDENTIALS, { keyPath: 'id' });
            if (!db.objectStoreNames.contains(STORE.PAIRING)) db.createObjectStore(STORE.PAIRING, { keyPath: 'id' });
        });
        this._room = new LazyDatabase(roomDbName, ROOM_SCHEMA_VERSION, (db) => {
            if (!db.objectStoreNames.contains(ROOM_STORE)) db.createObjectStore(ROOM_STORE, { keyPath: 'key' });
        });
    }

    /** 環境是否支援 IndexedDB */
    static get supported() {
        return typeof globalThis.indexedDB !== 'undefined';
    }

    /** 關閉連線；之後的讀寫會重新開啟 */
    close() {
        this._orders.close();
        this._room.close();
    }

    // ---------- 房間 ----------

    /**
     * 讀出房間；第一次啟用時產生 roomId（128 bit）與 hostSecret（256 bit）。
     * 兩個分頁同時第一次啟用時，readwrite transaction 依序執行，後到的讀到先到的那份。
     * @returns {Promise<{ roomId: string, hostSecret: string, createdAt: number }>}
     */
    async loadRoom() {
        const candidate = { key: ROOM_KEY, roomId: randomToken(16), hostSecret: randomToken(32), createdAt: this._now() };
        const db = await this._room.get();
        return runTransaction(db, [ROOM_STORE], 'readwrite', (tx, { set, step }) => {
            const store = tx.objectStore(ROOM_STORE);
            const current = store.get(ROOM_KEY);
            current.onsuccess = step(() => {
                if (current.result) {
                    set(current.result);
                    return;
                }
                store.put(candidate);
                set(candidate);
            });
        });
    }

    /**
     * 重新產生房間：新的 roomId 與 hostSecret，並撤銷所有授權（已配對的裝置、已入桌的手機都要重新設定）。
     * 舊的訂單 QR Code 也隨 hostSecret 一起失效。
     */
    async regenerateRoom() {
        // 先撤銷授權再換房間：中途失敗時，最壞情況是授權已撤銷但房間沒換（裝置要重新配對），不會留下仍有效的舊授權
        await this._revokeAllCredentials();
        const room = { key: ROOM_KEY, roomId: randomToken(16), hostSecret: randomToken(32), createdAt: this._now() };
        const roomDb = await this._room.get();
        await runTransaction(roomDb, [ROOM_STORE], 'readwrite', (tx) => tx.objectStore(ROOM_STORE).put(room));
        return room;
    }

    async _revokeAllCredentials() {
        const now = this._now();
        const db = await this._orders.get();
        await runTransaction(db, [STORE.CREDENTIALS, STORE.PAIRING], 'readwrite', (tx, { step }) => {
            const credentials = tx.objectStore(STORE.CREDENTIALS);
            const all = credentials.getAll();
            all.onsuccess = step(() => {
                for (const record of all.result) {
                    if (record.revokedAt == null) credentials.put({ ...record, revokedAt: now });
                }
            });
            tx.objectStore(STORE.PAIRING).clear();
        });
    }

    // ---------- 讀取 ----------

    async listProducts() {
        const db = await this._orders.get();
        return requestToPromise(db.transaction(STORE.PRODUCTS).objectStore(STORE.PRODUCTS).getAll());
    }

    /** 依取餐序號排序的全部訂單 */
    async listOrders() {
        const db = await this._orders.get();
        return requestToPromise(db.transaction(STORE.ORDERS).objectStore(STORE.ORDERS).index('sequence').getAll());
    }

    /** 這個身分是否已經用過這個 requestId（送單去重的同一個索引） */
    async hasOrderRequest(principal, requestId) {
        const db = await this._orders.get();
        const count = await requestToPromise(db.transaction(STORE.ORDERS).objectStore(STORE.ORDERS).index('principalRequest').count([principal, String(requestId ?? '')]));
        return count > 0;
    }

    async getOrder(id) {
        assertString(id, 'orderId');
        const db = await this._orders.get();
        return requestToPromise(db.transaction(STORE.ORDERS).objectStore(STORE.ORDERS).get(id));
    }

    /**
     * 全部桌位與各自最新的場次（不含入桌碼雜湊）。
     * @returns {Promise<Array<{ id: string, name: string, session: object | null }>>}
     */
    async listTables() {
        const db = await this._orders.get();
        return runTransaction(db, [STORE.TABLES, STORE.SESSIONS], 'readonly', (tx, { set, step }) => {
            const tables = tx.objectStore(STORE.TABLES).getAll();
            const sessions = tx.objectStore(STORE.SESSIONS).getAll();
            sessions.onsuccess = step(() => {
                const byTable = new Map();
                for (const session of sessions.result) byTable.set(session.tableId, [...(byTable.get(session.tableId) ?? []), session]);
                set(tables.result.map((table) => ({ ...table, session: publicSession(latestSession(byTable.get(table.id) ?? [])) })));
            });
        });
    }

    /** 店員裝置清單（不含 secret 雜湊） */
    async listDevices() {
        const db = await this._orders.get();
        const all = await requestToPromise(db.transaction(STORE.CREDENTIALS).objectStore(STORE.CREDENTIALS).getAll());
        return all.filter((record) => record.kind === CREDENTIAL_KIND.DEVICE).map(publicCredential);
    }

    // ---------- 桌位與用餐場次 ----------

    /**
     * 在 transaction 內讀出某張桌的最新場次，再交給 decide 判斷與寫入。
     * @param {IDBTransaction} tx
     * @param {string} tableId
     * @param {(session: object | null) => void} decide
     * @param {(fn: Function) => Function} step
     */
    _withLatestSession(tx, tableId, decide, step) {
        const request = tx.objectStore(STORE.SESSIONS).index('tableId').getAll(tableId);
        request.onsuccess = step(() => decide(latestSession(request.result)));
    }

    /**
     * 開桌：建立新的用餐場次與入桌碼。入桌碼只在這裡回傳一次，主機只保存雜湊。
     * @param {string} tableId
     * @returns {Promise<{ session: object, code: string }>}
     */
    async openTable(tableId) {
        assertString(tableId, 'tableId');
        const code = randomCode();
        const codeHash = await hashSecret(code);
        const id = this._generateId();
        const db = await this._orders.get();
        const session = await runTransaction(db, [STORE.TABLES, STORE.SESSIONS], 'readwrite', (tx, { set, step }) => {
            const table = tx.objectStore(STORE.TABLES).get(tableId);
            table.onsuccess = step(() => {
                if (!table.result) throw new PosError(POS_V2_ERROR_CODES.NOT_FOUND, `沒有這張桌：${tableId}`);
                this._withLatestSession(tx, tableId, (current) => {
                    const opened = openDiningSession({ id, tableId, codeHash, now: this._now(), current });
                    tx.objectStore(STORE.SESSIONS).add(opened);
                    set(opened);
                }, step);
            });
        });
        return { session: publicSession(session), code };
    }

    /** 關桌；重複關桌冪等 */
    async closeTable(tableId) {
        assertString(tableId, 'tableId');
        const db = await this._orders.get();
        const session = await runTransaction(db, [STORE.SESSIONS], 'readwrite', (tx, { set, step }) => {
            this._withLatestSession(tx, tableId, (current) => {
                const closed = closeDiningSession(current, this._now());
                if (closed !== current) tx.objectStore(STORE.SESSIONS).put(closed);
                set(closed);
            }, step);
        });
        return publicSession(session);
    }

    /** 輪換入桌碼：舊碼立即失效 */
    async rotateTableCode(tableId) {
        assertString(tableId, 'tableId');
        const code = randomCode();
        const codeHash = await hashSecret(code);
        const db = await this._orders.get();
        const session = await runTransaction(db, [STORE.SESSIONS], 'readwrite', (tx, { set, step }) => {
            this._withLatestSession(tx, tableId, (current) => {
                const rotated = rotateSessionCode(current, codeHash);
                tx.objectStore(STORE.SESSIONS).put(rotated);
                set(rotated);
            }, step);
        });
        return { session: publicSession(session), code };
    }

    /**
     * 以入桌碼取得入桌授權。嘗試次數限制由呼叫端（hub）負責；這裡只判斷對錯。
     * @param {{ tableId: string, code: string }} input
     * @returns {Promise<{ credential: { kind: 'table', id: string, secret: string }, session: object }>}
     */
    async joinTable({ tableId, code }) {
        assertString(tableId, 'tableId');
        if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new PosError(POS_V2_ERROR_CODES.CODE_INVALID, '入桌碼不正確');
        const codeHash = await hashSecret(code);
        const secret = randomToken();
        const secretHash = await hashSecret(secret);
        const id = this._generateId();
        const db = await this._orders.get();
        const session = await runTransaction(db, [STORE.SESSIONS, STORE.CREDENTIALS], 'readwrite', (tx, { set, step }) => {
            this._withLatestSession(tx, tableId, (current) => {
                const joined = decideTableJoin({ session: current, codeHash });
                tx.objectStore(STORE.CREDENTIALS).add(createTableCredential({
                    id, secretHash, tableId, diningSessionId: joined.id, now: this._now(),
                }));
                set(joined);
            }, step);
        });
        return { credential: { kind: CREDENTIAL_KIND.TABLE, id, secret }, session: publicSession(session) };
    }

    // ---------- 配對與店員裝置授權 ----------

    /**
     * 建立配對票：配對 token（放進配對 QR Code）與數字連線碼，期限內可以重複使用。順便清掉過期的票。
     * @returns {Promise<{ id: string, token: string, code: string, expiresAt: number }>}
     */
    async createPairing() {
        const token = randomToken();
        const code = randomCode();
        const [tokenHash, codeHash] = await Promise.all([hashSecret(token), hashSecret(code)]);
        const ticket = createPairingTicket({ id: this._generateId(), tokenHash, codeHash, now: this._now() });
        const db = await this._orders.get();
        await runTransaction(db, [STORE.PAIRING], 'readwrite', (tx, { step }) => {
            const store = tx.objectStore(STORE.PAIRING);
            const all = store.getAll();
            all.onsuccess = step(() => {
                for (const old of all.result) if (this._now() >= old.expiresAt) store.delete(old.id);
                store.add(ticket);
            });
        });
        return { id: ticket.id, token, code, expiresAt: ticket.expiresAt };
    }

    /**
     * 以配對 token 或連線碼找出有效的配對票。連線碼錯誤回 CODE_INVALID（計入嘗試次數）；
     * 找不到 token 或票已過期回 PAIRING_EXPIRED。
     * @param {{ token?: string, code?: string }} input
     * @returns {Promise<{ id: string, expiresAt: number }>}
     */
    async findPairing({ token, code }) {
        const byToken = typeof token === 'string' && token !== '';
        if (!byToken && (typeof code !== 'string' || !/^\d{6}$/.test(code))) {
            throw new PosError(POS_V2_ERROR_CODES.CODE_INVALID, '連線碼不正確');
        }
        const hash = await hashSecret(byToken ? token : code);
        const db = await this._orders.get();
        const tickets = await requestToPromise(db.transaction(STORE.PAIRING).objectStore(STORE.PAIRING).getAll());
        const ticket = tickets.find((t) => safeEqual(byToken ? t.tokenHash : t.codeHash, hash));
        if (!ticket && !byToken) throw new PosError(POS_V2_ERROR_CODES.CODE_INVALID, '連線碼不正確');
        assertPairingValid(ticket, this._now());
        return { id: ticket.id, expiresAt: ticket.expiresAt };
    }

    /**
     * 管理端核准後簽發店員裝置授權。廚房站台名稱在未撤銷的裝置中必須唯一。
     * @param {{ role: string, station?: string | null, label?: string }} input
     * @returns {Promise<{ credential: { kind: 'device', id: string, secret: string }, device: object }>}
     */
    async approveDevice({ role, station = null, label = '' }) {
        const secret = randomToken();
        const secretHash = await hashSecret(secret);
        const record = createDeviceCredential({ id: this._generateId(), secretHash, role, station, label, now: this._now() });
        const db = await this._orders.get();
        await runTransaction(db, [STORE.CREDENTIALS], 'readwrite', (tx, { step }) => {
            const store = tx.objectStore(STORE.CREDENTIALS);
            const all = store.getAll();
            all.onsuccess = step(() => {
                const taken = record.station && all.result.some((other) => other.kind === CREDENTIAL_KIND.DEVICE
                    && other.revokedAt == null && other.station === record.station);
                if (taken) throw new PosError(POS_V2_ERROR_CODES.CONFLICT, `站台 ${record.station} 已有裝置使用`);
                store.add(record);
            });
        });
        return { credential: { kind: CREDENTIAL_KIND.DEVICE, id: record.id, secret }, device: publicCredential(record) };
    }

    /** 撤銷授權；重複撤銷冪等 */
    async revokeCredential(id) {
        assertString(id, 'credential id');
        const db = await this._orders.get();
        return runTransaction(db, [STORE.CREDENTIALS], 'readwrite', (tx, { set, step }) => {
            const store = tx.objectStore(STORE.CREDENTIALS);
            const current = store.get(id);
            current.onsuccess = step(() => {
                if (!current.result) throw new PosError(POS_V2_ERROR_CODES.NOT_FOUND, '找不到授權');
                const revoked = current.result.revokedAt == null ? { ...current.result, revokedAt: this._now() } : current.result;
                store.put(revoked);
                set(publicCredential(revoked));
            });
        });
    }

    /**
     * 驗證連線帶來的授權（種類、id、secret）。回傳的紀錄就是之後送單與動作用的 grant。
     * @param {{ kind: string, id: string, secret: string }} presented
     */
    async verifyCredential(presented) {
        if (!presented || !Object.values(CREDENTIAL_KIND).includes(presented.kind)) {
            throw new PosError(POS_V2_ERROR_CODES.UNAUTHORIZED, '授權格式不正確');
        }
        assertString(presented.id, 'credential id');
        assertString(presented.secret, 'credential secret');
        const presentedHash = await hashSecret(presented.secret);
        const db = await this._orders.get();
        const record = await requestToPromise(db.transaction(STORE.CREDENTIALS).objectStore(STORE.CREDENTIALS).get(presented.id));
        verifyCredential(record?.kind === presented.kind ? record : undefined, presentedHash);
        return publicCredential(record);
    }

    /**
     * 驗證訂單查詢 token。
     * @param {{ orderId: string, token: string }} input
     * @returns {Promise<object>} 訂單
     */
    async verifyViewToken({ orderId, token }) {
        assertString(orderId, 'orderId');
        const { hostSecret } = await this.loadRoom();
        const expected = await deriveViewToken(hostSecret, orderId);
        const order = await this.getOrder(orderId);
        if (!order || !safeEqual(expected, token)) throw new PosError(POS_V2_ERROR_CODES.UNAUTHORIZED, '訂單查詢連結無效');
        return order;
    }

    // ---------- 訂單 ----------

    /**
     * 送單（協定規格 5.4）。同一個 transaction 內：重新讀出授權（送單前被撤銷就拒絕）→ 以 `[principal, requestId]`
     * 查既有訂單 → 讀出相關場次 → 依 `decidePlaceOrder` 判斷 → 建立訂單並遞增取餐序號。
     * 店員裝置建立的訂單另外回傳查詢 token（交接用的訂單 QR Code）。
     * @param {{ grant: object, items: Array<{ productId: string, qty: number }>, requestId: string, tableId?: string | null }} input
     * @returns {Promise<{ result: 'applied' | 'noop', order: object, viewToken?: string }>}
     */
    async placeOrder({ grant, items, requestId, tableId = null }) {
        const principal = principalOf(grant);
        const orderId = this._generateId();
        const db = await this._orders.get();
        const outcome = await runTransaction(db, [STORE.ORDERS, STORE.PRODUCTS, STORE.META, STORE.SESSIONS, STORE.CREDENTIALS], 'readwrite', (tx, { set, step }) => {
            const credential = tx.objectStore(STORE.CREDENTIALS).get(grant.id);
            credential.onsuccess = step(() => {
                const current = credential.result;
                if (!current || current.kind !== grant.kind || current.revokedAt != null) {
                    throw new PosError(POS_V2_ERROR_CODES.UNAUTHORIZED, '授權無效或已撤銷');
                }
                const orders = tx.objectStore(STORE.ORDERS);
                const existing = orders.index('principalRequest').get([principal, String(requestId ?? '')]);
                existing.onsuccess = step(() => {
                    const decideWith = (session) => {
                        const decision = decidePlaceOrder({ existing: existing.result, grant: current, session, tableId });
                        if (decision.result === 'noop') {
                            set(decision);
                            return;
                        }
                        const products = tx.objectStore(STORE.PRODUCTS).getAll();
                        products.onsuccess = step(() => {
                            const meta = tx.objectStore(STORE.META);
                            const counter = meta.get(SEQUENCE_KEY);
                            counter.onsuccess = step(() => {
                                const sequence = (counter.result?.value ?? 0) + 1;
                                const base = createOrder({ items, requestId, id: orderId, sequence, now: this._now(), by: principal }, products.result);
                                const order = withV2Fields(base, decision.fields);
                                orders.add(order);
                                meta.put({ key: SEQUENCE_KEY, value: sequence });
                                set({ result: 'applied', order });
                            });
                        });
                    };
                    if (existing.result) {
                        decideWith(null);
                    } else if (current.kind === CREDENTIAL_KIND.TABLE) {
                        const session = tx.objectStore(STORE.SESSIONS).get(current.diningSessionId);
                        session.onsuccess = step(() => decideWith(session.result ?? null));
                    } else if (tableId != null && tableId !== '') {
                        this._withLatestSession(tx, String(tableId), decideWith, step);
                    } else {
                        decideWith(null);
                    }
                });
            });
        });
        if (outcome.order.source === 'device') {
            const { hostSecret } = await this.loadRoom();
            return { ...outcome, viewToken: await deriveViewToken(hostSecret, outcome.order.id) };
        }
        return outcome;
    }

    /**
     * 對訂單執行動作（沿用第一代的 decideTransition）。遠端站台是否離線由 hub 依在線狀態判斷後才呼叫 takeover。
     * @param {string} orderId
     * @param {{ action: string, actor: string, fromStation?: string }} request
     */
    async transition(orderId, { action, actor, fromStation }) {
        assertString(orderId, 'orderId');
        const db = await this._orders.get();
        return runTransaction(db, [STORE.ORDERS], 'readwrite', (tx, { set, step }) => {
            const orders = tx.objectStore(STORE.ORDERS);
            const current = orders.get(orderId);
            current.onsuccess = step(() => {
                const decision = decideTransition(current.result, { action, actor, fromStation, now: this._now() });
                if (decision.result === 'applied') orders.put(decision.order);
                set(decision);
            });
        });
    }

    /**
     * 重設 demo 資料：只刪除訂單資料庫（訂單、桌位場次、授權、配對票），保留房間。
     * @returns {Promise<object>} resetSolutionData 的報告
     */
    async reset() {
        this._orders.close();
        return resetSolutionData({ databases: [this.dbName] });
    }
}

/**
 * @param {ConstructorParameters<typeof PosV2Repository>[0]} options
 * @returns {PosV2Repository}
 */
export function createPosV2Repository(options) {
    return new PosV2Repository(options);
}
