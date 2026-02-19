import { BaseComponent } from '../../lib/base-component.js';
import { html } from '../../lib/html.js';
import { chartService } from '../../lib/chart-service.js';

/**
 * <x-chart> - 原生數據可視化組件
 * 支援屬性: title, type (line), data (JSON string)
 */
export class NativeChart extends BaseComponent {
    static useShadow = true;

    constructor() {
        super();
        this._width = 600;
        this._height = 300;
    }

    render() {
        const title = this.getAttribute('title') || '數據分析';
        const rawData = this.getAttribute('data');
        const data = rawData ? JSON.parse(rawData) : [];
        
        const points = chartService.getPoints(data, this._width, this._height);
        const linePath = chartService.generateSmoothPath(points);

        return html`
            ${BaseComponent.css`
                :host { display: block; background: #fff; border-radius: 12px; padding: 1rem; border: 1px solid #eee; }
                .chart-header { margin-bottom: 1rem; display: flex; justify-content: space-between; }
                svg { width: 100%; height: auto; overflow: visible; }
                .line { 
                    fill: none; 
                    stroke: var(--primary-color, #007bff); 
                    stroke-width: 3; 
                    stroke-linecap: round;
                    stroke-linejoin: round;
                    transition: d 0.5s ease-in-out; /* 關鍵：平滑路徑過渡 */
                }
                .point { 
                    fill: var(--primary-color, #007bff); 
                    stroke: #fff; 
                    stroke-width: 2;
                    transition: cx 0.5s, cy 0.5s;
                }
                .grid-line { stroke: #f0f0f0; stroke-width: 1; }
                .axis-text { font-size: 10px; fill: #999; font-family: sans-serif; }
            `}
            <div class="chart-header">
                <strong>${title}</strong>
                <slot name="controls"></slot>
            </div>
            
            <svg viewBox="0 0 ${this._width} ${this._height}" preserveAspectRatio="xMidYMid meet">
                <!-- 網格與軸線 (簡單實作) -->
                <line class="grid-line" x1="40" y1="40" x2="40" y2="260" />
                <line class="grid-line" x1="40" y1="260" x2="560" y2="260" />
                
                <!-- 數據路徑 -->
                <path class="line" d="${linePath}" />
                
                <!-- 數據點 -->
                ${points.map(p => html`
                    <circle class="point" cx="${p.x}" cy="${p.y}" r="5">
                        <title>${p.val}</title>
                    </circle>
                `)}

                <!-- X 軸標籤 (簡單示範) -->
                ${points.filter((_, i) => i % 2 === 0).map(p => html`
                    <text class="axis-text" x="${p.x}" y="280" text-anchor="middle">${p.val}</text>
                `)}
            </svg>
        `;
    }
}

customElements.define('x-chart', NativeChart);
