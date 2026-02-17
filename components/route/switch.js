import { router } from '../../lib/router.js';

/**
 * x-switch 組件
 * 類似 React Router 的 <Switch>，確保同一時間只顯示第一個匹配的路由。
 * 解決 404 頁面與正常頁面同時顯示的問題。
 */
export class SwitchComponent extends HTMLElement {
    constructor() {
        super();
        this.update = this.update.bind(this);
    }

    connectedCallback() {
        router.addEventListener('route-change', this.update);
        // 等待子元素掛載完成
        setTimeout(this.update, 0);
    }

    disconnectedCallback() {
        router.removeEventListener('route-change', this.update);
    }

    update() {
        const routes = Array.from(this.querySelectorAll('x-route'));
        const currentPath = router.currentPath;
        let matched = false;

        routes.forEach(route => {
            if (matched) {
                route.removeAttribute('active');
                route.style.display = 'none';
                return;
            }

            const path = route.getAttribute('path') || '';
            const exact = route.hasAttribute('exact');

            let isMatch = false;
            if (path === '*') {
                isMatch = true; 
            } else {
                const regexPath = path.replace(/:[^\s/]+/g, '([^/]+)');
                const regex = new RegExp(`^${regexPath.replace(/\//g, '\\/')}${exact ? '$' : ''}`, 'i');
                isMatch = !!currentPath.match(regex);
            }

            if (isMatch) {
                matched = true;
                route.setAttribute('active', '');
                route.style.display = 'contents';
            } else {
                route.removeAttribute('active');
                route.style.display = 'none';
            }
        });
    }
}

customElements.define('x-switch', SwitchComponent);
