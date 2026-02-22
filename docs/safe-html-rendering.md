# 🛡️ 模板渲染與 XSS 防護 (SafeHTML)

在 `plainvanillaweb` 中，我們不依賴龐大的框架結構，而是使用原生 JavaScript 的 **標籤模板字串 (Tagged Template Literals)** 來建立 UI。

為了確保安全性並防範 XSS (跨站腳本攻擊)，我們實作了一套類似 Lit 或 React 的安全渲染機制。

## 為什麼需要防護？

當我們透過 `element.innerHTML` 渲染來自外部或使用者的動態變數時，如果變數中包含了 `<script>` 或其他惡意 HTML 標籤，瀏覽器就會執行這些代碼。

## `html` 標籤模板的自動轉義

在我們的專案中，所有的 UI 組件都必須使用 `html` 函數來包裝模板：

```javascript
import { html } from '../../lib/html.js';

render() {
    const userInput = "<script>alert('XSS')</script>";
    
    // 🛡️ html 函數會自動將變數中的危險字元轉義為實體符號 (&lt;script&gt;)
    return html`
        <div class="user-profile">
            <h3>使用者輸入：${userInput}</h3> 
        </div>
    `;
}
```

這表示**在預設情況下，你不需要擔心變數注入的安全問題，所有的插值 `${}` 都會被當純文字處理。**

## 何時使用 `unsafe`？

有時候，我們確實需要將一個「已經組裝好的 HTML 字串」動態插入到畫面中，而不是被轉義成純文字。（例如：從 Markdown 解析出來的 HTML、或是動態生成的選單結構）。

如果直接將 HTML 字串放入 `${}`，它在畫面上會裸露成 `<div>...</div>` 這樣的原始碼，因為它被當作純文字轉義了。

這時候，你需要使用 `unsafe` 函數明確告訴系統：「**這段 HTML 內容是受信任的，請直接渲染為 DOM**」。

```javascript
import { html, unsafe } from '../../lib/html.js';

render() {
    // 從內部邏輯動態產生的可信 HTML 結構
    const menuHtml = "<ul class='nav'><li>首頁</li></ul>";
    
    // ⚠️ 如果直接放 ${menuHtml}，會看到純文字原始碼
    // ✅ 使用 unsafe 包裝，將其標記為受信任的 HTML 節點
    return html`
        <nav>
            ${unsafe(menuHtml)}
        </nav>
    `;
}
```

> [!WARNING]
> **絕對不要**將包含使用者直接輸入 (User Input) 或不可信來源的變數丟給 `unsafe()` 處理，這將導致 XSS 漏洞。

## 巢狀組件的自動識別

我們實作的 `html` 模板具有深度辨識的能力。
如果你在 `${}` 裡面放入的變數本身就是另一個 `html` 模板的回傳值，或是包含這類物件的陣列，系統可以**自動識別它們為受信任節點**，無縫進行巢狀渲染，而不需要你手動加上 `unsafe`。

這讓組件拆分變得非常直覺：

```javascript
// ✅ 安全且正確的巢狀渲染
render() {
    const header = html`<header>網站標題</header>`;
    const items = [1, 2, 3].map(i => html`<li>項目 ${i}</li>`);
    
    return html`
        <div>
            ${header}
            <ul>${items}</ul>
        </div>
    `;
}
```

總結來說：
- **`html`**: 預設將變數轉為純文字 (防禦 XSS)。用來包裝所有前端模板。
- **`unsafe`**: 將字串標記為安全。僅用於將「動態生成的純字串 HTML」轉為實際 DOM 節點時使用。
