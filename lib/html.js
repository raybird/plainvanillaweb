/**
 * SafeHTML - 用於標記已轉義或受信任的內容
 */
class SafeHTML {
    constructor(val) { this.val = val; }
    // 在 Vanilla 環境中，innerHTML 會調用物件的 toString() 或直接處理。
    // 我們返回原始字串，因為 html() 內部已經處理過轉義邏輯。
    toString() { return this.val; }
}

/**
 * html 標籤模板 - 支援自動轉義與嵌套渲染
 * 遵循 Vanilla 精神，實作輕量級 XSS 防護。
 */
export function html(strings, ...values) {
    const result = strings.reduce((acc, str, i) => {
        let value = values[i];
        
        // 處理值 (如果是陣列，則遞迴處理每個元素並合併)
        let processedValue = '';
        if (Array.isArray(value)) {
            processedValue = value.map(item => 
                item instanceof SafeHTML ? item.val : (item == null ? '' : escapeHTML(String(item)))
            ).join('');
        } else if (value instanceof SafeHTML) {
            processedValue = value.val;
        } else if (value == null) {
            processedValue = '';
        } else {
            processedValue = escapeHTML(String(value));
        }
        
        return acc + str + processedValue;
    }, '');

    return new SafeHTML(result);
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
