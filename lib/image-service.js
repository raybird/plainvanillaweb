import { BaseService } from './base-service.js';

/**
 * ImageService - 原生影像處理服務 (v2.0)
 * 利用 Canvas 2D 實作高效、零依賴的圖片濾鏡與轉換。
 */
export class ImageService extends BaseService {
    /**
     * 套用組合濾鏡
     * @param {string|HTMLImageElement} source 
     * @param {object} config { grayscale, sepia, invert, brightness }
     */
    async process(source, config = {}) {
        const img = await this._ensureImage(source);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;

        // 設定 Canvas 濾鏡字串
        const filters = [];
        if (config.grayscale) filters.push(`grayscale(${config.grayscale}%)`);
        if (config.sepia) filters.push(`sepia(${config.sepia}%)`);
        if (config.invert) filters.push(`invert(${config.invert}%)`);
        if (config.brightness) filters.push(`brightness(${config.brightness}%)`);
        
        ctx.filter = filters.join(' ') || 'none';
        ctx.drawImage(img, 0, 0);

        return canvas.toDataURL('image/webp', 0.9);
    }

    /**
     * 調整圖片大小並壓縮
     * @param {string|HTMLImageElement} source 
     * @param {number} width 
     * @param {number} quality 0 to 1
     */
    async resizeAndCompress(source, width, quality = 0.8) {
        const img = await this._ensureImage(source);
        const ratio = width / img.width;
        const height = img.height * ratio;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        return new Promise(resolve => {
            canvas.toBlob(blob => resolve(blob), 'image/webp', quality);
        });
    }

    /**
     * 輔助方法：確保輸入為 Image 物件
     */
    async _ensureImage(source) {
        if (source instanceof HTMLImageElement) return source;
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('圖片載入失敗'));
            img.src = source;
        });
    }
}

export const imageService = new ImageService();
