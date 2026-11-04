import { i18n } from './i18n-service.js';
import { morph, ICON_SOURCE } from './morph.js';
import { unsafe } from './html.js';

/**
 * 把 container 內尚未渲染的 <i data-lucide> 換成 svg。
 * 產生的 svg 記住來源 HTML（供 morph 判斷是否保留），並把 data-lucide 改名為 data-lucide-icon，
 * 避免之後每次呼叫 createIcons 都被 Lucide 重新產生。
 * @param {Element|ShadowRoot} container
 */
function renderIcons(container) {
    if (typeof lucide === 'undefined' || typeof lucide.createIcons !== 'function') return;
    const pending = [...container.querySelectorAll('i[data-lucide]')].map(icon => ({
        source: icon.outerHTML,
        parent: icon.parentNode,
        prev: icon.previousSibling,
    }));
    if (!pending.length) return;

    lucide.createIcons({ root: container, attrs: { class: 'lucide-icon' } });

    for (const { source, parent, prev } of pending) {
        const svg = prev ? prev.nextSibling : parent.firstChild;
        if (svg?.localName !== 'svg' || !svg.hasAttribute('data-lucide')) continue;
        svg[ICON_SOURCE] = source;
        svg.setAttribute('data-lucide-icon', svg.getAttribute('data-lucide'));
        svg.removeAttribute('data-lucide');
    }
}

/**
 * BaseComponent - Vanilla JS 反應式組件基底類別 (v4.1 - Optimized with i18n)
 * 支援深度觀察、非同步渲染與國際化輔助。
 */
export class BaseComponent extends HTMLElement {
    static useShadow = false;
    /** 首次渲染後以 morph 就地更新 DOM（ADR 0100）；設為 false 改回每次整塊重繪 innerHTML */
    static morphUpdates = true;

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
     * CSS 模板標籤輔助函式：回傳 SafeHTML 的 <style>，可直接放進 html`` 模板（內容由元件作者撰寫，不轉義）
     */
    static css(strings, ...values) {
        const raw = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
        return unsafe(`<style>${raw}</style>`);
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
     * 首次渲染寫入 innerHTML；之後以 morph 就地更新（ADR 0100），static morphUpdates = false 時改回整塊重繪。
     */
    update() {
        const activeElement = document.activeElement;
        const activeId = activeElement?.id;
        const selectionStart = activeElement?.selectionStart;
        const selectionEnd = activeElement?.selectionEnd;

        const container = this.shadowRoot || this;

        // 1. 識別並暫存持久節點
        const persistentNodes = new Map();
        container.querySelectorAll('[data-persistent]').forEach(node => {
            persistentNodes.set(node.getAttribute('data-persistent'), node);
        });

        // 2. 渲染
        const content = this.render();
        // 如果具備 __isSafe 標記，直接獲取內部原始字串以渲染
        const rawHtml = (content && typeof content === 'object' && content.__isSafe)
            ? content.val
            : (content != null ? content.toString() : '');

        if (this._isRendered && this.constructor.morphUpdates) {
            morph(container, rawHtml);
        } else {
            container.innerHTML = rawHtml;
        }

        // 3. 還原持久節點至佔位符位置（morph 已原地保留的節點不會留下佔位符）
        persistentNodes.forEach((node, id) => {
            if (node.isConnected && container.contains(node)) return; // morph 已原地保留
            const selector = `[data-persistent-placeholder="${CSS.escape(id)}"], [data-persistent="${CSS.escape(id)}"]`;
            const placeholder = [...container.querySelectorAll(selector)].find((el) => el !== node);
            if (placeholder) {
                placeholder.replaceWith(node);
            }
        });

        // 4. 恢復焦點與游標位置（morph 保留了原本的元素時焦點本來就還在，不需處理）
        if (activeId && document.activeElement !== activeElement) {
            const el = container.querySelector(`#${CSS.escape(activeId)}`);
            if (el) {
                el.focus();
                if (typeof selectionStart === 'number' && typeof el.setSelectionRange === 'function') {
                    try { el.setSelectionRange(selectionStart, selectionEnd); } catch { /* 該輸入類型不支援選取範圍 */ }
                }
            }
        }

        // 5. 整合 Lucide 圖示系統自動渲染：只掃描本元件的內容（含 Shadow DOM），不掃整份文件
        renderIcons(container);
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
