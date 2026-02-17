import { router } from '../../lib/router.js';
import { authService } from '../../lib/auth-service.js';

/**
 * x-switch 組件
 * 類似 React Router 的 <Switch>，確保同一時間只顯示第一個匹配的路由。
 * 支援 Auth Guard: 檢查路由屬性 auth-required
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
        // 如果瀏覽器支援 View Transitions API，則使用它來包裹 DOM 更新
        if (!document.startViewTransition) {
            this._performUpdate();
            return;
        }

        document.startViewTransition(() => this._performUpdate());
    }

    _performUpdate() {
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
                // Auth Guard 邏輯
                if (route.hasAttribute('auth-required') && !authService.isAuthenticated) {
                    console.log(`[Auth Guard] Protected route ${path} detected. Redirecting to login.`);
                    router.push('/login');
                    return;
                }

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
