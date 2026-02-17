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

    async update() {
        const parentSwitch = this.closest('x-switch');
        
        // 如果在 x-switch 內，則不自行判斷顯示邏輯，等待 x-switch 設置 active 屬性
        if (parentSwitch) {
            return;
        }

        const path = this.getAttribute('path') || '';
        const exact = this.hasAttribute('exact');
        const currentPath = router.currentPath;

        let match = false;
        if (path === '*') {
            match = true; 
        } else {
            const regexPath = path.replace(/:[^\s/]+/g, '([^/]+)');
            const regex = new RegExp(`^${regexPath.replace(/\//g, '\\/')}${exact ? '$' : ''}`, 'i');
            match = !!currentPath.match(regex);
        }

        if (match) {
            // 處理動態模組載入
            const modulePath = this.getAttribute('module');
            if (modulePath) {
                try {
                    await import(modulePath);
                } catch (err) {
                    console.error(`[Route] Failed to load module: ${modulePath}`, err);
                }
            }

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
    
    static get observedAttributes() {
        return ['active'];
    }

    async attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'active') {
            if (this.hasAttribute('active')) {
                // 處理動態模組載入 (針對被 x-switch 管理的情況)
                const modulePath = this.getAttribute('module');
                if (modulePath) {
                    try {
                        await import(modulePath);
                    } catch (err) {
                        console.error(`[Route] Failed to load module: ${modulePath}`, err);
                    }
                }

                this.style.display = 'contents';
                // 更新 Meta 資訊 (SEO & A11y)
                const metaTitle = this.getAttribute('meta-title');
                const metaDesc = this.getAttribute('meta-desc');
                if (metaTitle || metaDesc) {
                    metaService.update(metaTitle, metaDesc);
                }
            } else {
                this.style.display = 'none';
            }
        }
    }
}
export const registerRoute = () => customElements.define('x-route', RouteComponent);
