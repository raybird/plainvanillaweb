import { i18n } from './i18n-service.js';

/**
 * BaseComponent 2.5 (Shadow DOM & Slots Enabled)
 * 支援原生插槽模擬、反應式狀態與國際化。
 * 支援可選的 Shadow DOM 隔離模式。
 */
export class BaseComponent extends HTMLElement {
    static useShadow = false;

    constructor() {
        super();
        this._isRendered = false;
        this._hasError = false;
        this._slots = new Map();
        this._handleLangChange = () => this.update();
        
        // 根據靜態配置開啟 Shadow DOM
        if (this.constructor.useShadow) {
            this.attachShadow({ mode: 'open' });
        }
    }

    /**
     * CSS 模板標籤輔助函式 (僅用於語法提示與標記)
     */
    static css(strings, ...values) {
        const raw = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
        return `<style>${raw}</style>`;
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
            
            const activeEl = document.activeElement;
            const isTyping = activeEl && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement);
            
            // 焦點與選擇範圍備份
            const activeId = activeEl ? activeEl.id : null;
            const selection = isTyping 
                ? { start: activeEl.selectionStart, end: activeEl.selectionEnd, value: activeEl.value } 
                : null;

            // 擷取內容
            this._captureSlots();

            const content = this.render();
            const rawHtml = (content && typeof content === 'object' && content.__isSafe) 
                ? content.val 
                : (content != null ? content.toString() : '');

            const container = this.shadowRoot || this;
            
            // 效能優化：如果 HTML 沒變，跳過重繪以節省資源並防止意外失焦
            if (container.innerHTML === rawHtml) return;

            container.innerHTML = rawHtml;
            
            // 恢復焦點與游標
            if (activeId) {
                const element = container.querySelector(`#${activeId}`);
                if (element) {
                    // 如果是在輸入中被重繪，且值沒變（或已被外部同步），則恢復狀態
                    if (isTyping && selection) {
                        // 優先保留目前的輸入值，防止 render 模板中的舊資料覆蓋
                        if (element.value !== selection.value) {
                            element.value = selection.value;
                        }
                        element.focus();
                        element.setSelectionRange(selection.start, selection.end);
                    } else {
                        element.focus();
                    }
                }
            }

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
        const container = this.shadowRoot || this;
        container.innerHTML = this.renderError(err);
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
