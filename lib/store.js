import { BaseService } from './base-service.js';
import { broadcastService } from './broadcast-service.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** 只有純物件與陣列需要深層監控；Date、Map 等無法 JSON 持久化，維持原樣 */
function isPlainContainer(value) {
    if (value === null || typeof value !== 'object') return false;
    if (Array.isArray(value)) return true;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/** 僅純物件（非陣列）可作為 Store 根狀態或快照 */
function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/** 過濾原型鏈污染風險鍵名 */
function isSafeKey(key) {
    return typeof key === 'string' && key.length > 0 && !FORBIDDEN_KEYS.has(key);
}

/** 深拷貝純物件／陣列，同時排除禁用鍵名，確保不將外部可變參照或原型污染帶入 _baseState */
function cloneCleanValue(value, raws) {
    const raw = raws?.get(value) ?? value;
    if (Array.isArray(raw)) {
        return raw.map((item) => cloneCleanValue(item, raws));
    }
    if (isPlainObject(raw)) {
        const out = {};
        for (const k of Object.keys(raw)) {
            if (!isSafeKey(k)) continue;
            out[k] = cloneCleanValue(raw[k], raws);
        }
        return out;
    }
    if (raw !== null && typeof raw === 'object' && typeof globalThis.structuredClone === 'function') {
        try {
            return globalThis.structuredClone(raw);
        } catch {
            return raw;
        }
    }
    return raw;
}

function sanitizePlainObject(obj, raws) {
    const clean = {};
    for (const key of Object.keys(obj)) {
        if (!isSafeKey(key)) continue;
        clean[key] = cloneCleanValue(obj[key], raws);
    }
    return clean;
}

function readPersistedObject(storageKey) {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return isPlainObject(parsed) ? sanitizePlainObject(parsed) : null;
    } catch {
        return null;
    }
}

function clockStorageKey(storageKey) {
    return `__vanilla_store_clock__:${storageKey}`;
}

function readPersistedClock(storageKey) {
    if (typeof localStorage === 'undefined') return 0;
    try {
        const raw = localStorage.getItem(clockStorageKey(storageKey));
        if (!raw) return 0;
        const num = Number(raw);
        return Number.isSafeInteger(num) && num >= 0 ? num : 0;
    } catch {
        return 0;
    }
}

function writePersistedClock(storageKey, clock) {
    if (typeof localStorage === 'undefined') return;
    if (!Number.isSafeInteger(clock) || clock <= 0) return;
    try {
        const prev = readPersistedClock(storageKey);
        if (clock > prev) {
            localStorage.setItem(clockStorageKey(storageKey), String(clock));
        }
    } catch {
        // 忽略儲存配額或受限環境寫入例外，避免中斷記憶體狀態與跨分頁同步
    }
}

/**
 * 比較遠端 LWW 版本是否嚴格領先目前本地記錄。
 * @param {{ clock: number, sender: string } | undefined} current
 * @param {number} incomingClock
 * @param {string} incomingSender
 * @returns {boolean}
 */
function isNewerVersion(current, incomingClock, incomingSender) {
    if (!current) return true;
    if (incomingClock !== current.clock) return incomingClock > current.clock;
    return incomingSender > current.sender;
}

/**
 * Store - 反應式 Proxy 狀態容器，支援 localStorage 持久化與跨分頁同步。
 *
 * 同步與隔離語意：
 * - 所有跨分頁訊息皆以 `storageKey` 隔離，避免多個 Store 相互污染。
 * - 頂層屬性刪除會以 `deleted: true` 同步，在遠端實際執行 `delete`。
 * - 並行寫入不同頂層鍵時透過 `_syncKey()` 增量合併持久化；同一頂層鍵衝突採 HLC + 獨立持久化基線與 sender 字典序 LWW。
 * - 動態建立的 Store 應呼叫 `dispose()` 解除對廣播通道的監聽。
 */
export class Store extends BaseService {
    /**
     * @param {object} [initialState] 初始狀態純物件
     * @param {string} [storageKey] localStorage 鍵名與同步隔離識別鍵
     * @param {object} [options]
     * @param {import('./broadcast-channel.js').BroadcastService | null} [options.broadcast] 自訂 BroadcastService（預設使用全域單例；傳入 null 可關閉跨分頁同步）
     * @param {boolean} [options.sync] 是否啟用跨分頁同步（預設 true）
     * @param {boolean} [options.acceptLegacy] 是否接受未帶 storageKey 的舊版訊息（預設僅 storageKey === 'app_state' 為 true）
     */
    constructor(initialState = {}, storageKey = 'app_state', options = {}) {
        super();
        if (!isPlainObject(initialState)) {
            throw new TypeError('Store initialState must be a plain object');
        }
        if (typeof storageKey !== 'string' || storageKey.trim().length === 0) {
            throw new TypeError('Store storageKey must be a non-empty string');
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('Store options must be a plain object');
        }

        this.storageKey = storageKey;
        const saved = readPersistedObject(this.storageKey);
        const initial = sanitizePlainObject(initialState);
        const baseState = saved ? { ...initial, ...saved } : initial;
        this._baseState = baseState; // 保存底層引用（永遠是純物件，可直接結構化複製與跨分頁傳送）

        // 頂層屬性 -> (底層物件 -> Proxy)：讓 state.a === state.a 成立，且同一物件掛在不同頂層屬性下時各自回報正確的 key
        this._proxies = new Map();
        // Proxy -> 底層物件：寫入時解包，確保底層永遠不含 Proxy
        this._raws = new WeakMap();
        this.state = this._wrap(baseState, null);

        // HLC 基線從獨立持久化時鐘鍵繼承，確保新開／重整分頁的寫入不會因時鐘歸零而被既有分頁拒收
        this._clock = readPersistedClock(this.storageKey);
        this._keyVersions = new Map();
        this._disposed = false;
        this._acceptLegacy =
            options.acceptLegacy !== undefined ? Boolean(options.acceptLegacy) : storageKey === 'app_state';

        const syncEnabled = options.sync !== false;
        if (!syncEnabled || options.broadcast === null) {
            this._broadcast = null;
        } else if (options.broadcast !== undefined) {
            if (
                typeof options.broadcast !== 'object' ||
                typeof options.broadcast.post !== 'function' ||
                typeof options.broadcast.addEventListener !== 'function' ||
                typeof options.broadcast.removeEventListener !== 'function'
            ) {
                throw new TypeError('Store options.broadcast must be a BroadcastService-compatible instance');
            }
            this._broadcast = options.broadcast;
        } else {
            this._broadcast = broadcastService;
        }

        if (this._broadcast) {
            this._onBroadcastMessage = (e) => this._handleRemoteMessage(e.detail);
            this._broadcast.addEventListener('message', this._onBroadcastMessage);
        } else {
            this._onBroadcastMessage = null;
        }
    }

    /**
     * 推進單調混合邏輯時鐘 (HLC) 並寫入獨立持久化基線
     * @private
     * @returns {number}
     */
    _nextClock() {
        this._clock = Math.max(Date.now(), this._clock + 1);
        writePersistedClock(this.storageKey, this._clock);
        return this._clock;
    }

    /**
     * 以 Proxy 包裝狀態物件。巢狀的純物件與陣列在讀取時才延遲包裝，
     * 任何層級的寫入都會以頂層屬性為單位持久化、發送事件與廣播。
     * @private
     * @param {object} target 底層純物件
     * @param {string|null} rootKey 所屬的頂層屬性名稱；null 表示 target 就是頂層狀態
     */
    _wrap(target, rootKey) {
        if (!this._proxies.has(rootKey)) this._proxies.set(rootKey, new WeakMap());
        const cache = this._proxies.get(rootKey);
        const cached = cache.get(target);
        if (cached) return cached;

        const proxy = new Proxy(target, {
            get: (t, key) => {
                const value = t[key];
                return isPlainContainer(value) ? this._wrap(value, rootKey ?? key) : value;
            },
            set: (t, key, value) => {
                if (typeof key === 'symbol' || !isSafeKey(key)) {
                    throw new TypeError(`Unsafe Store property key: ${String(key)}`);
                }
                // 保留既有內部 Proxy 別名（例如 store.state.b = store.state.a），外部純容器則深層清理禁用鍵與斷開參照
                const raw = this._raws.has(value)
                    ? this._raws.get(value)
                    : isPlainContainer(value)
                        ? cloneCleanValue(value, this._raws)
                        : value;
                if (t[key] === raw) return true;
                t[key] = raw;
                this._commit(rootKey ?? key);
                return true;
            },
            deleteProperty: (t, key) => {
                if (typeof key === 'symbol' || !isSafeKey(key)) {
                    throw new TypeError(`Unsafe Store property key: ${String(key)}`);
                }
                if (!Object.prototype.hasOwnProperty.call(t, key)) return true;
                delete t[key];
                this._commit(rootKey ?? key);
                return true;
            }
        });

        cache.set(target, proxy);
        this._raws.set(proxy, target);
        return proxy;
    }

    /**
     * 處理來自其他分頁的狀態同步與快照訊息
     * @private
     * @param {object} msg
     */
    _handleRemoteMessage(msg) {
        if (this._disposed || !isPlainObject(msg)) return;
        const { type, payload, sender } = msg;
        if (!isPlainObject(payload)) return;
        const senderId = typeof sender === 'string' && sender.length > 0 ? sender : 'remote';

        if (type === 'sync_state') {
            this._applyRemoteState(payload, senderId);
        } else if (type === 'sync_snapshot') {
            this._applyRemoteSnapshot(payload, senderId);
        }
    }

    /** @private */
    _applyRemoteState(payload, sender) {
        if (!isSafeKey(payload.key)) return;

        if ('storageKey' in payload) {
            if (typeof payload.storageKey !== 'string' || payload.storageKey !== this.storageKey) return;
        } else if (!this._acceptLegacy) {
            return;
        }

        const { key } = payload;
        const hasClock = typeof payload.clock === 'number' && Number.isFinite(payload.clock);
        if (hasClock) {
            if (!isNewerVersion(this._keyVersions.get(key), payload.clock, sender)) {
                // 若落敗方在廣播抵達前先把舊值寫入 localStorage 後離線，勝出方收到落敗訊息時須主動修復持久化
                const hasKey = Object.prototype.hasOwnProperty.call(this._baseState, key);
                this._syncKey(key, hasKey ? this._baseState[key] : undefined, !hasKey);
                return;
            }
            this._clock = Math.max(this._clock, payload.clock);
            writePersistedClock(this.storageKey, this._clock);
            this._keyVersions.set(key, { clock: payload.clock, sender });
        } else {
            this._nextClock();
            this._keyVersions.set(key, { clock: this._clock, sender });
        }

        const deleted = payload.deleted === true;
        if (deleted) {
            delete this._baseState[key];
        } else {
            this._baseState[key] = cloneCleanValue(payload.value, this._raws);
        }

        const value = deleted ? undefined : this._baseState[key];
        this._syncKey(key, value, deleted);
        this.emit('change', {
            key,
            value,
            deleted,
            state: this._baseState,
            remote: true,
            sender,
        });
    }

    /** @private */
    _applyRemoteSnapshot(payload, sender) {
        let snapshot;
        let replace;
        let incomingClock;

        if ('storageKey' in payload) {
            if (typeof payload.storageKey !== 'string' || payload.storageKey !== this.storageKey) return;
            if (!isPlainObject(payload.snapshot)) return;
            snapshot = sanitizePlainObject(payload.snapshot, this._raws);
            replace = payload.replace !== false;
            incomingClock =
                typeof payload.clock === 'number' && Number.isFinite(payload.clock) ? payload.clock : undefined;
        } else if (this._acceptLegacy) {
            snapshot = sanitizePlainObject(payload, this._raws);
            replace = false;
            incomingClock = undefined;
        } else {
            return;
        }

        let changed = false;
        let rejectedAny = false;
        if (incomingClock !== undefined) {
            this._clock = Math.max(this._clock, incomingClock);
            if (replace) {
                for (const existingKey of Object.keys(this._baseState)) {
                    if (Object.prototype.hasOwnProperty.call(snapshot, existingKey)) continue;
                    if (isNewerVersion(this._keyVersions.get(existingKey), incomingClock, sender)) {
                        delete this._baseState[existingKey];
                        this._keyVersions.set(existingKey, { clock: incomingClock, sender });
                        changed = true;
                    } else {
                        rejectedAny = true;
                    }
                }
            }
            for (const key of Object.keys(snapshot)) {
                if (isNewerVersion(this._keyVersions.get(key), incomingClock, sender)) {
                    this._baseState[key] = snapshot[key];
                    this._keyVersions.set(key, { clock: incomingClock, sender });
                    changed = true;
                } else {
                    rejectedAny = true;
                }
            }
            if (!changed) {
                if (rejectedAny) this._syncMergedKeys();
                return;
            }
            writePersistedClock(this.storageKey, this._clock);
        } else {
            this._nextClock();
            if (replace) {
                for (const existingKey of Object.keys(this._baseState)) {
                    if (!Object.prototype.hasOwnProperty.call(snapshot, existingKey)) {
                        delete this._baseState[existingKey];
                        this._keyVersions.set(existingKey, { clock: this._clock, sender });
                    }
                }
            }
            for (const key of Object.keys(snapshot)) {
                this._baseState[key] = snapshot[key];
                this._keyVersions.set(key, { clock: this._clock, sender });
            }
        }

        if (replace) {
            this._sync();
        } else {
            this._syncMergedKeys();
        }
        this.emit('change', {
            state: this._baseState,
            isSnapshot: true,
            replace,
            remote: true,
            sender,
        });
    }

    /**
     * 頂層屬性（含其巢狀內容）變更後：持久化、發送事件、廣播給其他分頁
     * @private
     */
    _commit(key) {
        const deleted = !Object.prototype.hasOwnProperty.call(this._baseState, key);
        const value = deleted ? undefined : this._baseState[key];

        this._nextClock();
        const sender = this._broadcast?.tabId ?? 'local';
        this._keyVersions.set(key, { clock: this._clock, sender });

        this._syncKey(key, value, deleted);
        this.emit('change', { key, value, deleted, state: this._baseState });

        if (!this._disposed && this._broadcast) {
            const payload = deleted
                ? { storageKey: this.storageKey, key, deleted: true, clock: this._clock }
                : { storageKey: this.storageKey, key, value, deleted: false, clock: this._clock };
            this._broadcast.post('sync_state', payload);
        }
    }

    /**
     * 以目前 _baseState 合併 localStorage 內尚未在本分頁出現的併行鍵後寫回，
     * 同時不復活任何曾在本分頁追蹤或刪除的鍵。
     * @private
     * @param {{ key: string, value: any, deleted: boolean } | null} override
     */
    _writeMergedStorage(override) {
        if (typeof localStorage === 'undefined') return;
        const persisted = readPersistedObject(this.storageKey);
        const next = {};
        if (persisted) {
            for (const k of Object.keys(persisted)) {
                if (!this._keyVersions.has(k) || Object.prototype.hasOwnProperty.call(this._baseState, k)) {
                    next[k] = persisted[k];
                }
            }
        }
        for (const k of Object.keys(this._baseState)) {
            next[k] = this._baseState[k];
        }
        if (override) {
            if (override.deleted) {
                delete next[override.key];
            } else {
                next[override.key] = override.value;
            }
        }
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(next));
        } catch {
            // 忽略儲存配額或受限環境寫入例外
        }
    }

    /** @private */
    _syncMergedKeys() {
        this._writeMergedStorage(null);
    }

    /**
     * 以單一頂層鍵為單位合併寫入 localStorage，減少不同鍵並行更新時整包覆寫遺失資料的風險。
     * @private
     */
    _syncKey(key, value, deleted) {
        this._writeMergedStorage({ key, value, deleted });
    }

    _sync() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this._baseState));
        } catch {
            // 忽略儲存配額或受限環境寫入例外
        }
    }

    /**
     * 應用狀態快照 (Undo/Redo)。預設採用完整替換語意（移除快照外多餘的頂層鍵）。
     * @param {object} snapshot 純物件快照
     * @param {{ replace?: boolean }} [options] `replace: false` 可改為僅合併快照內鍵值
     */
    applySnapshot(snapshot, options = {}) {
        if (!isPlainObject(snapshot)) {
            throw new TypeError('Store snapshot must be a plain object');
        }
        if (options !== undefined && !isPlainObject(options)) {
            throw new TypeError('applySnapshot options must be a plain object');
        }

        const replace = options.replace !== false;
        const clean = sanitizePlainObject(snapshot, this._raws);

        this._nextClock();
        const sender = this._broadcast?.tabId ?? 'local';

        if (replace) {
            for (const existingKey of Object.keys(this._baseState)) {
                if (!Object.prototype.hasOwnProperty.call(clean, existingKey)) {
                    delete this._baseState[existingKey];
                    this._keyVersions.set(existingKey, { clock: this._clock, sender });
                }
            }
        }

        for (const key of Object.keys(clean)) {
            this._baseState[key] = clean[key];
            this._keyVersions.set(key, { clock: this._clock, sender });
        }

        if (replace) {
            this._sync();
        } else {
            this._syncMergedKeys();
        }
        this.emit('change', { state: this._baseState, isSnapshot: true, replace });

        if (!this._disposed && this._broadcast) {
            this._broadcast.post('sync_snapshot', {
                storageKey: this.storageKey,
                snapshot: clean,
                replace,
                clock: this._clock,
            });
        }
    }

    /**
     * 解除廣播通道監聽並清理透過 `on()` 註冊的監聽器（具冪等性）
     */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        if (this._broadcast && this._onBroadcastMessage) {
            this._broadcast.removeEventListener('message', this._onBroadcastMessage);
        }
        this._onBroadcastMessage = null;
        this._broadcast = null;

        for (const entries of this._listenersMap.values()) {
            for (const { type, wrapper } of entries) {
                this.removeEventListener(type, wrapper);
            }
        }
        this._listenersMap.clear();
    }

    // 快取相關方法
    setCache(key, data, ttlMinutes = 5) {
        const entry = {
            data,
            expiry: Date.now() + (ttlMinutes * 60 * 1000)
        };
        localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
    }

    getCache(key) {
        const raw = localStorage.getItem(`cache_${key}`);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (Date.now() > entry.expiry) {
            localStorage.removeItem(`cache_${key}`);
            return null;
        }
        return entry.data;
    }
}

export const appStore = new Store({
    count: 0,
    theme: 'system', // 預設跟隨系統
    primaryColor: '#007bff', // 預設藍色
    lastSearch: '',
    userProfile: {
        name: 'Raybird', // 預設使用者名稱
        bio: 'Vanilla Web Enthusiast | TeleNexus User',
        avatar: 'assets/images/user-profile.jpg'
    }
});
