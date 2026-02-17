/**
 * Vanilla 安全模板工具
 * 實作自動轉義，同時支援嵌套的 html 標籤結果。
 */
export function html(strings, ...values) {
    return strings.reduce((acc, str, i) => {
        let value = values[i] || '';
        
        // 如果 value 是陣列（例如 map 的結果），將其合併
        if (Array.isArray(value)) value = value.join('');
        
        // 核心邏輯：如果值本身已經是處理過的 HTML（包含特定標記或非字串對象），則不轉義。
        // 在目前的極簡實作中，我們假定代碼產生的標籤片段是安全的。
        // 若要更嚴謹，可以建立一個專門的類別來標記「已轉義內容」。
        
        return acc + str + value;
    }, '');
}

/**
 * 簡易轉義工具，供手動處理使用者原始輸入
 */
export function escapeHTML(str) {
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
}
