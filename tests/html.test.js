import test from 'node:test';
import assert from 'node:assert';

// 純函式模組，無瀏覽器依賴，可直接載入
import { html, unsafe, escapeHTML } from '../lib/html.js';

test('escapeHTML 轉義所有危險字元', () => {
    assert.strictEqual(
        escapeHTML(`<img src=x onerror="alert('1')">`),
        '&lt;img src=x onerror=&quot;alert(&#039;1&#039;)&quot;&gt;'
    );
    assert.strictEqual(escapeHTML('a & b'), 'a &amp; b');
});

test('html`` 自動轉義內插值 (XSS 防線)', () => {
    const evil = '<script>alert(1)</script>';
    assert.strictEqual(
        html`<p>${evil}</p>`.toString(),
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    );
});

test('html`` 回傳帶 __isSafe 標記的 SafeHTML', () => {
    const result = html`<p>hi</p>`;
    assert.strictEqual(result.__isSafe, true);
    assert.strictEqual(typeof result.toString(), 'string');
});

test('html`` 串接陣列並逐項轉義', () => {
    const items = ['<a>', '<b>'];
    assert.strictEqual(
        html`<ul>${items}</ul>`.toString(),
        '<ul>&lt;a&gt;&lt;b&gt;</ul>'
    );
});

test('html`` 巢狀 SafeHTML 不重複轉義', () => {
    const inner = html`<b>${'<x>'}</b>`; // 內層已轉義
    assert.strictEqual(
        html`<div>${inner}</div>`.toString(),
        '<div><b>&lt;x&gt;</b></div>'
    );
});

test('html`` 將 null / undefined 視為空字串', () => {
    assert.strictEqual(html`<p>${null}${undefined}</p>`.toString(), '<p></p>');
});

test('unsafe() 跳過轉義以渲染信任內容', () => {
    assert.strictEqual(
        html`<div>${unsafe('<b>ok</b>')}</div>`.toString(),
        '<div><b>ok</b></div>'
    );
});
