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
        
        // 嘗試從 localStorage 恢復設定
        if (localStorage.getItem('app_locale')) {
            this._locale = localStorage.getItem('app_locale');
        }
    }

    async init() {
        await this.loadLocale(this._locale);
        console.log(`[i18n] Initialized with locale: ${this._locale}`);
        this.emit('change', { locale: this._locale }); // 確保組件更新以顯示翻譯
    }

    get locale() {
        return this._locale;
    }

    /**
     * 切換語言
     * @param {string} newLocale 
     */
    async setLocale(newLocale) {
        if (!this._availableLocales.includes(newLocale)) {
            console.warn(`[i18n] Locale ${newLocale} not supported.`);
            return;
        }

        if (this._locale !== newLocale || !this._messages[newLocale]) {
            await this.loadLocale(newLocale);
            this._locale = newLocale;
            localStorage.setItem('app_locale', newLocale);
            this.emit('change', { locale: newLocale });
        }
    }

    async loadLocale(locale) {
        if (this._messages[locale]) return; // 已載入

        try {
            const res = await fetch(`./assets/locales/${locale}.json`);
            if (!res.ok) throw new Error(`Failed to load locale: ${locale}`);
            this._messages[locale] = await res.json();
            console.log(`[i18n] Loaded locale: ${locale}`);
        } catch (err) {
            console.error('[i18n] Error loading locale:', err);
        }
    }

    /**
     * 翻譯函式
     * @param {string} key 鍵值 (如 'app.home')
     * @param {object} params 參數 (如 { name: 'Ray' })
     * @returns {string} 翻譯後的字串
     */
    t(key, params = {}) {
        const messages = this._messages[this._locale];
        if (!messages) return key;

        // 支援巢狀 key (e.g. 'home.title')
        const keys = key.split('.');
        let value = messages;
        for (const k of keys) {
            value = value?.[k];
        }

        if (typeof value !== 'string') return key;

        // 簡單的參數替換 {{param}}
        return value.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] || '');
    }
}

export const i18n = new I18nService();
