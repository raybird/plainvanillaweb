/**
 * Kiosk 版面（ADR 0108）：hash query 帶 `kiosk=1` 時，`<x-app>` 不渲染側邊欄、漢堡按鈕與頁尾，
 * 主內容佔滿視窗。供 Solutions 的多視窗角色畫面（例如 POS 的點餐、叫號）使用。
 *
 * 純函式、匯入零副作用，Node 測試可直接匯入。
 */

/** hash query 中啟用 kiosk 版面的參數名稱 */
export const KIOSK_PARAM = 'kiosk';

/**
 * 把 hash 拆成路徑與 query 字串。
 * @param {string} hash 例如 `#/solutions/pos?kiosk=1`
 * @returns {[string, string]}
 */
function splitHash(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const index = raw.indexOf('?');
    return index === -1 ? [raw, ''] : [raw.slice(0, index), raw.slice(index + 1)];
}

/**
 * hash 是否要求 kiosk 版面（只認 `kiosk=1`）。
 * @param {string} hash
 * @returns {boolean}
 */
export function isKioskMode(hash) {
    return new URLSearchParams(splitHash(hash)[1]).get(KIOSK_PARAM) === '1';
}

/**
 * 回傳開啟或關閉 kiosk 版面後的 hash，保留路徑與其他 query 參數。
 * @param {string} hash
 * @param {boolean} enabled
 * @returns {string} 以 `#` 開頭的 hash
 */
export function setKioskMode(hash, enabled) {
    const [path, query] = splitHash(hash);
    const params = new URLSearchParams(query);
    if (enabled) params.set(KIOSK_PARAM, '1');
    else params.delete(KIOSK_PARAM);
    const search = params.toString();
    return `#${path || '/'}${search ? `?${search}` : ''}`;
}
