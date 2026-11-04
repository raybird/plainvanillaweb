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

test('標題支援到 h6，結尾的 # 只有前面有空白時才視為收尾符號', () => {
    assert.match(parseMarkdown('#### 四'), /<h4>四<\/h4>/);
    assert.match(parseMarkdown('## 使用 C#'), /<h2>使用 C#<\/h2>/);
    assert.match(parseMarkdown('## 標題 ##'), /<h2>標題<\/h2>/);
});

test('同一行的多段粗體各自獨立', () => {
    assert.match(parseMarkdown('**a** 與 **b**'), /<strong>a<\/strong> 與 <strong>b<\/strong>/);
});

test('連續清單項目包在同一個 ul，有序清單輸出 ol 並保留起始編號', () => {
    assert.match(parseMarkdown('- one\n- two'), /^<ul><li>one<\/li><li>two<\/li><\/ul>$/);
    assert.match(parseMarkdown('1. a\n2. b'), /^<ol><li>a<\/li><li>b<\/li><\/ol>$/);
    assert.match(parseMarkdown('3. c\n4. d'), /^<ol start="3">/);
});

test('縮排的子清單與項目內的代碼塊屬於該項目', () => {
    const out = parseMarkdown('1. 父\n    * 子一\n    * 子二\n2. 下一項');
    assert.match(out, /^<ol><li>父<ul><li>子一<\/li><li>子二<\/li><\/ul><\/li><li>下一項<\/li><\/ol>$/);
    const code = parseMarkdown('* 步驟：\n  ```js\n  run();\n  ```\n* 完成');
    assert.match(code, /<li>步驟：<pre class="md-code-block">/);
    assert.match(code, /<li>完成<\/li><\/ul>$/);
});

test('引用區塊內可再解析區塊語法', () => {
    const out = parseMarkdown('> **注意**：第一行\n> - 項目');
    assert.match(out, /^<blockquote><p><strong>注意<\/strong>：第一行<\/p>\n<ul><li>項目<\/li><\/ul><\/blockquote>$/);
});

test('表格輸出 table，支援對齊與儲存格內的行內語法，代碼裡的 | 不會切開儲存格', () => {
    const out = parseMarkdown('| 語法 | 說明 |\n| :--- | :---: |\n| `a|b` | **粗** |');
    assert.match(out, /^<div class="md-table" tabindex="0" role="region" aria-label="表格：語法、說明"><table>/);
    assert.match(out, /<th style="text-align:left">語法<\/th><th style="text-align:center">說明<\/th>/);
    assert.match(out, /<td style="text-align:left"><code class="md-inline-code">a\|b<\/code><\/td>/);
    assert.match(out, /<td style="text-align:center"><strong>粗<\/strong><\/td>/);
});

test('段落內的連續行合併為同一段，空行分段，分隔線輸出 hr', () => {
    assert.equal(parseMarkdown('第一行\n第二行\n\n下一段\n\n---'), '<p>第一行\n第二行</p>\n<p>下一段</p>\n<hr>');
});

test('文件內的相對連結：同層 .md 轉為站內文件頁，其他路徑轉為 GitHub 上的檔案', () => {
    assert.match(parseMarkdown('[r](./router.md)'), /<a href="#\/docs\/router">r<\/a>/);
    assert.match(parseMarkdown('[r](router.md#x)'), /<a href="#\/docs\/router">r<\/a>/);
    assert.match(parseMarkdown('[a](./decisions/0100-x.md)'),
        /<a href="https:\/\/github.com\/raybird\/plainvanillaweb\/blob\/master\/docs\/decisions\/0100-x.md">a<\/a>/);
    assert.match(parseMarkdown('[c](../lib/core.js)'),
        /<a href="https:\/\/github.com\/raybird\/plainvanillaweb\/blob\/master\/lib\/core.js">c<\/a>/);
});
