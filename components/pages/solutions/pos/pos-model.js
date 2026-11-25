/**
 * Multi-Window POS 的領域模型（#10）：菜單、訂單建立與狀態轉移規則。
 *
 * 純函式、匯入零副作用，不碰 IndexedDB；`pos-repository.js` 在單一 readwrite transaction 內
 * 讀出目前的訂單、交給 `decideTransition()` 判斷，再把結果寫回。規則集中在這裡，Node 測試可直接驗證。
 */

/** 資料結構版本；變更訂單或菜單欄位時遞增，並在 pos-repository 的 onupgradeneeded 處理 */
export const POS_SCHEMA_VERSION = 1;

/** 訂單狀態 */
export const ORDER_STATUS = Object.freeze({
    PENDING: 'pending',
    PREPARING: 'preparing',
    READY: 'ready',
    PICKED_UP: 'picked_up',
    CANCELLED: 'cancelled',
});

/** 狀態的中文標籤 */
export const STATUS_LABEL = Object.freeze({
    pending: '待處理',
    preparing: '備餐中',
    ready: '請取餐',
    picked_up: '已取餐',
    cancelled: '已取消',
});

/** 錯誤代碼 */
export const POS_ERROR_CODES = Object.freeze({
    INVALID_ORDER: 'INVALID_ORDER',
    NOT_FOUND: 'NOT_FOUND',
    INVALID_TRANSITION: 'INVALID_TRANSITION',
    CONFLICT: 'CONFLICT',
    UNSUPPORTED: 'UNSUPPORTED',
});

export class PosError extends Error {
    /**
     * @param {string} code `POS_ERROR_CODES` 之一
     * @param {string} message
     */
    constructor(code, message) {
        super(message);
        this.name = 'PosError';
        this.code = code;
    }
}

/** 示範菜單；價格以新台幣整數元計，不處理小數 */
export const DEFAULT_MENU = Object.freeze([
    { id: 'burger', name: '經典漢堡', emoji: '🍔', price: 120, category: '主餐' },
    { id: 'chicken', name: '香酥雞腿堡', emoji: '🍗', price: 135, category: '主餐' },
    { id: 'veggie', name: '蔬食捲', emoji: '🌯', price: 110, category: '主餐' },
    { id: 'fries', name: '薯條', emoji: '🍟', price: 50, category: '點心' },
    { id: 'salad', name: '田園沙拉', emoji: '🥗', price: 70, category: '點心' },
    { id: 'cola', name: '可樂', emoji: '🥤', price: 35, category: '飲料' },
    { id: 'tea', name: '無糖綠茶', emoji: '🍵', price: 30, category: '飲料' },
    { id: 'coffee', name: '美式咖啡', emoji: '☕', price: 55, category: '飲料' },
].map((item) => Object.freeze({ ...item })));

/** 單筆訂單同一品項的數量上限與品項種類上限，避免展示資料失控 */
export const MAX_QTY_PER_ITEM = 20;
export const MAX_LINES_PER_ORDER = 20;

/**
 * 取餐號碼：依建立順序遞增，顯示為三位數，超過 999 從 001 重新開始。
 * @param {number} sequence 從 1 開始的序號
 * @returns {string}
 */
export function formatOrderNumber(sequence) {
    if (!Number.isInteger(sequence) || sequence < 1) throw new RangeError(`序號必須是正整數：${sequence}`);
    return String(((sequence - 1) % 999) + 1).padStart(3, '0');
}

/**
 * 由購物車與菜單建立新訂單；價格與品名一律以菜單為準，不信任呼叫端傳入的金額。
 * @param {object} input
 * @param {Array<{ productId: string, qty: number }>} input.items
 * @param {string} input.requestId 同一次送出的冪等鍵（重送時沿用）
 * @param {string} input.id 訂單 id
 * @param {number} input.sequence 取餐序號
 * @param {number} input.now 時間戳（毫秒）
 * @param {string} [input.by] 建立者（視窗角色或節點）
 * @param {ReadonlyArray<{ id: string, name: string, emoji: string, price: number }>} menu
 * @returns {object} 新訂單
 */
export function createOrder({ items, requestId, id, sequence, now, by = 'order' }, menu) {
    if (typeof requestId !== 'string' || !requestId) throw new PosError(POS_ERROR_CODES.INVALID_ORDER, '缺少 requestId');
    if (!Array.isArray(items) || items.length === 0) throw new PosError(POS_ERROR_CODES.INVALID_ORDER, '購物車是空的');
    const byId = new Map(menu.map((product) => [product.id, product]));
    const merged = new Map();
    for (const { productId, qty } of items) {
        const product = byId.get(productId);
        if (!product) throw new PosError(POS_ERROR_CODES.INVALID_ORDER, `菜單沒有這個品項：${productId}`);
        if (!Number.isInteger(qty) || qty < 1) throw new PosError(POS_ERROR_CODES.INVALID_ORDER, `數量必須是正整數：${productId}`);
        merged.set(productId, (merged.get(productId) ?? 0) + qty);
    }
    if (merged.size > MAX_LINES_PER_ORDER) throw new PosError(POS_ERROR_CODES.INVALID_ORDER, `一張訂單最多 ${MAX_LINES_PER_ORDER} 種品項`);
    const lines = [...merged].map(([productId, qty]) => {
        if (qty > MAX_QTY_PER_ITEM) throw new PosError(POS_ERROR_CODES.INVALID_ORDER, `單一品項最多 ${MAX_QTY_PER_ITEM} 份：${productId}`);
        const { name, emoji, price } = byId.get(productId);
        return { productId, name, emoji, price, qty };
    });
    return {
        id,
        requestId,
        number: formatOrderNumber(sequence),
        sequence,
        items: lines,
        total: lines.reduce((sum, line) => sum + line.price * line.qty, 0),
        status: ORDER_STATUS.PENDING,
        station: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        history: [{ status: ORDER_STATUS.PENDING, at: now, by }],
    };
}

/**
 * 可對訂單執行的動作：
 * - `claim`：廚房認領（pending → preparing），記錄站台
 * - `takeover`：接手已關閉站台的訂單（preparing → preparing），必須指定原站台，兩個站台同時接手只有一個成功
 * - `ready`：備餐完成（preparing → ready），只有認領的站台可以完成
 * - `pickup`：顧客取餐（ready → picked_up）
 * - `cancel`：取消（pending → cancelled）
 */
export const ORDER_ACTIONS = Object.freeze(['claim', 'takeover', 'ready', 'pickup', 'cancel']);

const TARGET_STATUS = {
    claim: ORDER_STATUS.PREPARING,
    takeover: ORDER_STATUS.PREPARING,
    ready: ORDER_STATUS.READY,
    pickup: ORDER_STATUS.PICKED_UP,
    cancel: ORDER_STATUS.CANCELLED,
};

const FROM_STATUS = {
    claim: ORDER_STATUS.PENDING,
    takeover: ORDER_STATUS.PREPARING,
    ready: ORDER_STATUS.PREPARING,
    pickup: ORDER_STATUS.READY,
    cancel: ORDER_STATUS.PENDING,
};

/**
 * 判斷一個動作套用在目前訂單上的結果。重複送出同一個已生效的動作回傳 `noop`（冪等），
 * 其他站台已經處理的訂單回傳 `CONFLICT`，不合法的轉移回傳 `INVALID_TRANSITION`。
 * @param {object | undefined} order 交易內讀到的權威訂單
 * @param {object} request
 * @param {string} request.action `ORDER_ACTIONS` 之一
 * @param {string} request.actor 執行者；廚房動作為站台 id
 * @param {string} [request.fromStation] `takeover` 必填：預期的原站台
 * @param {number} request.now
 * @returns {{ result: 'applied' | 'noop', order: object }}
 */
export function decideTransition(order, { action, actor, fromStation, now }) {
    if (!ORDER_ACTIONS.includes(action)) throw new PosError(POS_ERROR_CODES.INVALID_TRANSITION, `不支援的動作：${action}`);
    if (typeof actor !== 'string' || !actor) throw new PosError(POS_ERROR_CODES.INVALID_TRANSITION, '缺少執行者');
    if (action === 'takeover' && (typeof fromStation !== 'string' || !fromStation)) {
        throw new PosError(POS_ERROR_CODES.INVALID_TRANSITION, '接手必須指定原站台');
    }
    if (!order) throw new PosError(POS_ERROR_CODES.NOT_FOUND, '找不到訂單');
    const kitchenAction = action === 'claim' || action === 'takeover' || action === 'ready';
    const target = TARGET_STATUS[action];

    // 冪等：同一個執行者重送已生效的動作
    if (order.status === target) {
        if (!kitchenAction || order.station === actor) return { result: 'noop', order };
        if (action === 'takeover' && order.station !== fromStation) {
            throw new PosError(POS_ERROR_CODES.CONFLICT, `訂單 ${order.number} 已由 ${order.station} 接手`);
        }
        if (action !== 'takeover') {
            throw new PosError(POS_ERROR_CODES.CONFLICT, `訂單 ${order.number} 已由 ${order.station} 處理`);
        }
    }

    if (order.status !== FROM_STATUS[action]) {
        if (kitchenAction && order.status === ORDER_STATUS.PREPARING && order.station !== actor) {
            throw new PosError(POS_ERROR_CODES.CONFLICT, `訂單 ${order.number} 已由 ${order.station} 處理`);
        }
        throw new PosError(POS_ERROR_CODES.INVALID_TRANSITION,
            `訂單 ${order.number} 目前是「${STATUS_LABEL[order.status]}」，不能執行 ${action}`);
    }

    let station = order.station;
    if (action === 'claim') station = actor;
    if (action === 'takeover') {
        if (order.station !== fromStation) throw new PosError(POS_ERROR_CODES.CONFLICT, `訂單 ${order.number} 已由 ${order.station} 接手`);
        station = actor;
    }
    if (action === 'ready' && order.station !== actor) {
        throw new PosError(POS_ERROR_CODES.CONFLICT, `訂單 ${order.number} 由 ${order.station} 備餐，只有該站台可以完成`);
    }

    return {
        result: 'applied',
        order: {
            ...order,
            status: target,
            station,
            version: order.version + 1,
            updatedAt: now,
            history: [...order.history, { status: target, at: now, by: actor, action }],
        },
    };
}

/**
 * 管理統計：各狀態數量、營收（不含取消）、平均備餐時間（認領到完成）、熱銷品項。
 * @param {object[]} orders
 * @returns {{ counts: Record<string, number>, revenue: number, completed: number, avgPrepMs: number | null, topItems: Array<{ name: string, emoji: string, qty: number }> }}
 */
export function summarizeOrders(orders) {
    const counts = Object.fromEntries(Object.values(ORDER_STATUS).map((status) => [status, 0]));
    const itemQty = new Map();
    let revenue = 0;
    const prepDurations = [];
    for (const order of orders) {
        counts[order.status] = (counts[order.status] ?? 0) + 1;
        if (order.status === ORDER_STATUS.CANCELLED) continue;
        revenue += order.total;
        for (const line of order.items) {
            const entry = itemQty.get(line.productId) ?? { name: line.name, emoji: line.emoji, qty: 0 };
            entry.qty += line.qty;
            itemQty.set(line.productId, entry);
        }
        const claimed = order.history.find((h) => h.status === ORDER_STATUS.PREPARING);
        const ready = order.history.find((h) => h.status === ORDER_STATUS.READY);
        if (claimed && ready) prepDurations.push(ready.at - claimed.at);
    }
    return {
        counts,
        revenue,
        completed: counts[ORDER_STATUS.READY] + counts[ORDER_STATUS.PICKED_UP],
        avgPrepMs: prepDurations.length ? Math.round(prepDurations.reduce((a, b) => a + b, 0) / prepDurations.length) : null,
        topItems: [...itemQty.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name)).slice(0, 5),
    };
}
