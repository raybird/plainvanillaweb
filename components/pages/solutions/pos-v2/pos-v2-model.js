/**
 * POS v2 的領域模型（#16，ADR 0109）：桌位與用餐場次、授權、嘗試次數限制、送單判斷與權限。
 *
 * 純函式、匯入零副作用，不碰 IndexedDB 與網路；`pos-v2-repository.js` 在 transaction 內呼叫這裡的判斷。
 * 訂單的建立與狀態轉移沿用第一代 `../pos/pos-model.js`（第一代保留不變）。
 * 協定細節見 docs/superpowers/plans/2026-11-26-pos-v2-protocol.md。
 */
import {
    ORDER_STATUS,
    POS_ERROR_CODES,
    PosError,
    STATUS_LABEL,
} from '../pos/pos-model.js';

export { ORDER_STATUS, PosError, STATUS_LABEL };

/** 資料結構版本；變更 store 或欄位時遞增，並在 pos-v2-repository 的 onupgradeneeded 處理 */
export const POS_V2_SCHEMA_VERSION = 1;

/** 錯誤代碼：第一代的代碼加上第二代的授權與連線相關代碼（協定規格 6.5） */
export const POS_V2_ERROR_CODES = Object.freeze({
    ...POS_ERROR_CODES,
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    SESSION_CLOSED: 'SESSION_CLOSED',
    CODE_INVALID: 'CODE_INVALID',
    RATE_LIMITED: 'RATE_LIMITED',
    PAIRING_EXPIRED: 'PAIRING_EXPIRED',
    BAD_MESSAGE: 'BAD_MESSAGE',
});

/** 授權種類 */
export const CREDENTIAL_KIND = Object.freeze({
    DEVICE: 'device',
    TABLE: 'table',
});

/** 店員裝置可以被指定的角色（管理頁是主機本身，不是遠端角色） */
export const DEVICE_ROLES = Object.freeze(['order', 'kitchen', 'display']);

/** 訂單來源 */
export const ORDER_SOURCE = Object.freeze({
    DEVICE: 'device',
    TABLE: 'table',
});

/** 用餐場次狀態 */
export const SESSION_STATUS = Object.freeze({
    OPEN: 'open',
    CLOSED: 'closed',
});

/** 時間與次數上限（協定規格 5.1、5.2、6.4） */
export const LIMITS = Object.freeze({
    CODE_DIGITS: 6,
    PAIRING_TTL_MS: 5 * 60 * 1000,
    PING_INTERVAL_MS: 5000,
    PEER_TIMEOUT_MS: 15000,
});

/** 每條 DataChannel：連續錯 5 次後冷卻 60 秒，成功後歸零 */
export const CHANNEL_ATTEMPT_POLICY = Object.freeze({ maxFailures: 5, windowMs: Infinity, cooldownMs: 60000, resetOnSuccess: true });

/** 每張桌（或每張配對票）：每分鐘最多 30 次錯誤，超過後 60 秒內一律拒絕；成功不歸零 */
export const TARGET_ATTEMPT_POLICY = Object.freeze({ maxFailures: 30, windowMs: 60000, cooldownMs: 60000, resetOnSuccess: false });

// ---------- 隨機值與雜湊 ----------

/**
 * @param {Uint8Array} bytes
 * @returns {string} base64url（無補位）
 */
export function toBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 隨機 token（base64url）。授權 secret、配對 token、查詢 token 都用它產生。
 * @param {number} [byteLength] 預設 16（128 bit）
 * @returns {string}
 */
export function randomToken(byteLength = 16) {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/**
 * 均勻分布的數字碼（入桌碼、連線碼），以拒絕取樣避免取模偏差。
 * @param {number} [digits]
 * @returns {string}
 */
export function randomCode(digits = LIMITS.CODE_DIGITS) {
    if (!Number.isInteger(digits) || digits < 1 || digits > 9) throw new RangeError(`位數必須介於 1 到 9：${digits}`);
    const range = 10 ** digits;
    const limit = Math.floor(0x100000000 / range) * range;
    const buffer = new Uint32Array(1);
    let value;
    do {
        crypto.getRandomValues(buffer);
        value = buffer[0];
    } while (value >= limit);
    return String(value % range).padStart(digits, '0');
}

/**
 * secret 的 SHA-256（base64url）。主機只保存雜湊，不保存 secret 本身。
 * @param {string} secret
 * @returns {Promise<string>}
 */
export async function hashSecret(secret) {
    if (typeof secret !== 'string' || !secret) throw new TypeError('hashSecret 需要非空字串');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    return toBase64Url(new Uint8Array(digest));
}

/**
 * 固定時間比較兩個字串（長度不同時直接回傳 false，長度本身不是秘密）。
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

// ---------- principal 與授權 ----------

/**
 * @param {{ kind: string, id: string }} credential
 * @returns {string} 例如 `device:<id>`、`table:<id>`
 */
export function principalOf(credential) {
    if (!credential || !Object.values(CREDENTIAL_KIND).includes(credential.kind) || typeof credential.id !== 'string' || !credential.id) {
        throw new PosError(POS_V2_ERROR_CODES.UNAUTHORIZED, '授權格式不正確');
    }
    return `${credential.kind}:${credential.id}`;
}

/**
 * 建立店員裝置授權的儲存紀錄（只含 secret 雜湊）。
 * @param {{ id: string, secretHash: string, role: string, station?: string | null, label?: string, now: number }} input
 */
export function createDeviceCredential({ id, secretHash, role, station = null, label = '', now }) {
    if (!DEVICE_ROLES.includes(role)) throw new PosError(POS_V2_ERROR_CODES.INVALID_ORDER, `不支援的角色：${role}`);
    if (role === 'kitchen' && (typeof station !== 'string' || !station.trim())) {
        throw new PosError(POS_V2_ERROR_CODES.INVALID_ORDER, '廚房裝置必須指定站台');
    }
    return {
        id,
        kind: CREDENTIAL_KIND.DEVICE,
        secretHash,
        role,
        station: role === 'kitchen' ? station.trim() : null,
        label: String(label).slice(0, 40),
        createdAt: now,
        revokedAt: null,
    };
}

/**
 * 建立入桌授權的儲存紀錄，綁定桌位與用餐場次。
 * @param {{ id: string, secretHash: string, tableId: string, diningSessionId: string, now: number }} input
 */
export function createTableCredential({ id, secretHash, tableId, diningSessionId, now }) {
    return {
        id,
        kind: CREDENTIAL_KIND.TABLE,
        secretHash,
        tableId,
        diningSessionId,
        createdAt: now,
        revokedAt: null,
    };
}

/**
 * 驗證連線帶來的授權：紀錄存在、未撤銷、secret 雜湊相符。
 * @param {object | undefined} record 依 id 讀到的儲存紀錄
 * @param {string} presentedHash 連線送來的 secret 的雜湊
 * @returns {object} 通過驗證的紀錄
 */
export function verifyCredential(record, presentedHash) {
    if (!record || record.revokedAt != null || !safeEqual(record.secretHash, presentedHash)) {
        throw new PosError(POS_V2_ERROR_CODES.UNAUTHORIZED, '授權無效或已撤銷');
    }
    return record;
}

// ---------- 桌位與用餐場次 ----------

/**
 * 開桌：建立新的用餐場次。同一桌同時只能有一個開啟中的場次。
 * @param {{ id: string, tableId: string, codeHash: string, now: number, current?: object | null }} input
 *   `current` 為這張桌目前最新的場次（可為 null）
 */
export function openDiningSession({ id, tableId, codeHash, now, current = null }) {
    if (current && current.status === SESSION_STATUS.OPEN) {
        throw new PosError(POS_V2_ERROR_CODES.CONFLICT, `桌位 ${tableId} 已經開桌`);
    }
    return { id, tableId, status: SESSION_STATUS.OPEN, codeHash, openedAt: now, closedAt: null };
}

/**
 * 關桌：場次標成已關閉，之後該場次的入桌授權不能再送單。重複關桌回傳原場次（冪等）。
 * @param {object | undefined} session
 * @param {number} now
 */
export function closeDiningSession(session, now) {
    if (!session) throw new PosError(POS_V2_ERROR_CODES.NOT_FOUND, '找不到用餐場次');
    if (session.status === SESSION_STATUS.CLOSED) return session;
    return { ...session, status: SESSION_STATUS.CLOSED, closedAt: now };
}

/**
 * 輪換入桌碼：舊碼立即失效，已取得的入桌授權不受影響。
 * @param {object | undefined} session
 * @param {string} codeHash
 */
export function rotateSessionCode(session, codeHash) {
    if (!session) throw new PosError(POS_V2_ERROR_CODES.NOT_FOUND, '找不到用餐場次');
    if (session.status !== SESSION_STATUS.OPEN) throw new PosError(POS_V2_ERROR_CODES.SESSION_CLOSED, '已關桌，不能輪換入桌碼');
    return { ...session, codeHash };
}

/**
 * 判斷入桌碼：桌位要有開啟中的場次，且入桌碼雜湊相符。
 * @param {{ session: object | null | undefined, codeHash: string }} input
 * @returns {object} 開啟中的場次
 */
export function decideTableJoin({ session, codeHash }) {
    if (!session || session.status !== SESSION_STATUS.OPEN) {
        throw new PosError(POS_V2_ERROR_CODES.SESSION_CLOSED, '這張桌目前沒有開放點餐');
    }
    if (!safeEqual(session.codeHash, codeHash)) throw new PosError(POS_V2_ERROR_CODES.CODE_INVALID, '入桌碼不正確');
    return session;
}

// ---------- 配對票 ----------

/**
 * 建立配對票：配對 token（放進 QR Code）與數字連線碼都只存雜湊，期限內可重複使用。
 * @param {{ id: string, tokenHash: string, codeHash: string, now: number }} input
 */
export function createPairingTicket({ id, tokenHash, codeHash, now }) {
    return { id, tokenHash, codeHash, createdAt: now, expiresAt: now + LIMITS.PAIRING_TTL_MS };
}

/**
 * @param {object | undefined} ticket
 * @param {number} now
 * @returns {object}
 */
export function assertPairingValid(ticket, now) {
    if (!ticket || now >= ticket.expiresAt) throw new PosError(POS_V2_ERROR_CODES.PAIRING_EXPIRED, '連線碼已過期，請向管理端索取新的連線碼');
    return ticket;
}

// ---------- 嘗試次數限制 ----------

/** @returns {{ failures: number[], lockedUntil: number }} */
export function createAttemptState() {
    return { failures: [], lockedUntil: 0 };
}

/**
 * 冷卻中時拒絕（連正確的碼也拒絕）。
 * @param {{ lockedUntil: number }} state
 * @param {number} now
 * @returns {{ allowed: boolean, retryAfterMs: number }}
 */
export function evaluateAttempt(state, now) {
    const retryAfterMs = Math.max(0, state.lockedUntil - now);
    return { allowed: retryAfterMs === 0, retryAfterMs };
}

/**
 * 記一次錯誤；視窗內達到上限就進入冷卻並清空計數。
 * @param {{ failures: number[], lockedUntil: number }} state
 * @param {number} now
 * @param {{ maxFailures: number, windowMs: number, cooldownMs: number }} policy
 */
export function registerFailure(state, now, policy) {
    const failures = [...state.failures.filter((at) => now - at < policy.windowMs), now];
    if (failures.length >= policy.maxFailures) return { failures: [], lockedUntil: now + policy.cooldownMs };
    return { failures, lockedUntil: state.lockedUntil };
}

/**
 * 記一次成功；`resetOnSuccess` 的政策（每條連線的連續錯誤）歸零，其他維持。
 * @param {{ failures: number[], lockedUntil: number }} state
 * @param {{ resetOnSuccess: boolean }} policy
 */
export function registerSuccess(state, policy) {
    return policy.resetOnSuccess ? createAttemptState() : state;
}

/**
 * 依政策拋出 RATE_LIMITED；給 repository 與 hub 共用。
 * @param {{ lockedUntil: number }} state
 * @param {number} now
 */
export function assertAttemptAllowed(state, now) {
    const { allowed, retryAfterMs } = evaluateAttempt(state, now);
    if (!allowed) {
        const error = new PosError(POS_V2_ERROR_CODES.RATE_LIMITED, `嘗試次數過多，請 ${Math.ceil(retryAfterMs / 1000)} 秒後再試`);
        error.retryAfterMs = retryAfterMs;
        throw error;
    }
}

// ---------- 送單 ----------

/**
 * 判斷一次送單（協定規格 5.4）。repository 先以 `[principal, requestId]` 查到既有訂單（可能沒有），
 * 再讀出相關場次，最後交給這裡：
 * 1. 既有訂單存在：直接回傳原訂單，**不再檢查場次**（主機已寫入、回覆遺失、期間又關桌的重送仍能取回）。
 * 2. 店員裝置：角色必須是點餐；帶桌號時該桌要有開啟中的場次。
 * 3. 入桌授權：桌位與場次一律取自授權，所屬場次必須仍開啟中。
 *
 * @param {object} input
 * @param {object | undefined} input.existing 以 `[principal, requestId]` 查到的既有訂單
 * @param {object} input.grant 通過驗證的授權紀錄（裝置或入桌）
 * @param {object | null | undefined} input.session 入桌授權所屬的場次；或店員指定桌號時該桌的最新場次
 * @param {string | null} [input.tableId] 店員裝置指定的桌號（入桌授權忽略這個參數）
 * @returns {{ result: 'noop', order: object } | { result: 'create', fields: { principal: string, source: string, tableId: string | null, diningSessionId: string | null } }}
 */
export function decidePlaceOrder({ existing, grant, session, tableId = null }) {
    if (!grant) throw new PosError(POS_V2_ERROR_CODES.UNAUTHORIZED, '請先完成配對或輸入入桌碼');
    const principal = principalOf(grant);
    if (existing) {
        if (existing.principal !== principal) throw new PosError(POS_V2_ERROR_CODES.UNAUTHORIZED, '不能取得其他身分建立的訂單');
        return { result: 'noop', order: existing };
    }
    if (grant.kind === CREDENTIAL_KIND.DEVICE) {
        if (grant.role !== 'order') throw new PosError(POS_V2_ERROR_CODES.FORBIDDEN, '只有點餐裝置可以送單');
        if (tableId == null || tableId === '') {
            return { result: 'create', fields: { principal, source: ORDER_SOURCE.DEVICE, tableId: null, diningSessionId: null } };
        }
        if (!session || session.tableId !== tableId || session.status !== SESSION_STATUS.OPEN) {
            throw new PosError(POS_V2_ERROR_CODES.SESSION_CLOSED, `桌位 ${tableId} 目前沒有開桌`);
        }
        return { result: 'create', fields: { principal, source: ORDER_SOURCE.DEVICE, tableId, diningSessionId: session.id } };
    }
    if (!session || session.id !== grant.diningSessionId || session.status !== SESSION_STATUS.OPEN) {
        throw new PosError(POS_V2_ERROR_CODES.SESSION_CLOSED, '這桌已關桌，不能再送單');
    }
    return {
        result: 'create',
        fields: { principal, source: ORDER_SOURCE.TABLE, tableId: grant.tableId, diningSessionId: grant.diningSessionId },
    };
}

/**
 * 把第二代的欄位加到第一代 `createOrder()` 建出的訂單上。
 * @param {object} order 第一代的訂單
 * @param {{ principal: string, source: string, tableId: string | null, diningSessionId: string | null }} fields
 * @param {string | null} [viewTokenHash] 店員點餐時產生的查詢 token 雜湊（交接用）
 */
export function withV2Fields(order, fields, viewTokenHash = null) {
    return { ...order, ...fields, viewTokenHash };
}

/**
 * 前面還有幾筆待備餐：全店狀態為待處理、且取餐序號比這筆小的訂單數；備餐中的不算。
 * 這筆不是待處理時回傳 null（畫面改顯示狀態）。
 * @param {object[]} orders
 * @param {object} order
 * @returns {number | null}
 */
export function aheadCount(orders, order) {
    if (!order || order.status !== ORDER_STATUS.PENDING) return null;
    return orders.filter((other) => other.status === ORDER_STATUS.PENDING && other.sequence < order.sequence).length;
}

// ---------- 權限 ----------

/** 任何連線都能呼叫的方法（協定規格 6.2） */
const PUBLIC_METHODS = new Set(['auth', 'pair.request', 'table.listOpen', 'table.join', 'order.watch']);

/** 各角色可以對訂單執行的動作；取消只在主機的管理頁操作 */
const ROLE_ACTIONS = Object.freeze({
    kitchen: Object.freeze(['claim', 'ready', 'takeover']),
    display: Object.freeze(['pickup']),
    order: Object.freeze([]),
});

/**
 * 檢查一條連線能否呼叫某個方法。
 * @param {string} method
 * @param {{ device?: object | null, table?: object | null, watches?: ReadonlySet<string> }} grants 這條連線通過驗證的授權
 * @param {{ action?: string }} [params]
 */
export function authorizeMethod(method, grants, params = {}) {
    if (PUBLIC_METHODS.has(method)) return;
    const { device = null, table = null, watches = new Set() } = grants;
    const authenticated = Boolean(device || table || watches.size);
    const deny = () => {
        throw new PosError(authenticated ? POS_V2_ERROR_CODES.FORBIDDEN : POS_V2_ERROR_CODES.UNAUTHORIZED,
            authenticated ? `目前的授權不能執行 ${method}` : '請先完成配對、輸入入桌碼或開啟訂單查詢');
    };
    switch (method) {
        case 'sync':
            if (!authenticated) deny();
            return;
        case 'menu.get':
        case 'order.place':
            if (table || device?.role === 'order') return;
            return deny();
        case 'order.act': {
            const allowed = device ? ROLE_ACTIONS[device.role] ?? [] : [];
            if (!allowed.includes(params.action)) deny();
            return;
        }
        default:
            throw new PosError(POS_V2_ERROR_CODES.BAD_MESSAGE, `不支援的方法：${method}`);
    }
}

/**
 * 一條連線能不能看某筆訂單：自己建立的，或以查詢授權開啟的。
 * @param {object} order
 * @param {{ principal?: string | null, watches?: ReadonlySet<string> }} viewer
 */
export function canViewOrder(order, { principal = null, watches = new Set() }) {
    return Boolean(order) && ((principal != null && order.principal === principal) || watches.has(order.id));
}

/**
 * 給顧客端的訂單投影：不含內部欄位（principal、雜湊、歷程）。
 * @param {object} order
 * @param {object[]} orders 全店訂單，用來計算前面的筆數
 */
export function projectCustomerOrder(order, orders) {
    return {
        id: order.id,
        number: order.number,
        status: order.status,
        statusLabel: STATUS_LABEL[order.status],
        aheadCount: aheadCount(orders, order),
        tableId: order.tableId ?? null,
        items: order.items.map(({ name, emoji, qty }) => ({ name, emoji, qty })),
        total: order.total,
        createdAt: order.createdAt,
    };
}

// ---------- 站台在線 ----------

/**
 * 遠端廚房站台能否被接手：DataChannel 已關閉，且最後一則訊息距今超過逾時（協定規格 6.4）。
 * 沒有在線紀錄（主機重新整理後站台還沒重連）時，以主機啟動時間當作最後一次看到它的時間，
 * 避免主機一重新整理，其他站台就搶在原站台重連前接手。
 * @param {{ connected: boolean, lastSeenAt: number } | undefined} presence
 * @param {number} now
 * @param {number} hostStartedAt 主機這次啟動的時間
 * @returns {boolean}
 */
export function isStationOffline(presence, now, hostStartedAt) {
    const { connected, lastSeenAt } = presence ?? { connected: false, lastSeenAt: hostStartedAt };
    return !connected && now - lastSeenAt > LIMITS.PEER_TIMEOUT_MS;
}
