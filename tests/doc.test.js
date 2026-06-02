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
