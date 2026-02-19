import { BaseService } from './base-service.js';

/**
 * ChartService - 原生 SVG 圖表引擎
 * 提供數據縮放與路徑生成算法。
 */
export class ChartService extends BaseService {
    /**
     * 計算數據點在 SVG 中的座標
     * @param {number[]} data 原始數據陣列
     * @param {number} width 畫布寬度
     * @param {number} height 畫布高度
     * @param {number} padding 邊距
     */
    getPoints(data, width, height, padding = 40) {
        if (!data || data.length === 0) return [];

        const max = Math.max(...data, 10); // 確保最小值
        const min = Math.min(...data, 0);
        const range = max - min;
        
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;

        return data.map((val, i) => {
            const x = padding + (i * (chartWidth / (data.length - 1 || 1)));
            const y = height - padding - ((val - min) / range * chartHeight);
            return { x, y, val };
        });
    }

    /**
     * 生成折線圖路徑 (SVG Path Data)
     */
    generateLinePath(points) {
        if (points.length === 0) return '';
        return points.reduce((path, p, i) => {
            return path + (i === 0 ? `M ${p.x},${p.y}` : ` L ${p.x},${p.y}`);
        }, '');
    }

    /**
     * 生成平滑曲線路徑 (Bezier Curve)
     */
    generateSmoothPath(points) {
        if (points.length < 2) return this.generateLinePath(points);
        
        return points.reduce((path, p, i, a) => {
            if (i === 0) return `M ${p.x},${p.y}`;
            const prev = a[i - 1];
            const cp1x = prev.x + (p.x - prev.x) / 2;
            const cp2x = prev.x + (p.x - prev.x) / 2;
            return path + ` C ${cp1x},${prev.y} ${cp2x},${p.y} ${p.x},${p.y}`;
        }, '');
    }
}

export const chartService = new ChartService();
