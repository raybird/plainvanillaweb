import { BaseService } from './base-service.js';

/**
 * ImageService - 原生影像處理服務
 * 利用 Canvas API 實作純前端圖片濾鏡與轉換。
 */
export class ImageService extends BaseService {
    /**
     * 套用灰階濾鏡
     * @param {string} dataUrl 
     * @returns {Promise<string>} 處理後的 DataURL
     */
    async applyGrayscale(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    data[i]     = avg; // R
                    data[i + 1] = avg; // G
                    data[i + 2] = avg; // B
                }
                
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL('image/jpeg'));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    /**
     * 調整圖片大小
     * @param {string} dataUrl 
     * @param {number} width 
     * @param {number} height 
     */
    async resize(dataUrl, width, height) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }
}

export const imageService = new ImageService();
