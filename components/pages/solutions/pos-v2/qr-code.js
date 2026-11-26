/**
 * 零依賴 QR Code 產生器（#16）：byte mode、錯誤修正等級 M、版本 1–10、依 ISO/IEC 18004 的罰分自動選遮罩。
 *
 * 只負責產生，不做掃描：顧客與店員用手機內建相機掃描，開啟網址即可。
 * 版本 10、等級 M 最多 213 bytes（UTF-8），足夠放下帶 room、sig 與 token 的入口網址。
 * 匯入零副作用；純函式，Node 與瀏覽器都能執行。
 */

/** 等級 M 各版本的錯誤修正碼字數（每個區塊）與區塊分組：[區塊數, 每區塊資料碼字數] */
const ECC_M = Object.freeze([
    null,
    { ec: 10, groups: [[1, 16]] },
    { ec: 16, groups: [[1, 28]] },
    { ec: 26, groups: [[1, 44]] },
    { ec: 18, groups: [[2, 32]] },
    { ec: 24, groups: [[2, 43]] },
    { ec: 16, groups: [[4, 27]] },
    { ec: 18, groups: [[4, 31]] },
    { ec: 22, groups: [[2, 38], [2, 39]] },
    { ec: 22, groups: [[3, 36], [2, 37]] },
    { ec: 26, groups: [[4, 43], [1, 44]] },
]);

/** 各版本的對齊圖形中心座標 */
const ALIGNMENT = Object.freeze([null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]);

export const QR_MAX_VERSION = 10;

/** 等級 M 的格式資訊位元（L=01、M=00、Q=11、H=10） */
const ECC_FORMAT_BITS_M = 0;

const MASKS = Object.freeze([
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]);

const dataCodewords = (version) => ECC_M[version].groups.reduce((sum, [count, size]) => sum + count * size, 0);
const countBits = (version) => (version <= 9 ? 8 : 16);

/** 各版本在 byte mode、等級 M 可容納的 bytes 數 */
export const QR_BYTE_CAPACITY = Object.freeze(
    ECC_M.map((entry, version) => (entry ? Math.floor((dataCodewords(version) * 8 - 4 - countBits(version)) / 8) : 0)),
);

// ---------- GF(256) 與 Reed–Solomon ----------

function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z;
}

function rsDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < result.length; j++) {
            result[j] = gfMultiply(result[j], root);
            if (j + 1 < result.length) result[j] ^= result[j + 1];
        }
        root = gfMultiply(root, 0x02);
    }
    return result;
}

function rsRemainder(data, divisor) {
    const result = divisor.map(() => 0);
    for (const byte of data) {
        const factor = byte ^ result.shift();
        result.push(0);
        divisor.forEach((coefficient, i) => {
            result[i] ^= gfMultiply(coefficient, factor);
        });
    }
    return result;
}

// ---------- 資料碼字 ----------

function buildDataCodewords(bytes, version) {
    const bits = [];
    const push = (value, length) => {
        for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    push(0b0100, 4); // byte mode
    push(bytes.length, countBits(version));
    for (const byte of bytes) push(byte, 8);
    const capacityBits = dataCodewords(version) * 8;
    push(0, Math.min(4, capacityBits - bits.length)); // 結束符號
    push(0, (8 - (bits.length % 8)) % 8);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
    for (let pad = 0xec; codewords.length < dataCodewords(version); pad ^= 0xec ^ 0x11) codewords.push(pad);
    return codewords;
}

/** 分區塊、加上錯誤修正碼，再依規格交錯排列 */
function interleave(codewords, version) {
    const { ec, groups } = ECC_M[version];
    const divisor = rsDivisor(ec);
    const blocks = [];
    let offset = 0;
    for (const [count, size] of groups) {
        for (let i = 0; i < count; i++) {
            const data = codewords.slice(offset, offset + size);
            offset += size;
            blocks.push({ data, ec: rsRemainder(data, divisor) });
        }
    }
    const result = [];
    const longest = Math.max(...blocks.map((block) => block.data.length));
    for (let i = 0; i < longest; i++) {
        for (const block of blocks) if (i < block.data.length) result.push(block.data[i]);
    }
    for (let i = 0; i < ec; i++) {
        for (const block of blocks) result.push(block.ec[i]);
    }
    return result;
}

// ---------- 矩陣 ----------

class Matrix {
    constructor(version) {
        this.version = version;
        this.size = version * 4 + 17;
        this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
        this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    }

    setFunction(x, y, dark) {
        this.modules[y][x] = dark;
        this.isFunction[y][x] = true;
    }

    drawFunctionPatterns() {
        const { size } = this;
        for (let i = 0; i < size; i++) {
            this.setFunction(6, i, i % 2 === 0);
            this.setFunction(i, 6, i % 2 === 0);
        }
        this.drawFinder(3, 3);
        this.drawFinder(size - 4, 3);
        this.drawFinder(3, size - 4);
        const positions = ALIGNMENT[this.version];
        const last = positions.length - 1;
        positions.forEach((x, i) => {
            positions.forEach((y, j) => {
                const corner = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
                if (!corner) this.drawAlignment(x, y);
            });
        });
        this.drawFormatBits(0); // 先佔位，選定遮罩後重畫
        this.drawVersion();
    }

    drawFinder(cx, cy) {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const x = cx + dx;
                const y = cy + dy;
                if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
                const distance = Math.max(Math.abs(dx), Math.abs(dy));
                this.setFunction(x, y, distance !== 2 && distance !== 4);
            }
        }
    }

    drawAlignment(cx, cy) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
    }

    drawFormatBits(mask) {
        const data = (ECC_FORMAT_BITS_M << 3) | mask;
        let remainder = data;
        for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
        const bits = ((data << 10) | remainder) ^ 0x5412;
        const bit = (i) => ((bits >>> i) & 1) !== 0;
        const { size } = this;
        for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i));
        this.setFunction(8, 7, bit(6));
        this.setFunction(8, 8, bit(7));
        this.setFunction(7, 8, bit(8));
        for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i));
        for (let i = 0; i < 8; i++) this.setFunction(size - 1 - i, 8, bit(i));
        for (let i = 8; i < 15; i++) this.setFunction(8, size - 15 + i, bit(i));
        this.setFunction(8, size - 8, true); // 固定的暗模組
    }

    drawVersion() {
        if (this.version < 7) return;
        let remainder = this.version;
        for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
        const bits = (this.version << 12) | remainder;
        for (let i = 0; i < 18; i++) {
            const dark = ((bits >>> i) & 1) !== 0;
            const a = this.size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            this.setFunction(a, b, dark);
            this.setFunction(b, a, dark);
        }
    }

    drawCodewords(codewords) {
        const { size } = this;
        let index = 0;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            const upward = ((right + 1) & 2) === 0;
            for (let vert = 0; vert < size; vert++) {
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    const y = upward ? size - 1 - vert : vert;
                    if (this.isFunction[y][x] || index >= codewords.length * 8) continue;
                    this.modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) !== 0;
                    index++;
                }
            }
        }
    }

    /** 對非功能模組套用遮罩；套用兩次即還原 */
    applyMask(mask) {
        const rule = MASKS[mask];
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (!this.isFunction[y][x] && rule(x, y)) this.modules[y][x] = !this.modules[y][x];
            }
        }
    }

    /**
     * ISO/IEC 18004 的四項罰分：同色連續、2×2 方塊、類尋像圖形、深淺比例。
     * 每個候選遮罩連同格式資訊一起計分；類尋像圖形要求兩側各有 4 個模組寬的淺色區（外框視為淺色）。
     * 規格對這兩點的寫法有不同解讀，其他實作（例如 segno）可能選出不同的遮罩；任何遮罩都能正確解碼，
     * 差別只在掃描的穩定度。
     */
    penalty() {
        const { size, modules } = this;
        let score = 0;
        const line = (get) => {
            let runColor = false;
            let runLength = 0;
            const history = [0, 0, 0, 0, 0, 0, 0];
            const addHistory = (length) => {
                history.pop();
                history.unshift(history[0] === 0 ? length + size : length);
            };
            const countFinder = () => {
                const n = history[1];
                const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
                return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
            };
            for (let i = 0; i < size; i++) {
                const color = get(i);
                if (color === runColor) {
                    runLength++;
                    if (runLength === 5) score += 3;
                    else if (runLength > 5) score++;
                } else {
                    addHistory(runLength);
                    if (!runColor) score += countFinder() * 40;
                    runColor = color;
                    runLength = 1;
                }
            }
            if (runColor) {
                addHistory(runLength);
                runLength = 0;
            }
            addHistory(runLength + size);
            score += countFinder() * 40;
        };
        for (let y = 0; y < size; y++) line((x) => modules[y][x]);
        for (let x = 0; x < size; x++) line((y) => modules[y][x]);
        for (let y = 0; y < size - 1; y++) {
            for (let x = 0; x < size - 1; x++) {
                const color = modules[y][x];
                if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) score += 3;
            }
        }
        const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
        const total = size * size;
        score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
        return score;
    }
}

/**
 * 產生 QR Code。
 * @param {string} text 以 UTF-8 編碼（不加 ECI）
 * @param {{ mask?: number }} [options] 指定遮罩 0–7；省略時依罰分自動選擇
 * @returns {{ version: number, size: number, mask: number, modules: boolean[][] }} `modules[y][x]` 為 true 表示深色
 */
export function encodeQr(text, { mask } = {}) {
    if (typeof text !== 'string') throw new TypeError('encodeQr 需要字串');
    if (mask !== undefined && !(Number.isInteger(mask) && mask >= 0 && mask <= 7)) throw new RangeError(`遮罩必須是 0–7：${mask}`);
    const bytes = new TextEncoder().encode(text);
    const version = QR_BYTE_CAPACITY.findIndex((capacity, v) => v >= 1 && bytes.length <= capacity);
    if (version === -1) throw new RangeError(`內容太長：${bytes.length} bytes，最多 ${QR_BYTE_CAPACITY[QR_MAX_VERSION]} bytes`);

    const matrix = new Matrix(version);
    matrix.drawFunctionPatterns();
    matrix.drawCodewords(interleave(buildDataCodewords(bytes, version), version));

    let chosen = mask;
    if (chosen === undefined) {
        let best = Infinity;
        for (let candidate = 0; candidate < MASKS.length; candidate++) {
            matrix.applyMask(candidate);
            matrix.drawFormatBits(candidate);
            const score = matrix.penalty();
            if (score < best) {
                best = score;
                chosen = candidate;
            }
            matrix.applyMask(candidate);
        }
    }
    matrix.applyMask(chosen);
    matrix.drawFormatBits(chosen);
    return { version, size: matrix.size, mask: chosen, modules: matrix.modules };
}

/**
 * 轉成 SVG 字串（只含本函式產生的內容，可安全插入頁面）。深色模組用 `currentColor`，四周留白預設 4 個模組寬。
 * 掃描需要深色在淺色底上：呼叫端要讓容器有淺色背景與深色文字色，深色主題也一樣。
 * @param {{ size: number, modules: boolean[][] }} qr
 * @param {{ border?: number }} [options]
 * @returns {string}
 */
export function qrToSvg(qr, { border = 4 } = {}) {
    if (!Number.isInteger(border) || border < 0) throw new RangeError(`border 必須是非負整數：${border}`);
    const dimension = qr.size + border * 2;
    const parts = [];
    qr.modules.forEach((row, y) => {
        for (let x = 0; x < qr.size; x++) {
            if (!row[x]) continue;
            let end = x;
            while (end + 1 < qr.size && row[end + 1]) end++;
            parts.push(`M${x + border} ${y + border}h${end - x + 1}v1h-${end - x + 1}z`);
            x = end;
        }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges">`
        + `<path fill="currentColor" d="${parts.join('')}"/></svg>`;
}
