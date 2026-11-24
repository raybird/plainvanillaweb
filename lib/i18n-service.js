import { BaseService } from './base-service.js';

/**
 * i18nService - 原生輕量級國際化服務
 * 負責語言管理、翻譯載入與鍵值查找。
 */
export class I18nService extends BaseService {
    constructor() {
        super();
        this._locale = 'zh-TW';
        this._messages = {};
        this._availableLocales = ['zh-TW', 'en-US'];
        this._basePath = new URL('./assets/locales/', document.baseURI).href;
        
        try {
            const savedLocale = localStorage.getItem('app_locale');
            if (this._availableLocales.includes(savedLocale)) this._locale = savedLocale;
        } catch { /* 保留預設語系。 */ }
    }

    async init() {
        try {
            if (document.documentElement) document.documentElement.lang = this._locale;
            await this.loadLocale(this._locale);
            console.log(`[i18n] Initialized: ${this._locale}`);
            this.emit('change', { locale: this._locale });
        } catch (err) {
            console.error('[i18n] Initialization failed:', err);
        }
    }

    get locale() { return this._locale; }
    get isInitialized() { return !!this._messages[this._locale]; }

    async setLocale(newLocale) {
        if (!this._availableLocales.includes(newLocale)) return;
        await this.loadLocale(newLocale);
        this._locale = newLocale;
        if (document.documentElement) document.documentElement.lang = newLocale;
        try { localStorage.setItem('app_locale', newLocale); } catch { /* 保留本次語系。 */ }
        this.emit('change', { locale: newLocale });
    }

    async loadLocale(locale) {
        if (this._messages[locale]) return;
        const res = await fetch(`${this._basePath}${locale}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this._messages[locale] = await res.json();
    }

    t(key, params = {}) {
        const messages = this._messages[this._locale];
        if (!messages) return key;

        let value = messages;
        for (const k of key.split('.')) {
            value = value?.[k];
            if (value === undefined) break;
        }

        if (typeof value !== 'string') return key;
        // ?? 而非 ||：0、false 等值要照實輸出，只有缺少的參數才換成空字串
        return value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? ''));
    }
}

export const i18n = new I18nService();
