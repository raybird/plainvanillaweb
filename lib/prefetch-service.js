import { BaseService } from './base-service.js';

/**
 * PrefetchService - 原生資源預載服務
 * 利用 <link rel="modulepreload"> 提升動態載入的性能。
 */
export class PrefetchService extends BaseService {
    constructor() {
        super();
        this._prefetched = new Set();
    }

    /**
     * 預載指定的 JS 模組
     * @param {string} url 
     */
    async preloadModule(url) {
        if (this._prefetched.has(url)) return;

        const link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = url;
        document.head.appendChild(link);
        
        this._prefetched.add(url);
        console.log(`[Prefetch] Preloaded module: ${url}`);
        this.emit('preloaded', { url });
    }

    /**
     * 針對導航連結自動預載
     * @param {HTMLElement} root 
     */
    observeLinks(root = document.body) {
        root.addEventListener('mouseover', (e) => {
            const link = e.target.closest('a');
            if (link && link.href.includes('#/')) {
                const route = link.hash.replace('#/', '') || 'home';
                // 這裡可以根據路由對應表來預載組件
                // 暫時由外部調用特定 URL 預載
            }
        }, { passive: true });
    }
}

export const prefetchService = new PrefetchService();
