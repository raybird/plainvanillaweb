import { i18n } from './i18n-service.js';

/**
 * BaseComponent - Vanilla JS 反應式組件基底類別 (v4.1 - Optimized with i18n)
 * 支援深度觀察、非同步渲染與國際化輔助。
 */
export class BaseComponent extends HTMLElement {
    static useShadow = false;

    constructor() {
        super();
        this.state = {};
        this._isRendered = false;
        this._renderPending = false;
        this._slots = new Map();

        // 根據靜態配置開啟 Shadow DOM
        if (this.constructor.useShadow) {
            this.attachShadow({ mode: 'open' });
        }
    }

    /**
     * CSS 模板標籤輔助函式
     */
    static css(strings, ...values) {
        const raw = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
        return `<style>${raw}</style>`;
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
        if (obj === null || typeof obj !== 'object') return obj;

        const handler = {
            set: (target, key, value) => {
                if (target[key] === value) return true;
                
                target[key] = (value !== null && typeof value === 'object') 
                    ? this._createDeepProxy(value) 
                    : value;
                
                this.scheduleUpdate();
                if (typeof this.onStateChange === 'function') {
                    this.onStateChange(key, value);
                }
                return true;
            },
            get: (target, key) => {
                return target[key];
            }
        };

        // 關鍵修復：區分物件與陣列的 Proxy 標的
        const target = Array.isArray(obj) ? [] : {};
        const p = new Proxy(target, handler);
        
        // 初始值填充
        for (const [k, v] of Object.entries(obj)) {
            target[k] = (v !== null && typeof v === 'object') ? this._createDeepProxy(v) : v;
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
            this._captureSlots(); // 關鍵：在首次渲染前備份原始內容
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
     * 執行 DOM 更新並保護使用者輸入狀態與持久節點
     */
    update() {
        const activeId = document.activeElement?.id;
        const selectionStart = document.activeElement?.selectionStart;
        const selectionEnd = document.activeElement?.selectionEnd;

        const container = this.shadowRoot || this;

        // 1. 識別並暫存持久節點
        const persistentNodes = new Map();
        container.querySelectorAll('[data-persistent]').forEach(node => {
            persistentNodes.set(node.getAttribute('data-persistent'), node);
        });

        // 2. 執行全量重繪
        const content = this.render();
        // 如果具備 __isSafe 標記，直接獲取內部原始字串以渲染
        const rawHtml = (content && typeof content === 'object' && content.__isSafe) 
            ? content.val 
            : (content != null ? content.toString() : '');
            
        container.innerHTML = rawHtml;

        // 3. 還原持久節點至佔位符位置
        persistentNodes.forEach((node, id) => {
            const placeholder = container.querySelector(`[data-persistent-placeholder="${id}"]`);
            if (placeholder) {
                placeholder.replaceWith(node);
            }
        });

        // 4. 恢復焦點與游標位置
        if (activeId) {
            const el = container.querySelector(`#${activeId}`);
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
     * 擷取初始內容 (Slots)
     * 在首次重繪前執行，防止 innerHTML 被覆蓋後遺失使用者提供的內容
     */
    _captureSlots() {
        if (this.constructor.useShadow) return; 

        const children = Array.from(this.childNodes);
        this._slots.clear();

        children.forEach(node => {
            const slotName = (node.nodeType === Node.ELEMENT_NODE) 
                ? node.getAttribute('slot') || '' 
                : '';
            
            if (!this._slots.has(slotName)) {
                this._slots.set(slotName, []);
            }
            this._slots.get(slotName).push(node.cloneNode(true));
        });
    }

    /**
     * 模擬插槽功能 (支援預先擷取的內容)
     * @param {string} name 插槽名稱 (不傳則為預設插槽)
     */
    $slot(name = '') {
        if (this.constructor.useShadow) {
            return `<slot name="${name}"></slot>`;
        }

        const nodes = this._slots.get(name) || [];
        return nodes.map(node => {
            if (node.nodeType === Node.ELEMENT_NODE) return node.outerHTML;
            return node.textContent;
        }).join('');
    }

    /**
     * 子類別必須實作此方法返回 HTML 字串
     */
    render() {
        return '';
    }
}
