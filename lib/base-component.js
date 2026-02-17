import { i18n } from './i18n-service.js';

/**
 * BaseComponent 2.1 (i18n Enabled)
 * 支援錯誤捕獲、優雅降級與原生國際化
 */
export class BaseComponent extends HTMLElement {
    constructor() {
        super();
        this._isRendered = false;
        this._hasError = false;
        // 綁定語言變更處理，確保 update 正確執行
        this._handleLangChange = () => this.update();
    }

    /**
     * 翻譯 helper method
     * @param {string} key 
     * @param {object} params 
     */
    $t(key, params) {
        return i18n.t(key, params);
    }

    /**
     * 初始化反應式狀態
     * @param {object} initialState 
     * @returns {Proxy}
     */
    initReactiveState(initialState = {}) {
        this.state = new Proxy(initialState, {
            set: (target, key, value) => {
                target[key] = value;
                this.update();
                return true;
            }
        });
        return this.state;
    }

    render() { return ''; }
    
    renderError(error) {
        return `<div style="padding:1rem; border:1px solid red; color:red;">
            <strong>組件錯誤:</strong> ${error.message}
        </div>`;
    }

    update() {
        try {
            if (this._hasError) return;
            const content = this.render();
            // 支援 SafeHTML 物件與普通字串
            this.innerHTML = content != null ? content.toString() : '';
            if (!this._isRendered) {
                this.afterFirstRender();
                this._isRendered = true;
            }
        } catch (err) {
            this.handleComponentError(err);
        }
    }

    handleComponentError(err) {
        console.error(`[Component Error] ${this.tagName}:`, err);
        this._hasError = true;
        this.innerHTML = this.renderError(err);
    }

    afterFirstRender() {}

    connectedCallback() {
        i18n.addEventListener('change', this._handleLangChange);
        this.update();
    }

    disconnectedCallback() {
        i18n.removeEventListener('change', this._handleLangChange);
    }
}
