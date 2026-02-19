import { BaseService } from './base-service.js';

/**
 * BarcodeService - 原生條碼與 QR 碼辨識服務
 * 利用 Barcode Detection API 實現網頁原生掃碼。
 */
export class BarcodeService extends BaseService {
    constructor() {
        super();
        this.detector = null;
        this.isSupported = 'BarcodeDetector' in window;
        
        if (this.isSupported) {
            // 初始化常用格式
            this.detector = new BarcodeDetector({
                formats: ['qr_code', 'ean_13', 'code_128', 'data_matrix']
            });
        }
    }

    /**
     * 從來源 (Video, Image, Canvas) 辨識條碼
     * @param {CanvasImageSource} source 
     * @returns {Promise<Object[]>} 辨識結果清單
     */
    async detect(source) {
        if (!this.isSupported) throw new Error('您的瀏覽器不支援 Barcode Detection API');
        
        try {
            const barcodes = await this.detector.detect(source);
            if (barcodes.length > 0) {
                this.emit('detected', barcodes);
            }
            return barcodes;
        } catch (err) {
            console.error('[Barcode] Detection Error:', err);
            return [];
        }
    }

    /**
     * 獲取瀏覽器支援的格式清單
     */
    async getSupportedFormats() {
        if (!this.isSupported) return [];
        return await BarcodeDetector.getSupportedFormats();
    }
}

export const barcodeService = new BarcodeService();
