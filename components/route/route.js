import { router } from '../../lib/router.js';

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

        let match = null;
        if (path === '*') {
            // 簡易 404 邏輯
            match = true; 
        } else {
            const regex = new RegExp(`^${path.replace(/\//g, '\\/')}${exact ? '$' : ''}`, 'i');
            match = currentPath.match(regex);
        }

        if (match) {
            this.style.display = 'contents';
            // 如果有配對到，發送事件讓子組件獲取 Params (選配功能)
            this.dispatchEvent(new CustomEvent('match', { detail: { match } }));
        } else {
            this.style.display = 'none';
        }
    }
}
export const registerRoute = () => customElements.define('x-route', RouteComponent);
