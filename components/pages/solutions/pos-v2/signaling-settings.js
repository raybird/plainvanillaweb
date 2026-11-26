/**
 * 主機端的信令設定（#16，A9）：信令網址存在 localStorage、連線測試、網址參數 `sig` 的處理，
 * 以及兩種自架方式的指令（依 VERSION 組出 jsDelivr 固定版本網址，與頁面同版）。
 */
import { VERSION } from '../../../../lib/version.js';
import { solutionStorageName } from '../solution-kit.js';
import { normalizeSignalingUrl, signalingEndpoint } from './signaling-client.js';

export const REPO = 'raybird/plainvanillaweb';
export const CLOUDFLARED_INSTALL_URL = 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
export const WRANGLER_DOCS_URL = 'https://developers.cloudflare.com/workers/wrangler/install-and-update/';

/** @param {string} [version] */
export const cdnBase = (version = VERSION) => `https://cdn.jsdelivr.net/gh/${REPO}@v${version}`;

/**
 * 兩種自架方式的指令。只提供「下載後執行」，不提供 `curl | sh`：下載的檔案可以先打開檢查再執行。
 * @param {string} [version]
 * @returns {{ node: string, worker: string }}
 */
export function selfHostCommands(version = VERSION) {
    const base = cdnBase(version);
    return {
        node: [
            `curl -fsSLO ${base}/server/signaling.mjs`,
            'node signaling.mjs --tunnel',
        ].join('\n'),
        worker: [
            'mkdir pos-v2-signaling && cd pos-v2-signaling',
            `curl -fsSLO ${base}/server/cloudflare/worker.js`,
            `curl -fsSLO ${base}/server/cloudflare/wrangler.jsonc`,
            'npx wrangler@4 login',
            'npx wrangler@4 deploy',
        ].join('\n'),
    };
}

/** @param {string} namespace */
export const signalingStorageKey = (namespace) => solutionStorageName(namespace, 'signaling');

/**
 * 讀取已儲存的信令網址；沒有或格式不對時回傳 null。
 * @param {string} namespace
 * @param {Storage} [storage]
 */
export function loadSignalingUrl(namespace, storage = globalThis.localStorage) {
    const raw = storage?.getItem(signalingStorageKey(namespace));
    if (!raw) return null;
    try {
        return normalizeSignalingUrl(raw);
    } catch {
        return null;
    }
}

/**
 * 整理後儲存，回傳整理後的網址；格式不對時拋出 TypeError（訊息可直接顯示）。
 * @param {string} namespace
 * @param {string} input
 * @param {Storage} [storage]
 */
export function saveSignalingUrl(namespace, input, storage = globalThis.localStorage) {
    const url = normalizeSignalingUrl(input);
    storage.setItem(signalingStorageKey(namespace), url);
    return url;
}

/** @param {string} namespace @param {Storage} [storage] */
export function clearSignalingUrl(namespace, storage = globalThis.localStorage) {
    storage.removeItem(signalingStorageKey(namespace));
}

/**
 * 從 hash 的 query 讀出 `sig` 參數（尚未確認，不可直接儲存）。
 * @param {string} [hash]
 * @returns {string | null}
 */
export function readSigParam(hash = globalThis.location?.hash ?? '') {
    const raw = String(hash).replace(/^#/, '');
    const index = raw.indexOf('?');
    if (index === -1) return null;
    const sig = new URLSearchParams(raw.slice(index + 1)).get('sig')?.trim();
    return sig || null;
}

/**
 * 決定網址帶來的 `sig` 要怎麼處理。
 * @param {string | null} param readSigParam 的結果
 * @param {string | null} saved 已儲存的網址
 * @returns {{ kind: 'none' } | { kind: 'same' } | { kind: 'invalid', raw: string, error: string } | { kind: 'confirm', url: string }}
 */
export function classifySigParam(param, saved) {
    if (!param) return { kind: 'none' };
    let url;
    try {
        url = normalizeSignalingUrl(param);
    } catch (err) {
        return { kind: 'invalid', raw: param, error: err.message };
    }
    return url === saved ? { kind: 'same' } : { kind: 'confirm', url };
}

const randomRoomId = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * 連線測試：以 peer 身分連到一個隨機的空房間，收到 `welcome` 就算成功。
 * 從瀏覽器測可以順便確認 `Origin` 白名單有沒有包含這個網站（不在白名單時 upgrade 會被拒）。
 * @param {string} url normalizeSignalingUrl 的結果
 * @param {{ WebSocketImpl?: typeof WebSocket, timeoutMs?: number, now?: () => number }} [options]
 * @returns {Promise<{ ok: true, ms: number, iceServers: object[] } | { ok: false, reason: 'timeout' | 'closed' | 'bad-response', code?: number }>}
 */
export function testSignalingConnection(url, { WebSocketImpl = globalThis.WebSocket, timeoutMs = 8000, now = () => performance.now() } = {}) {
    return new Promise((resolve) => {
        const startedAt = now();
        let settled = false;
        let socket;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                socket?.close();
            } catch {
                // 已關閉
            }
            resolve(result);
        };
        const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs);
        try {
            socket = new WebSocketImpl(signalingEndpoint(url, randomRoomId(), 'peer'));
        } catch {
            finish({ ok: false, reason: 'closed' });
            return;
        }
        socket.addEventListener('message', (event) => {
            let message = null;
            try {
                message = JSON.parse(event.data);
            } catch {
                // 不是 JSON
            }
            if (message?.t === 'welcome') finish({ ok: true, ms: Math.round(now() - startedAt), iceServers: Array.isArray(message.iceServers) ? message.iceServers : [] });
            else finish({ ok: false, reason: 'bad-response' });
        });
        socket.addEventListener('close', (event) => finish({ ok: false, reason: 'closed', code: event.code }));
        // Node 的 WebSocket 連線失敗時只發 error（見 signaling-client.js）
        socket.addEventListener('error', () => finish({ ok: false, reason: 'closed' }));
    });
}

/** 連線測試失敗時給使用者看的說明 */
export function describeTestFailure(result) {
    if (result.reason === 'timeout') return '連線逾時：確認信令伺服器仍在執行，Quick Tunnel 的網址每次啟動都會改變。';
    if (result.reason === 'bad-response') return '連上了，但回應不是 POS v2 信令協定：確認網址指向 signaling.mjs 或 POS v2 的 Worker。';
    return '無法連線：確認網址正確、伺服器仍在執行，且它的 Origin 白名單包含這個網站。';
}
