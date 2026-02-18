import { BaseService } from './base-service.js';

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
            return `<p style="color:red;">無法載入文件: ${docName}</p>`;
        }
    }

    /**
     * 極簡 Markdown 解析器 (符合 Vanilla 精神，僅處理基礎語法)
     */
    _parseMarkdown(md) {
        // 1. 優先處理代碼塊 (避免被行內代碼干擾)
        // 使用 [\\s\\S] 匹配包含換行的所有字元
        let html = md.replace(/```(.*?)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre style="background:#2d2d2d;color:#ccc;padding:1.2rem;border-radius:8px;overflow-x:auto;font-family:monospace;margin:1rem 0;"><code class="language-${lang.trim()}">${code.trim()}</code></pre>`;
        });

        html = html
            // 標題
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            // 粗體
            .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
            // 連結
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
            // 行內代碼 (現在處理是安全的)
            .replace(/`(.*?)`/g, '<code style="background:#f4f4f4;padding:2px 4px;border-radius:4px;font-family:monospace;">$1</code>')
            // 清單
            .replace(/^\* (.*$)/gm, '<li>$1</li>')
            .replace(/^- (.*$)/gm, '<li>$1</li>')
            // 換行 (處理 \n\n)
            .replace(/\n\n/g, '<p></p>');

        // 包裹 li 在 ul 中 (簡易處理，僅針對連續的 li)
        html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
        
        return html;
    }
}

export const docService = new DocService();
