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
    async registerPeriodicSync(tag, minInterval = 24 * 60 * 60 * 1000) {
        if (!('serviceWorker' in navigator) || !('periodicSync' in registration)) {
            // 注意：這裡 registration 需從 ready 獲取
            const registration = await navigator.serviceWorker.ready;
            if (!registration.periodicSync) {
                throw new Error('此瀏覽器不支援 Periodic Background Sync');
            }
            
            const status = await navigator.permissions.query({
                name: 'periodic-background-sync',
            });

            if (status.state === 'granted') {
                await registration.periodicSync.register(tag, {
                    minInterval: minInterval,
                });
                this.emit('periodic-sync-registered', { tag });
            } else {
                throw new Error('未獲取 Periodic Sync 權限');
            }
        }
    }
}

export const pwaService = new PWAService();
