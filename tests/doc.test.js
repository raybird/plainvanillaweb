import test from 'node:test';
import assert from 'node:assert';

// parseMarkdown 本身為純函式，但模組載入時會建立 docService 單例，
// 其建構子讀取 document.baseURI，故先補上最小 document stub。
global.document = { baseURI: 'http://localhost/plainvanillaweb/' };
const { parseMarkdown } = await import('../lib/doc-service.js');

test('解析標題 h1 / h2 / h3', () => {
    assert.match(parseMarkdown('# Title'), /<h1>Title<\/h1>/);
    assert.match(parseMarkdown('## Sub'), /<h2>Sub<\/h2>/);
    assert.match(parseMarkdown('### Small'), /<h3>Small<\/h3>/);
});

test('解析粗體與連結', () => {
    assert.match(parseMarkdown('**bold**'), /<strong>bold<\/strong>/);
    assert.match(parseMarkdown('[GitHub](https://github.com)'),
        /<a href="https:\/\/github.com">GitHub<\/a>/);
});

test('代碼塊保留語言類別並轉義內容', () => {
    const out = parseMarkdown('```js\nconst a = 1 < 2;\n```');
    assert.match(out, /<pre class="md-code-block"><code class="language-js">/);
    assert.match(out, /1 &lt; 2/);  // < 被轉義
});

test('代碼塊內的反引號不被當成行內代碼 (佔位符保護)', () => {
    // 代碼塊先以佔位符抽出，內部的反引號 (`x`) 不應被包成 md-inline-code。
    const out = parseMarkdown('```js\nconst t = `x`;\n```');
    assert.doesNotMatch(out, /md-inline-code/);
    assert.match(out, /<code class="language-js">const t = `x`;<\/code>/);
});

test('行內代碼轉義 HTML', () => {
    const out = parseMarkdown('使用 `<div>` 標籤');
    assert.match(out, /<code class="md-inline-code">&lt;div&gt;<\/code>/);
});

test('連續清單項目被包進 ul', () => {
    const out = parseMarkdown('- one\n- two');
    assert.match(out, /<ul>/);
    assert.match(out, /<li>one<\/li>/);
    assert.match(out, /<li>two<\/li>/);
});

test('原始 HTML 被轉義，不會被當成標籤渲染', () => {
    const out = parseMarkdown('文字 <img src=x onerror=alert(1)> 與 <x-switch>');
    assert.doesNotMatch(out, /<img|<x-switch/);
    assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('允許不帶屬性的排版標籤，帶屬性時仍被轉義', () => {
    assert.match(parseMarkdown('使用 <code>video</code> 標籤'), /<code>video<\/code>/);
    assert.doesNotMatch(parseMarkdown('<code onclick="x">a</code>'), /<code onclick/);
});

test('行內代碼內的實體照字面顯示', () => {
    const out = parseMarkdown('`&amp;` 代表 &');
    assert.match(out, /<code class="md-inline-code">&amp;amp;<\/code>/);
});

test('連結擋下 javascript: 等危險 scheme，並避免跳出 href 屬性', () => {
    assert.match(parseMarkdown('[x](javascript:alert(1))'), /<a href="#">x<\/a>/);
    assert.match(parseMarkdown('[x](java\tscript:alert(1))'), /<a href="#">x<\/a>/);
    assert.match(parseMarkdown('[x](data:text/html,hi)'), /<a href="#">x<\/a>/);
    assert.match(parseMarkdown('[x](#/docs/router)'), /<a href="#\/docs\/router">x<\/a>/);
    assert.match(parseMarkdown('[x](mailto:a@b.c)'), /<a href="mailto:a@b.c">x<\/a>/);
    assert.doesNotMatch(parseMarkdown('[x](a" onmouseover="alert(1))'), /" onmouseover="/);
});

test('getDoc 載入失敗時，文件名稱（來自網址）被轉義', async () => {
    const { docService } = await import('../lib/doc-service.js');
    const originalFetch = global.fetch;
    const originalError = console.error;
    global.fetch = async () => ({ ok: false });
    console.error = () => {};
    try {
        const out = await docService.getDoc('<img src=x onerror=alert(1)>');
        assert.doesNotMatch(out, /<img/);
        assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
    } finally {
        global.fetch = originalFetch;
        console.error = originalError;
    }
});
