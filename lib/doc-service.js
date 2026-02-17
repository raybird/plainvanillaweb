import { BaseService } from './base-service.js';

/**
 * DocService - 負責獲取與解析 Markdown 教學文件
 */
export class DocService extends BaseService {
    constructor() {
        super();
        this._docsBase = './docs/';
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
        let html = md
            // 標題
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            // 粗體
            .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
            // 連結
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
            // 行內代碼
            .replace(/`(.*?)`/g, '<code style="background:#f4f4f4;padding:2px 4px;border-radius:4px;">$1</code>')
            // 代碼塊 (簡易處理) - 使用字串拼接避開 Regex 字面量換行問題
            .replace(new RegExp('```(.*?)\\n([\\s\\S]*?)\\n```', 'g'), '<pre style="background:#2d2d2d;color:#ccc;padding:1rem;border-radius:8px;overflow-x:auto;">$2</pre>')
            // 清單
            .replace(/^\* (.*$)/gm, '<li>$1</li>')
            .replace(/^- (.*$)/gm, '<li>$1</li>')
            // 換行 (處理 \n\n)
            .replace(/\n\n/g, '<p></p>');

        // 包裹 li 在 ul 中 (簡易處理)
        html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1<\/ul>');
        
        return html;
    }
}

export const docService = new DocService();
