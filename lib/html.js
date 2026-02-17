/**
 * SafeHTML - 用於標記已轉義或受信任的內容
 */
class SafeHTML {
    constructor(val) { this.val = val; }
    toString() { return this.val; }
}

/**
 * html 標籤模板 - 支援自動轉義與嵌套渲染
 * 遵循 Vanilla 精神，實作輕量級 XSS 防護。
 */
export function html(strings, ...values) {
    const result = strings.reduce((acc, str, i) => {
        let value = values[i];
        
        // 處理陣列 (例如 map 的結果)
        if (Array.isArray(value)) {
            value = value.join('');
        }

        // 轉義邏輯：
        // 1. 如果是 SafeHTML 實例，直接使用
        // 2. 如果是 null/undefined，轉為空字串
        // 3. 否則一律轉義
        if (value instanceof SafeHTML) {
            value = value.val;
        } else if (value == null) {
            value = '';
        } else {
            value = escapeHTML(String(value));
        }
        
        return acc + str + value;
    }, '');

    return new SafeHTML(result); // 回傳包裝過的對象以支援嵌套
}

/**
 * unsafe 標籤 - 強制標記內容為安全，不進行轉義
 * 請謹慎使用，僅用於受信任的 HTML 片段。
 */
export function unsafe(str) {
    return new SafeHTML(str);
}

/**
 * 原生 HTML 轉義工具
 */
export function escapeHTML(str) {
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
}
