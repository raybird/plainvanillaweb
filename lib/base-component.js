import { i18n } from './i18n-service.js';

/**
 * BaseComponent 2.2 (Slots Enabled)
 * 支援原生插槽模擬、反應式狀態與國際化。
 * 解決了 innerHTML 覆寫原始子元素的問題。
 */
export class BaseComponent extends HTMLElement {
    constructor() {
        super();
        this._isRendered = false;
        this._hasError = false;
        this._slots = new Map();
        this._handleLangChange = () => this.update();
    }

    /**
     * 擷取原始子元素作為插槽內容
     */
    _captureSlots() {
        // 僅在第一次渲染前擷取
        if (this._isRendered) return;

        const children = Array.from(this.childNodes);
        this._slots.set('default', []);

        children.forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE && child.hasAttribute('slot')) {
                const name = child.getAttribute('slot');
                if (!this._slots.has(name)) this._slots.set(name, []);
                this._slots.get(name).push(child);
            } else {
                this._slots.get('default').push(child);
            }
        });
    }

    /**
     * 獲取插槽內容的字串表示
     * @param {string} name 插槽名稱，預設為 'default'
     * @returns {string}
     */
    $slot(name = 'default') {
        const content = this._slots.get(name) || [];
        return content.map(node => {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent;
            return node.outerHTML;
        }).join('');
    }

    $t(key, params) {
        return i18n.t(key, params);
    }

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
            
            // 擷取內容
            this._captureSlots();

            const content = this.render();
            // 如果是 SafeHTML，直接獲取內部原始字串以渲染
            // 否則進行 toString() 處理 (普通字串)
            const rawHtml = (content && typeof content === 'object' && 'val' in content) 
                ? content.val 
                : (content != null ? content.toString() : '');

            this.innerHTML = rawHtml;
            
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
