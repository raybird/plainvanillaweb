/**
 * 圖片處理與測試圖片產生（#11）。同一份程式在 Web Worker（OffscreenCanvas）與主執行緒（降級）共用，
 * 只依賴 `createImageBitmap` 與 canvas，匯入零副作用。
 */
import { fitWidth } from './farm-model.js';

/**
 * @param {number} width
 * @param {number} height
 * @returns {OffscreenCanvas | HTMLCanvasElement}
 */
export function createCanvas(width, height) {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/**
 * @param {OffscreenCanvas | HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, type, quality) {
    if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type, quality });
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas 無法輸出圖片'))), type, quality);
    });
}

/**
 * 縮放並轉換格式。瀏覽器不支援要求的格式時，canvas 會改輸出 PNG，回傳的 blob.type 是實際格式。
 * @param {Blob} blob
 * @param {{ maxWidth: number, format: string, quality: number }} params
 * @returns {Promise<{ blob: Blob, width: number, height: number, sourceWidth: number, sourceHeight: number }>}
 */
export async function processImage(blob, params) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(blob);
    } catch (err) {
        throw new Error(`無法解碼圖片（${err?.name ?? 'Error'}）`);
    }
    try {
        const sourceWidth = bitmap.width;
        const sourceHeight = bitmap.height;
        const { width, height } = fitWidth(sourceWidth, sourceHeight, params.maxWidth);
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, width, height);
        const out = await canvasToBlob(canvas, params.format, params.quality);
        return { blob: out, width, height, sourceWidth, sourceHeight };
    } finally {
        bitmap.close?.();
    }
}

/**
 * 產生一張內建測試圖片（漸層、圓形與編號），用來在沒有本機圖片時展示。
 * @param {number} index
 * @param {{ width?: number, height?: number }} [size]
 * @returns {Promise<Blob>} PNG
 */
export async function generateSampleImage(index, { width = 1600, height = 1200 } = {}) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const hue = (index * 47) % 360;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue} 70% 55%)`);
    gradient.addColorStop(1, `hsl(${(hue + 120) % 360} 70% 35%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 24; i++) {
        const x = ((i * 397 + index * 131) % width);
        const y = ((i * 233 + index * 71) % height);
        ctx.fillStyle = `hsl(${(hue + i * 15) % 360} 80% 70% / 0.45)`;
        ctx.beginPath();
        ctx.arc(x, y, 40 + ((i * 37) % 160), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = `bold ${Math.round(height / 6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${String(index + 1).padStart(2, '0')}`, width / 2, height / 2);
    return canvasToBlob(canvas, 'image/png');
}

/** 宣稱是 PNG、實際無法解碼的檔案，用來展示失敗與重試 */
export function createBrokenImage() {
    return new Blob([new TextEncoder().encode('this is not an image')], { type: 'image/png' });
}
