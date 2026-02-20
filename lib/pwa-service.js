import { BaseService } from './base-service.js';

/**
 * PWAService - 原生 PWA 進階管理服務
 * 處理安裝引導、Background Sync 與 Periodic Sync。
 */
export class PWAService extends BaseService {
    constructor() {
        super();
        this.deferredPrompt = null;
        this.canInstall = false;
        
        // 監聽安裝提示
        window.addEventListener('beforeinstallprompt', (e) => {
            // 防止瀏覽器預設顯示提示
            e.preventDefault();
            this.deferredPrompt = e;
            this.canInstall = true;
            this.emit('install-available');
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            this.canInstall = false;
            this.emit('installed');
        });
    }

    /**
     * 觸發安裝流程
     */
    async install() {
        if (!this.deferredPrompt) return;
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        this.deferredPrompt = null;
        this.canInstall = false;
        return outcome;
    }

    /**
     * 註冊背景同步 (One-off Sync)
     * @param {string} tag 同步標籤
     */
    async registerSync(tag) {
        if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
            throw new Error('此瀏覽器不支援 Background Sync');
        }
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register(tag);
        this.emit('sync-registered', { tag });
    }

    /**
     * 註冊定期背景同步 (Periodic Sync)
     * @param {string} tag 標籤
     * @param {number} minInterval 最小間隔 (ms)
     */
    /**
     * 發起 Background Fetch 任務
     * @param {string} id 任務唯一識別碼
     * @param {string[]} urls 要下載的資源列表
     * @param {object} options 顯示選項 (title, icons, downloadTotal)
     */
    async fetch(id, urls, options = {}) {
        if (!('serviceWorker' in navigator) || !('backgroundFetch' in window)) {
            throw new Error('此瀏覽器不支援 Background Fetch');
        }

        const registration = await navigator.serviceWorker.ready;
        const bgFetch = await registration.backgroundFetch.fetch(id, urls, options);
        
        this.emit('fetch-started', { id, bgFetch });
        
        // 監聽進度 (如果需要即時更新 UI)
        bgFetch.addEventListener('progress', () => {
            this.emit('fetch-progress', {
                id,
                downloaded: bgFetch.downloaded,
                downloadTotal: bgFetch.downloadTotal,
                percent: Math.round((bgFetch.downloaded / bgFetch.downloadTotal) * 100)
            });
        });

        return bgFetch;
    }

    /**
     * 獲取進行中的任務
     * @param {string} id 
     */
    async getFetch(id) {
        const registration = await navigator.serviceWorker.ready;
        return await registration.backgroundFetch.get(id);
    }

    /**
     * 獲取所有進行中的任務 ID
     */
    async getFetchIds() {
        const registration = await navigator.serviceWorker.ready;
        return await registration.backgroundFetch.getIds();
    }
}

export const pwaService = new PWAService();

// 監聽來自 Service Worker 的訊息
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'BACKGROUND_FETCH_SUCCESS') {
            pwaService.emit('fetch-success', { id: event.data.id });
        }
    });
}
