import { i18n } from './i18n-service.js';

/**
 * BaseComponent - Vanilla JS 反應式組件基底類別 (v4.1 - Optimized with i18n)
 * 支援深度觀察、非同步渲染與國際化輔助。
 */
export class BaseComponent extends HTMLElement {
    constructor() {
        super();
        this.state = {};
        this._isRendered = false;
        this._renderPending = false;
    }

    /**
     * 初始化反應式狀態
     * @param {Object} initialState 
     */
    initReactiveState(initialState) {
        this.state = this._createDeepProxy(initialState);
    }

    /**
     * 建立深度 Proxy 觀察
     * @private
     */
    _createDeepProxy(obj) {
        const handler = {
            set: (target, key, value) => {
                if (target[key] === value) return true;
                
                // 如果設定的是物件，則繼續包裹 Proxy
                target[key] = (value !== null && typeof value === 'object') 
                    ? this._createDeepProxy(value) 
                    : value;
                
                this.scheduleUpdate();
                this.onStateChange?.(key, value);
                return true;
            },
            get: (target, key) => {
                const val = target[key];
                return val;
            }
        };

        // 遞迴處理初始物件
        const p = new Proxy({}, handler);
        for (const [k, v] of Object.entries(obj)) {
            p[k] = (v !== null && typeof v === 'object') ? this._createDeepProxy(v) : v;
        }
        return p;
    }

    /**
     * 排程更新 (非同步緩衝)
     */
    scheduleUpdate() {
        if (this._renderPending) return;
        this._renderPending = true;
        
        requestAnimationFrame(() => {
            this.update();
            this._renderPending = false;
        });
    }

    connectedCallback() {
        // 監聽語系變更
        this._onLangChange = () => this.scheduleUpdate();
        i18n.on('change', this._onLangChange);

        if (!this._isRendered) {
            this.update();
            this._isRendered = true;
            this.afterFirstRender();
        }
    }

    disconnectedCallback() {
        if (this._onLangChange) {
            i18n.off('change', this._onLangChange);
        }
    }

    /**
     * 執行 DOM 更新並保護使用者輸入狀態
     */
    update() {
        const activeId = document.activeElement?.id;
        const selectionStart = document.activeElement?.selectionStart;
        const selectionEnd = document.activeElement?.selectionEnd;

        this.innerHTML = this.render();

        // 恢復焦點與游標位置
        if (activeId) {
            const el = this.querySelector(`#${activeId}`);
            if (el) {
                el.focus();
                if (selectionStart !== undefined) {
                    el.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }
    }

    /**
     * 生命周期：首次渲染後執行
     */
    afterFirstRender() {}

    /**
     * 國際化翻譯輔助函式
     */
    $t(key, params = {}) {
        return i18n.t(key, params);
    }

    /**
     * 模擬插槽功能
     * @param {string} name 插槽名稱 (不傳則為預設插槽)
     */
    $slot(name = '') {
        const selector = name ? `[slot="${name}"]` : ':not([slot])';
        const templates = Array.from(this.querySelectorAll(selector));
        return templates.map(t => t.innerHTML).join('');
    }

    /**
     * 子類別必須實作此方法返回 HTML 字串
     */
    render() {
        return '';
    }
}
