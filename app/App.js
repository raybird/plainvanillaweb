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
        this._unsubscribeAuth = authService.on('auth-change', this._handleAuthChange);
        prefetchService.observeLinks(this);
        
        // 監聽 hash 變化以更新側邊欄 Active 狀態
        this._handleHashChange = () => this.update();
        window.addEventListener('hashchange', this._handleHashChange);

        if (!i18n.isInitialized) await i18n.init();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribeAuth) this._unsubscribeAuth();
        window.removeEventListener('hashchange', this._handleHashChange);
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
        const currentHash = window.location.hash || '#/';

        // 定義導覽連結 (包含圖示與 Active 狀態偵測)
        const navLinks = [
            { href: '#/', label: t('app.home'), icon: '🏠', module: './components/pages/HomePage.js' },
            { href: '#/manifesto', label: '🍦 宣言', icon: '📜', module: './components/pages/ManifestoPage.js' },
            { href: '#/dashboard', label: t('app.dashboard'), icon: '📊', module: './components/pages/Dashboard.js' },
            { href: '#/search', label: t('app.search'), icon: '🔍', module: './components/pages/RepoSearch.js' },
            { href: '#/worker', label: t('app.worker'), icon: '⚡', module: './components/pages/WorkerDemo.js' },
            { href: '#/docs', label: t('app.docs'), icon: '📚', module: './components/pages/Docs.js' },
            { href: '#/analytics', label: t('app.analytics'), icon: '📈', module: './components/pages/Analytics.js' },
            { href: '#/lab', label: t('app.lab'), icon: '🧪', module: './components/pages/Lab.js' },
            { href: '#/playground', label: t('app.playground'), icon: '🎡', module: './components/pages/Playground.js' },
            { href: '#/profile', label: t('app.profile'), icon: '👤', module: './components/pages/Profile.js' },
        ].map(link => html`
            <a href="${link.href}" 
               class="nav-link ${currentHash === link.href ? 'active' : ''}" 
               onclick="this.closest('x-app').closeMenu()" 
               onmouseover="prefetchService.preloadModule('${link.module}')">
               <span>${link.icon}</span> ${link.label}
            </a>
        `);

        return html`
            <div class="app-container">
                <a href="#main-content" class="skip-link" style="position: absolute; top: -40px; left: 0; background: var(--primary-color); color: white; padding: 0.5rem; z-index: 2000; transition: top 0.3s;">
                    ${t('Skip to Content')}
                </a>

                <app-modal></app-modal>
                <app-notification></app-notification>
                
                <!-- 手機版漢堡按鈕 -->
                <button class="hamburger-btn" aria-label="Toggle Menu" onclick="this.closest('x-app').toggleMenu()">
                    <span style="font-size: 1.2rem;">${this.state.isMenuOpen ? '✕' : '☰'}</span>
                </button>

                <!-- 手機版遮罩層 -->
                <div class="menu-overlay ${this.state.isMenuOpen ? 'open' : ''}" onclick="this.closest('x-app').closeMenu()"></div>

                <!-- 側邊欄 (Sidebar) -->
                <nav class="navbar ${this.state.isMenuOpen ? 'open' : ''}">
                    <div class="nav-brand">
                        <a href="#/" class="brand-link" onclick="this.closest('x-app').closeMenu()">🍦 VanillaWeb</a>
                    </div>

                    <div class="nav-menu">
                        ${navLinks}
                    </div>

                    <!-- 底部控制區 -->
                    <div class="nav-controls">
                        <div class="user-info">
                            ${isAuthenticated ? html`
                                <span class="user-greeting">Hi, <strong>${user.username}</strong></span>
                                <button id="logout-btn" class="control-btn" style="color: #dc3545; border-color: #dc3545;">登出</button>
                            ` : html`
                                <a href="#/login" class="login-link btn btn-primary" style="min-height: 36px;" onclick="this.closest('x-app').closeMenu()">登入</a>
                            `}
                        </div>
                        <div class="control-group">
                            <button id="lang-toggle" data-lang="${nextLang}" class="control-btn" aria-label="Switch Language">${currentLang}</button>
                            <button id="theme-toggle" class="control-btn" aria-label="Switch Theme">${themeLabel}</button>
                        </div>
                    </div>
                </nav>

                <!-- 主內容區 -->
                <main id="main-content" tabindex="-1">
                    <x-switch>
                        <x-route path="/" exact module="./components/pages/HomePage.js" meta-title="app.home" meta-desc="home.desc"><page-home></page-home></x-route>
                        <x-route path="/manifesto" exact module="./components/pages/ManifestoPage.js" meta-title="Vanilla Manifesto"><page-manifesto></page-manifesto></x-route>
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
                    
                    <app-footer></app-footer>
                </main>
            </div>
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
