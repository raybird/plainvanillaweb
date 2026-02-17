import { html } from '../lib/html.js';
import { BaseComponent } from '../lib/base-component.js';

/**
 * VirtualList - 原生虛擬列表組件
 * 解決大量數據渲染時的效能瓶頸。
 * 僅渲染可視區域內的項目。
 */
export class VirtualList extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            startIndex: 0,
            endIndex: 10,
            visibleItems: []
        });
        
        this._items = [];
        this._itemHeight = 80; // 預設高度
        this._containerHeight = 400;
        this._onScroll = this._onScroll.bind(this);
    }

    set props(val) {
        this._items = val.items || [];
        this._itemHeight = val.itemHeight || 80;
        this._renderItem = val.renderItem || ((item) => html`<div>${JSON.stringify(item)}</div>`);
        this._updateVisibleRange();
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('scroll', this._onScroll, { passive: true });
        // 初始化容器高度
        this.style.display = 'block';
        this.style.overflowY = 'auto';
        this.style.height = `${this._containerHeight}px`;
        this.style.position = 'relative';
    }

    _onScroll(e) {
        this._updateVisibleRange();
    }

    _updateVisibleRange() {
        const scrollTop = this.scrollTop;
        const start = Math.floor(scrollTop / this._itemHeight);
        const visibleCount = Math.ceil(this.clientHeight / this._itemHeight);
        const end = start + visibleCount + 2; // 多渲染 2 個緩衝

        if (start !== this.state.startIndex || end !== this.state.endIndex) {
            this.state.startIndex = start;
            this.state.endIndex = end;
            this.state.visibleItems = this._items.slice(start, end);
        }
    }

    render() {
        const { startIndex, visibleItems } = this.state;
        const totalHeight = this._items.length * this._itemHeight;
        const offsetY = startIndex * this._itemHeight;

        return html`
            <!-- 撐開高度的佔位元素 -->
            <div style="height: ${totalHeight}px; width: 100%; pointer-events: none; position: absolute; top: 0; left: 0;"></div>
            
            <!-- 實際渲染的項目容器 -->
            <div style="transform: translateY(${offsetY}px); width: 100%;">
                ${visibleItems.map((item, index) => html`
                    <div style="height: ${this._itemHeight}px; box-sizing: border-box; overflow: hidden;">
                        ${this._renderItem(item, startIndex + index)}
                    </div>
                `)}
            </div>
        `;
    }
}

customElements.define('v-list', VirtualList);
