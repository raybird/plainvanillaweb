/**
 * CanvasChart - 原生 Canvas 高效能圖表工具
 * 專為時間序列數據設計，適合即時性能監控。
 */
export class CanvasChart {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            color: '#007bff',
            lineWidth: 2,
            maxDataPoints: 50,
            padding: 40,
            ...options
        };
        this.data = [];
    }

    /**
     * 新增數據點並重新繪製
     * @param {number} value 
     */
    addData(value) {
        this.data.push(value);
        if (this.data.length > this.options.maxDataPoints) {
            this.data.shift();
        }
        this.draw();
    }

    draw() {
        const { width, height } = this.canvas;
        const { color, lineWidth, padding } = this.options;
        const ctx = this.ctx;

        ctx.clearRect(0, 0, width, height);

        if (this.data.length < 2) return;

        const max = Math.max(...this.data, 1);
        const min = Math.min(...this.data, 0);
        const range = max - min;

        const plotWidth = width - (padding * 2);
        const plotHeight = height - (padding * 2);

        // 繪製格線
        ctx.strokeStyle = '#eee';
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, height - padding);
        ctx.lineTo(width - padding, height - padding);
        ctx.stroke();

        // 繪製路徑
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        this.data.forEach((val, i) => {
            const x = padding + (i / (this.options.maxDataPoints - 1)) * plotWidth;
            const y = (height - padding) - ((val - min) / range) * plotHeight;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.stroke();

        // 填滿下方區域
        ctx.lineTo(padding + ((this.data.length - 1) / (this.options.maxDataPoints - 1)) * plotWidth, height - padding);
        ctx.lineTo(padding, height - padding);
        ctx.fillStyle = `${color}22`; // 透明度
        ctx.fill();

        // 標註最新值
        const lastVal = this.data[this.data.length - 1];
        ctx.fillStyle = color;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(lastVal.toFixed(1), width - padding, padding - 10);
    }
}
