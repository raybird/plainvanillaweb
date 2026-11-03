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

/**
 * 極簡 Markdown 解析器 (符合 Vanilla 精神，僅處理基礎語法)
 * 抽離為純函式以利測試；不依賴任何瀏覽器 API。
 * 輸出會以 unsafe() 直接渲染，因此預設轉義所有原始 HTML，只放行 ALLOWED_TAGS。
 * @param {string} md
 * @returns {string} HTML 字串
 */
export function parseMarkdown(md) {
    // 1. 優先抽出代碼塊與行內代碼並以佔位符取代，避免其內容被後續轉義與行內語法 (反引號、清單等) 破壞。
    const codeBlocks = [];
    let html = md.replace(/```(.*?)\n([\s\S]*?)```/g, (match, lang, code) => {
        const escapedCode = escapeHTML(code.trim());
        codeBlocks.push(`<pre class="md-code-block"><code class="language-${escapeHTML(lang.trim())}">${escapedCode}</code></pre>`);
        return `@@CODEBLOCK${codeBlocks.length - 1}@@`;
    });

    const inlineCodes = [];
    html = html.replace(/`(.*?)`/g, (match, code) => {
        inlineCodes.push(`<code class="md-inline-code">${escapeHTML(code)}</code>`);
        return `@@INLINECODE${inlineCodes.length - 1}@@`;
    });

    // 2. 轉義其餘所有原始 HTML，再還原允許的排版標籤
    html = escapeHTML(html).replace(ALLOWED_TAGS, '<$1$2>');

    html = html
        // 標題
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        // 粗體
        .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
        // 連結
        .replace(/\[(.*?)\]\((.*?)\)/g, (match, text, href) => `<a href="${safeHref(href)}">${text}</a>`)
        // 清單 (簡易處理)
        .replace(/^\* (.*$)/gm, '<li>$1</li>')
        .replace(/^- (.*$)/gm, '<li>$1</li>')
        // 換行
        .replace(/\n\n/g, '<p></p>');

    // 包裹 li 在 ul 中 (簡易處理，僅針對連續的 li)
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');

    // 還原行內代碼與代碼塊佔位符
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
