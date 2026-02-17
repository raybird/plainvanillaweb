import { i18n } from './i18n-service.js';

/**
 * MetaService - 負責網頁標題與 Meta 標籤管理 (SEO & A11y)
 * 整合 i18n 翻譯。
 */
export class MetaService {
    constructor() {
        // 預設標題與描述
        this._defaultTitle = 'Plain Vanilla Web';
        this._defaultDesc = 'A modern web application built without frameworks.';
        
        // 監聽 i18n 變更，自動更新當前標題
        i18n.addEventListener('change', () => this.refresh());
        this._currentKey = null;
    }

    /**
     * 更新頁面標題與描述
     * @param {string} titleKey i18n key 或 直接字串
     * @param {string} descKey i18n key 或 直接字串
     */
    update(titleKey, descKey) {
        this._currentKey = { title: titleKey, desc: descKey };
        this.refresh();
    }

    refresh() {
        if (!this._currentKey) return;
        
        const { title, desc } = this._currentKey;
        
        // 設定標題
        const titleText = title ? i18n.t(title) : this._defaultTitle;
        document.title = `${titleText} | ${this._defaultTitle}`;

        // 設定描述
        const descText = desc ? i18n.t(desc) : this._defaultDesc;
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.name = 'description';
            document.head.appendChild(metaDesc);
        }
        metaDesc.content = descText;
    }
}

export const metaService = new MetaService();
