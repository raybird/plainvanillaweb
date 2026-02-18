import { appStore } from "../lib/store.js";
import { BaseComponent } from "../lib/base-component.js"; 
import { i18n } from "../lib/i18n-service.js"; 
import { themeService } from "../lib/theme-service.js";
import { prefetchService } from "../lib/prefetch-service.js";
import { notificationService } from "../lib/notification-service.js";
import { authService } from "../lib/auth-service.js"; 
import { html } from "../lib/html.js";
import "../components/AppFooter.js";
import "../components/Modal.js";
import "../components/route/switch.js"; 

export class App extends BaseComponent {
    constructor() {
        super();
        this._handleAuthChange = () => this.update();
        window.prefetchService = prefetchService;
        
        // 新增：選單開關狀態
        this.initReactiveState({
            isMenuOpen: false
        });
    }

    async connectedCallback() {
        super.connectedCallback(); 
        themeService.init();
        authService.addEventListener('auth-change', this._handleAuthChange);
        prefetchService.observeLinks(this);
        if (!i18n.isInitialized) await i18n.init();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        authService.removeEventListener('auth-change', this._handleAuthChange);
    }

    toggleMenu() {
        this.state.isMenuOpen = !this.state.isMenuOpen;
    }

    closeMenu() {
        this.state.isMenuOpen = false;
    }

    render() {
        const t = (k) => this.$t(k);
        const currentLang = i18n.locale === 'zh-TW' ? 'English' : '中文';
        const nextLang = i18n.locale === 'zh-TW' ? 'en-US' : 'zh-TW';
        
        const currentTheme = appStore.state.theme || 'system';
        const themeLabel = {
            'light': '☀️',
            'dark': '🌙',
            'system': '💻'
        }[currentTheme];

        const { isAuthenticated, user } = authService;

        // 定義導覽連結 (方便重複使用)
        const navLinks = html`
            <a href="#/" class="nav-link" onclick="this.closest('x-app').closeMenu()" onmouseover="prefetchService.preloadModule('./components/pages/HomePage.js')">${t('app.home')}</a>
            <a href="#/search" class="nav-link" onclick="this.closest('x-app').closeMenu()" onmouseover="prefetchService.preloadModule('./components/pages/RepoSearch.js')">${t('app.search')}</a>
            <a href="#/worker" class="nav-link" onclick="this.closest('x-app').closeMenu()" onmouseover="prefetchService.preloadModule('./components/pages/WorkerDemo.js')">${t('app.worker')}</a>
            <a href="#/profile" class="nav-link" onclick="this.closest('x-app').closeMenu()" onmouseover="prefetchService.preloadModule('./components/pages/Profile.js')">${t('app.profile')}</a>
            <a href="#/docs" class="nav-link" onclick="this.closest('x-app').closeMenu()" onmouseover="prefetchService.preloadModule('./components/pages/Docs.js')">${t('app.docs')}</a>
            <a href="#/analytics" class="nav-link" onclick="this.closest('x-app').closeMenu()" onmouseover="prefetchService.preloadModule('./components/pages/Analytics.js')">${t('app.analytics')}</a>
            <a href="#/lab" class="nav-link" onclick="this.closest('x-app').closeMenu()" onmouseover="prefetchService.preloadModule('./components/pages/Lab.js')">${t('app.lab')}</a>
            <a href="#/playground" class="nav-link" onclick="this.closest('x-app').closeMenu()" onmouseover="prefetchService.preloadModule('./components/pages/Playground.js')">${t('app.playground')}</a>
            <a href="#/dashboard" class="nav-link" onclick="this.closest('x-app').closeMenu()" onmouseover="prefetchService.preloadModule('./components/pages/Dashboard.js')">${t('app.dashboard')}</a>
        `;

        return html`
            <a href="#main-content" class="skip-link" style="position: absolute; top: -40px; left: 0; background: var(--primary-color); color: white; padding: 0.5rem; z-index: 100; transition: top 0.3s;">
                ${t('Skip to Content')}
            </a>

            <app-modal></app-modal>
            <app-notification></app-notification>
            
            <nav class="navbar">
                <div class="nav-brand">
                    <a href="#/" class="brand-link" onclick="this.closest('x-app').closeMenu()">🍦 VanillaWeb</a>
                </div>

                <!-- 漢堡選單按鈕 (手機版顯示) -->
                <button class="hamburger-btn" aria-label="Toggle Menu" onclick="this.closest('x-app').toggleMenu()">
                    <span class="bar"></span>
                    <span class="bar"></span>
                    <span class="bar"></span>
                </button>

                <!-- 桌面選單 (大螢幕顯示) -->
                <div class="nav-menu desktop-menu">
                    ${navLinks}
                </div>

                <!-- 右側控制區 -->
                <div class="nav-controls">
                    ${isAuthenticated ? html`
                        <span class="user-greeting">Hi, <strong>${user.username}</strong></span>
                        <button id="logout-btn" class="control-btn">登出</button>
                    ` : html`
                        <a href="#/login" class="login-link" onclick="this.closest('x-app').closeMenu()">登入</a>
                    `}
                    <div class="divider"></div>
                    <button id="lang-toggle" data-lang="${nextLang}" class="control-btn" aria-label="Switch Language">${currentLang}</button>
                    <button id="theme-toggle" class="control-btn" aria-label="Switch Theme">${themeLabel}</button>
                </div>
            </nav>

            <!-- 手機版下拉選單 (小螢幕且開啟時顯示) -->
            <div class="mobile-menu ${this.state.isMenuOpen ? 'open' : ''}">
                ${navLinks}
            </div>

            <main id="main-content" style="min-height: 60vh; outline: none; padding-top: 1rem;" tabindex="-1">
                <x-switch>
                    <x-route path="/" exact module="./components/pages/HomePage.js" meta-title="app.home" meta-desc="home.desc"><page-home></page-home></x-route>
                    <x-route path="/search" exact module="./components/pages/RepoSearch.js" meta-title="app.search"><page-repo-search></page-repo-search></x-route>
                    <x-route path="/worker" exact module="./components/pages/WorkerDemo.js" meta-title="app.worker"><page-worker-demo></page-worker-demo></x-route>
                    <x-route path="/profile" exact auth-required module="./components/pages/Profile.js" meta-title="app.profile" meta-desc="profile.desc"><page-profile></page-profile></x-route>
                    <x-route path="/analytics" auth-required module="./components/pages/Analytics.js" meta-title="app.analytics"><page-analytics></page-analytics></x-route>
                    <x-route path="/docs" module="./components/pages/Docs.js" meta-title="app.docs"><page-docs></page-docs></x-route>
                    <x-route path="/lab" module="./components/pages/Lab.js" meta-title="app.lab"><page-lab></page-lab></x-route>
                    <x-route path="/playground" module="./components/pages/Playground.js" meta-title="app.playground"><page-playground></page-playground></x-route>
                    <x-route path="/dashboard" exact module="./components/pages/Dashboard.js" meta-title="app.dashboard"><page-dashboard></page-dashboard></x-route>
                    <x-route path="/login" module="./components/pages/Login.js" meta-title="登入系統"><page-login></page-login></x-route>
                    <x-route path="*"><h1>404</h1><p>Page Not Found</p></x-route>
                </x-switch>
            </main>
            
            <app-footer></app-footer>
        `;
    }

    afterFirstRender() {
        this.addEventListeners();
    }

    update() {
        super.update();
        this.addEventListeners();
    }

    addEventListeners() {
        this.querySelector('#theme-toggle')?.addEventListener('click', () => {
            const modes = ['system', 'light', 'dark'];
            const current = appStore.state.theme || 'system';
            const next = modes[(modes.indexOf(current) + 1) % modes.length];
            appStore.state.theme = next;
        });

        this.querySelector('#lang-toggle')?.addEventListener('click', (e) => {
            const nextLang = e.target.dataset.lang;
            i18n.setLocale(nextLang);
        });

        this.querySelector('#logout-btn')?.addEventListener('click', () => {
            if (confirm('確定要登出嗎？')) {
                authService.logout();
                notificationService.info('已成功登出。');
            }
        });
    }
}
export const registerApp = () => customElements.define("x-app", App);
