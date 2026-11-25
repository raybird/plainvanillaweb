/**
 * Solutions reference app 共用慣例（ADR 0108、docs/solutions/conventions.md）。
 *
 * 只收各範例都要遵守、值得統一的幾件事：路由與 namespace 命名、儲存名稱、
 * 開啟角色視窗、能力偵測、資源釋放與資料重設。不是框架：範例的狀態、畫面與資料模型各自負責。
 *
 * 匯入零副作用；瀏覽器 API 只在呼叫時才使用，Node 測試可直接匯入。
 */
import { setKioskMode } from '../../../app/kiosk.js';

/** 所有 Solutions 路由的共同前綴 */
export const SOLUTION_ROUTE_PREFIX = '/solutions';

/** Solutions 擁有的 IndexedDB／localStorage 名稱前綴，重設與除錯時用來辨識 */
export const SOLUTION_STORAGE_PREFIX = 'vanilla_solution';

const SLUG_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const NAMESPACE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * @param {string} value
 * @param {string} label
 */
function assertSlug(value, label) {
    if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
        throw new TypeError(`${label} 必須是小寫英數與連字號，以字母開頭、最多 32 字：${value}`);
    }
}

/**
 * 範例的協作 namespace：預設 `solution-<slug>`；hash query 的 `ns` 可覆寫，
 * 讓測試或並排展示使用互不干擾的資料。格式不合法的 `ns` 直接忽略，改用預設值。
 * namespace 只用來隔離資料，不是安全邊界（同源頁面都能讀寫）。
 * @param {string} slug 範例代號，例如 `pos`
 * @param {string} [hash] 預設讀 `location.hash`
 * @returns {string}
 */
export function resolveNamespace(slug, hash = globalThis.location?.hash ?? '') {
    assertSlug(slug, 'slug');
    const raw = String(hash).replace(/^#/, '');
    const index = raw.indexOf('?');
    const ns = index === -1 ? null : new URLSearchParams(raw.slice(index + 1)).get('ns')?.trim();
    return ns && NAMESPACE_PATTERN.test(ns) ? ns : `solution-${slug}`;
}

/**
 * 範例自有儲存（IndexedDB 資料庫名稱、localStorage key）的名稱，一律由 namespace 推導，
 * 換 namespace 就換一份資料。
 * @param {string} namespace `resolveNamespace()` 的結果
 * @param {string} purpose 用途代號，例如 `orders`、`blobs`
 * @returns {string} 例如 `vanilla_solution:solution-pos:orders`
 */
export function solutionStorageName(namespace, purpose) {
    if (typeof namespace !== 'string' || !NAMESPACE_PATTERN.test(namespace)) {
        throw new TypeError(`namespace 格式不合法：${namespace}`);
    }
    assertSlug(purpose, 'purpose');
    return `${SOLUTION_STORAGE_PREFIX}:${namespace}:${purpose}`;
}

/**
 * 組出範例內的 hash 連結，保留 namespace 與 kiosk 版面設定。
 * @param {string} path 必須以 `/solutions/` 開頭，例如 `/solutions/pos/kitchen`
 * @param {{ ns?: string, kiosk?: boolean }} [options]
 * @returns {string} 以 `#` 開頭的 hash
 */
export function buildSolutionHash(path, { ns, kiosk = false } = {}) {
    if (typeof path !== 'string' || !path.startsWith(`${SOLUTION_ROUTE_PREFIX}/`) || /[?#]/.test(path)) {
        throw new TypeError(`Solutions 路徑必須以 ${SOLUTION_ROUTE_PREFIX}/ 開頭且不含 ? 或 #：${path}`);
    }
    const params = new URLSearchParams();
    if (ns !== undefined) {
        if (!NAMESPACE_PATTERN.test(ns)) throw new TypeError(`namespace 格式不合法：${ns}`);
        params.set('ns', ns);
    }
    const search = params.toString();
    return setKioskMode(`#${path}${search ? `?${search}` : ''}`, kiosk);
}

/**
 * 開啟（或聚焦同名的）角色視窗。視窗名稱固定，重複點擊會重用同一個視窗而不是越開越多。
 * 瀏覽器擋下彈出視窗時 `window` 為 `null`，呼叫端要改為顯示 `url` 讓使用者自己開。
 * @param {string} path 見 `buildSolutionHash`
 * @param {{ name: string, ns?: string, kiosk?: boolean, features?: string }} options
 * @returns {{ url: string, window: Window | null }}
 */
export function openSolutionWindow(path, { name, ns, kiosk = true, features = 'popup,width=960,height=720' }) {
    assertSlug(name, 'name');
    const url = new URL(buildSolutionHash(path, { ns, kiosk }), document.baseURI).href;
    const opened = window.open(url, `${SOLUTION_STORAGE_PREFIX}-${name}`, features);
    return { url, window: opened ?? null };
}

/**
 * 逐項執行能力偵測；偵測函式拋錯視同不支援。
 * @param {Record<string, () => boolean>} checks
 * @returns {{ supported: Record<string, boolean>, missing: string[] }}
 */
export function detectFeatures(checks) {
    const supported = {};
    for (const [name, check] of Object.entries(checks)) {
        try {
            supported[name] = Boolean(check());
        } catch {
            supported[name] = false;
        }
    }
    return { supported, missing: Object.keys(supported).filter((name) => !supported[name]) };
}

/**
 * 資源釋放清單：開啟資源時登記釋放函式，`disconnectedCallback` 呼叫 `run()` 依相反順序釋放。
 * 單一釋放函式失敗不影響其他項目，錯誤彙整後回傳。`run()` 之後可再登記、再執行。
 * @returns {{ add: (dispose: () => any) => () => any, run: () => Promise<unknown[]>, readonly size: number }}
 */
export function createTeardown() {
    let stack = [];
    return {
        add(dispose) {
            if (typeof dispose !== 'function') throw new TypeError('dispose 必須是函式');
            stack.push(dispose);
            return dispose;
        },
        async run() {
            const pending = stack.reverse();
            stack = [];
            const errors = [];
            for (const dispose of pending) {
                try {
                    await dispose();
                } catch (err) {
                    errors.push(err);
                }
            }
            return errors;
        },
        get size() {
            return stack.length;
        },
    };
}

/**
 * 刪除一個 IndexedDB 資料庫。其他視窗仍開著連線時會先收到 `versionchange`；
 * 依慣例每個連線都要在 `onversionchange` 裡 `close()`，否則刪除會卡住，逾時後回報 `blocked`。
 * @param {string} name
 * @param {number} timeoutMs
 * @returns {Promise<'deleted' | 'blocked'>}
 */
function deleteDatabase(name, timeoutMs) {
    return new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.deleteDatabase(name);
        const timer = setTimeout(() => resolve('blocked'), timeoutMs);
        request.onsuccess = () => {
            clearTimeout(timer);
            resolve('deleted');
        };
        request.onerror = () => {
            clearTimeout(timer);
            reject(request.error ?? new Error(`無法刪除 IndexedDB：${name}`));
        };
    });
}

/**
 * 重設範例資料：刪除範例自有的 IndexedDB 資料庫與 localStorage key，再執行額外清理
 * （例如共用佇列 `DurableTaskQueue#clearNamespace()`）。呼叫前先關閉自己的連線，
 * 並通知其他視窗關閉或重新載入。
 * @param {{ databases?: string[], storageKeys?: string[], cleanups?: Array<() => any>, timeoutMs?: number }} plan
 * @returns {Promise<{ databases: Record<string, 'deleted' | 'blocked' | 'unsupported'>, storageKeys: string[], errors: unknown[] }>}
 */
export async function resetSolutionData({ databases = [], storageKeys = [], cleanups = [], timeoutMs = 3000 } = {}) {
    const report = { databases: {}, storageKeys: [], errors: [] };
    for (const name of databases) {
        if (!globalThis.indexedDB) {
            report.databases[name] = 'unsupported';
            continue;
        }
        try {
            report.databases[name] = await deleteDatabase(name, timeoutMs);
        } catch (err) {
            report.errors.push(err);
        }
    }
    for (const key of storageKeys) {
        try {
            globalThis.localStorage?.removeItem(key);
            report.storageKeys.push(key);
        } catch (err) {
            report.errors.push(err);
        }
    }
    for (const cleanup of cleanups) {
        try {
            await cleanup();
        } catch (err) {
            report.errors.push(err);
        }
    }
    return report;
}
