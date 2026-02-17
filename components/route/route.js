import { router } from '../../lib/router.js';
import { metaService } from '../../lib/meta-service.js';

export class RouteComponent extends HTMLElement {
    constructor() { 
        super(); 
        this.style.display = 'none'; 
        this.update = this.update.bind(this); 
    }

    connectedCallback() {
        router.addEventListener('route-change', this.update);
        this.update();
    }

    disconnectedCallback() {
        router.removeEventListener('route-change', this.update);
    }

    update() {
        const path = this.getAttribute('path') || '';
        const exact = this.hasAttribute('exact');
        const currentPath = router.currentPath;

        let match = false;
        if (path === '*') {
            // 簡易 404 邏輯 (僅當沒有其他路由匹配時)
            // 這裡的邏輯比較簡單，可能需要 Router 支援更精確的匹配順序
            // 暫時保持現狀，因為 Router 並沒有提供全域匹配結果
            match = true; 
        } else {
            // 將 path 轉為 regex，支援基本參數 (簡易版)
            // 例如 /user/:id -> /user/([^/]+)
            const regexPath = path.replace(/:[^\s/]+/g, '([^/]+)');
            const regex = new RegExp(`^${regexPath.replace(/\//g, '\\/')}${exact ? '$' : ''}`, 'i');
            match = !!currentPath.match(regex);
        }

        if (match) {
            this.style.display = 'contents';
            
            // 更新 Meta 資訊 (SEO & A11y)
            const metaTitle = this.getAttribute('meta-title');
            const metaDesc = this.getAttribute('meta-desc');
            if (metaTitle || metaDesc) {
                metaService.update(metaTitle, metaDesc);
            }

            this.dispatchEvent(new CustomEvent('match', { detail: { match } }));
        } else {
            this.style.display = 'none';
        }
    }
}
export const registerRoute = () => customElements.define('x-route', RouteComponent);
