import { BaseService } from './base-service.js';

/**
 * ShareService - 原生 Web 分享服務
 * 封裝 Web Share API (navigator.share)，實現與系統分享選單的互動。
 */
export class ShareService extends BaseService {
    constructor() {
        super();
        this.isSupported = !!navigator.share;
    }

    /**
     * 分享內容至系統選單
     * @param {object} data { title, text, url, files }
     */
    async share(data) {
        if (!this.isSupported) {
            throw new Error('此瀏覽器不支援 Web Share API');
        }

        try {
            // 如果包含檔案，先檢查是否可分享
            if (data.files && navigator.canShare && !navigator.canShare({ files: data.files })) {
                throw new Error('此瀏覽器不支援分享檔案類型');
            }

            await navigator.share(data);
            this.emit('share-success', data);
            return true;
        } catch (err) {
            if (err.name === 'AbortError') {
                this.emit('share-cancelled');
                return false;
            }
            console.error('[ShareService] Share Error:', err);
            throw err;
        }
    }

    /**
     * 專用：分享當前頁面
     */
    async shareCurrentPage() {
        return this.share({
            title: document.title,
            url: window.location.href
        });
    }
}

export const shareService = new ShareService();
