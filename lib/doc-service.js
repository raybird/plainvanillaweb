import { BaseService } from './base-service.js';
import { escapeHTML } from './html.js';

/** Markdown 內允許保留的原始 HTML 標籤：僅限不帶屬性的行內排版標籤 */
const ALLOWED_TAGS = /&lt;(\/?)(code|kbd|strong|em|b|i|sub|sup|br)\s*\/?&gt;/gi;

/** 連結允許的 scheme；沒有 scheme 的相對路徑與 #錨點一律允許 */
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * 過濾連結網址：擋下 javascript:、data: 等可執行或可夾帶內容的 scheme
 * @param {string} href 已轉義的網址
 */
function safeHref(href) {
    // 瀏覽器解析 scheme 前會忽略控制字元與空白（例如 "java\tscript:"），比對前先移除
    const scheme = href.replace(/[\u0000- ]/g, '').match(/^([a-z][a-z0-9+.-]*):/i);
    return !scheme || ALLOWED_SCHEMES.has(scheme[1].toLowerCase()) ? href : '#';
}

/** 文件內的相對連結（例如 ADR、原始碼）在網站上沒有對應頁面，改連到 GitHub 上的檔案 */
const REPO_BLOB = 'https://github.com/raybird/plainvanillaweb/blob/master/';

/**
 * 解析文件內的連結：同層的 `foo.md` 轉成站內文件頁 `#/docs/foo`，其他相對路徑轉成 GitHub 上的檔案。
 * 這樣同一份 Markdown 在 GitHub 與網站上點擊都正確。
 * @param {string} href 已轉義的網址
 */
function resolveHref(href) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href.replace(/[\u0000- ]/g, '')) || href.startsWith('#') || href.startsWith('/')) {
        return safeHref(href);
    }
    const [pathPart, anchor = ''] = href.split('#');
    const segments = [];
    for (const segment of `docs/${pathPart}`.split('/')) {
        if (segment === '..') segments.pop();
        else if (segment && segment !== '.') segments.push(segment);
    }
    const resolved = segments.join('/');
    const sibling = resolved.match(/^docs\/([^/]+)\.md$/);
    if (sibling) return `#/docs/${sibling[1]}`;
    return `${REPO_BLOB}${resolved}${anchor ? `#${anchor}` : ''}`;
}

/** 行內語法：粗體、連結、行尾兩個空白的換行 */
function inline(text) {
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match, label, href) => `<a href="${resolveHref(href.trim())}">${label}</a>`)
        .replace(/ {2,}\n/g, '<br>\n');
}

const CODE_LINE = /^\s*@@CODEBLOCK\d+@@\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*&gt; ?/;
const LIST_ITEM = /^(\s*)([*+-]|\d+[.)])\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const isTableStart = (lines, i) => lines[i].trim().startsWith('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]);
const startsBlock = (lines, i) => CODE_LINE.test(lines[i]) || HEADING.test(lines[i]) || RULE.test(lines[i])
    || QUOTE.test(lines[i]) || LIST_ITEM.test(lines[i]) || isTableStart(lines, i);
const indentOf = (line) => line.match(/^\s*/)[0].replace(/\t/g, '    ').length;
const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

function parseTable(lines, i) {
    const header = splitRow(lines[i]);
    const align = splitRow(lines[i + 1]).map((cell) =>
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : '');
    const cell = (tag, text, col) => `<${tag}${align[col] ? ` style="text-align:${align[col]}"` : ''}>${inline(text)}</${tag}>`;
    // 可捲動的外層加上 tabindex 與名稱，只用鍵盤的人也能橫向捲動寬表格
    const label = escapeHTML(header.join('、').replace(/@@INLINECODE\d+@@|&[a-z]+;|[*[\]()]/g, '').trim());
    let html = `<div class="md-table" tabindex="0" role="region" aria-label="表格：${label}"><table><thead><tr>${header.map((text, col) => cell('th', text, col)).join('')}</tr></thead><tbody>`;
    i += 2;
    while (i < lines.length && lines[i].trim().startsWith('|')) {
        html += `<tr>${splitRow(lines[i]).map((text, col) => cell('td', text, col)).join('')}</tr>`;
        i++;
    }
    return [`${html}</tbody></table></div>`, i];
}

function parseList(lines, i) {
    const first = lines[i].match(LIST_ITEM);
    const base = indentOf(first[1]);
    const ordered = /\d/.test(first[2]);
    const sameList = (match) => match && indentOf(match[1]) === base && /\d/.test(match[2]) === ordered;
    const items = [];
    while (i < lines.length) {
        const match = lines[i].match(LIST_ITEM);
        if (!sameList(match)) break;
        let text = match[3];
        const nested = [];
        i++;
        while (i < lines.length) {
            const line = lines[i];
            if (!line.trim()) {
                // 空行之後若接著同一清單的項目或縮排內容，清單仍延續
                let next = i + 1;
                while (next < lines.length && !lines[next].trim()) next++;
                if (next < lines.length && (indentOf(lines[next]) > base || sameList(lines[next].match(LIST_ITEM)))) {
                    if (indentOf(lines[next]) > base) nested.push('');
                    i = next;
                    continue;
                }
                break;
            }
            if (indentOf(line) > base) {
                nested.push(line);
                i++;
            } else if (!startsBlock(lines, i) && !nested.length) {
                text += `\n${line.trim()}`; // 沒有縮排的接續行
                i++;
            } else {
                break;
            }
        }
        const minIndent = Math.min(...nested.filter((l) => l.trim()).map(indentOf));
        const body = nested.length ? parseBlocks(nested.map((l) => l.replace(/\t/g, '    ').slice(minIndent))) : '';
        items.push(`<li>${inline(text)}${body}</li>`);
    }
    const start = ordered ? parseInt(first[2], 10) : 1;
    const tag = ordered ? 'ol' : 'ul';
    return [`<${tag}${start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</${tag}>`, i];
}

function parseBlocks(lines) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i++;
        } else if (CODE_LINE.test(line)) {
            out.push(line.trim());
            i++;
        } else if (HEADING.test(line)) {
            const [, hashes, text] = line.match(HEADING);
            out.push(`<h${hashes.length}>${inline(text)}</h${hashes.length}>`);
            i++;
        } else if (RULE.test(line)) {
            out.push('<hr>');
            i++;
        } else if (isTableStart(lines, i)) {
            let html;
            [html, i] = parseTable(lines, i);
            out.push(html);
        } else if (QUOTE.test(line)) {
            const quoted = [];
            while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].replace(QUOTE, ''));
            out.push(`<blockquote>${parseBlocks(quoted)}</blockquote>`);
        } else if (LIST_ITEM.test(line)) {
            let html;
            [html, i] = parseList(lines, i);
            out.push(html);
        } else {
            const paragraph = [line.trim()];
            i++;
            while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) paragraph.push(lines[i++].trim());
            out.push(`<p>${inline(paragraph.join('\n'))}</p>`);
        }
    }
    return out.join('\n');
}

/**
 * 極簡 Markdown 解析器 (符合 Vanilla 精神，只處理文件用到的語法)
 * 區塊：標題 h1–h6、段落、無序／有序清單（可巢狀）、引用、表格、分隔線、代碼塊。
 * 行內：粗體、連結、行內代碼、行尾兩個空白的換行。
 * 抽離為純函式以利測試；不依賴任何瀏覽器 API。
 * 輸出會以 unsafe() 直接渲染，因此預設轉義所有原始 HTML，只放行 ALLOWED_TAGS。
 * @param {string} md
 * @returns {string} HTML 字串
 */
export function parseMarkdown(md) {
    // 1. 優先抽出代碼塊與行內代碼並以佔位符取代，避免其內容被後續轉義與行內語法 (反引號、清單、表格的 |) 破壞。
    //    代碼塊佔位符獨立成一行，交給區塊解析當成一個區塊。
    const codeBlocks = [];
    //    佔位符保留開頭 ``` 的縮排，清單項目內的代碼塊才會留在該項目裡；代碼內容去掉同樣的縮排。
    let html = md.replace(/\r\n?/g, '\n').replace(/^([ \t]*)```(.*)\n([\s\S]*?)^[ \t]*```[ \t]*$/gm, (match, indent, lang, code) => {
        const body = code.replace(/\n$/, '').split('\n')
            .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line.trimStart()))
            .join('\n');
        codeBlocks.push(`<pre class="md-code-block"><code class="language-${escapeHTML(lang.trim())}">${escapeHTML(body)}</code></pre>`);
        return `${indent}@@CODEBLOCK${codeBlocks.length - 1}@@`;
    });

    const inlineCodes = [];
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
        inlineCodes.push(`<code class="md-inline-code">${escapeHTML(code)}</code>`);
        return `@@INLINECODE${inlineCodes.length - 1}@@`;
    });

    // 2. 轉義其餘所有原始 HTML，再還原允許的排版標籤
    html = escapeHTML(html).replace(ALLOWED_TAGS, '<$1$2>');

    // 3. 逐行解析區塊（引用的 > 已被轉義為 &gt;）
    html = parseBlocks(html.split('\n'));

    // 4. 還原行內代碼與代碼塊佔位符
    html = html.replace(/@@INLINECODE(\d+)@@/g, (m, i) => inlineCodes[Number(i)]);
    html = html.replace(/@@CODEBLOCK(\d+)@@/g, (m, i) => codeBlocks[Number(i)]);

    return html;
}

/**
 * DocService - 負責獲取與解析 Markdown 教學文件
 */
export class DocService extends BaseService {
    constructor() {
        super();
        // 使用 document.baseURI 確保路徑相對於應用根目錄
        this._docsBase = new URL('./docs/', document.baseURI).href;
    }

    /**
     * 獲取指定路徑的 Markdown 內容並轉為簡單 HTML
     * @param {string} docName
     */
    async getDoc(docName) {
        try {
            const response = await fetch(`${this._docsBase}${docName}.md`);
            if (!response.ok) throw new Error('Document not found');
            const md = await response.text();
            return this._parseMarkdown(md);
        } catch (err) {
            console.error('[DocService] Error fetching doc:', err);
            // docName 來自網址 hash，必須轉義後才能放進會以 unsafe() 渲染的內容
            return `<p style="color:red;">無法載入文件: ${escapeHTML(String(docName))}</p>`;
        }
    }

    /**
     * 極簡 Markdown 解析器 (委派至模組層級純函式 parseMarkdown)
     */
    _parseMarkdown(md) {
        return parseMarkdown(md);
    }
}

export const docService = new DocService();
