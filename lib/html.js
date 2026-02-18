/**
 * SafeHTML - 用於標記已轉義或受信任的內容
 */
class SafeHTML {
    constructor(val) { 
        this.val = val; 
        this.__isSafe = true; // 跨模組檢測標記
    }
    toString() { return this.val; }
}

/**
 * html 標籤模板 - 支援自動轉義與嵌套渲染
 */
export function html(strings, ...values) {
    const result = strings.reduce((acc, str, i) => {
        let value = values[i];
        
        let processedValue = '';
        if (Array.isArray(value)) {
            processedValue = value.map(item => 
                (item && item.__isSafe) ? item.val : (item == null ? '' : escapeHTML(String(item)))
            ).join('');
        } else if (value && value.__isSafe) {
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
 * unsafe 標籤 - 強制標記內容為安全
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
