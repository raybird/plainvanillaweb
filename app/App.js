import { appStore } from "../lib/store.js";
import { BaseComponent } from "../lib/base-component.js"; 
import { i18n } from "../lib/i18n-service.js"; 
import { themeService } from "../lib/theme-service.js";
import { prefetchService } from "../lib/prefetch-service.js";
import { html } from "../lib/html.js";
import "../components/AppFooter.js";
import "../components/route/switch.js"; 

export class App extends BaseComponent {
    constructor() {
        super();
    }

    async connectedCallback() {
        super.connectedCallback(); 
        themeService.init();
        
        // 啟動連結預載監聽
        prefetchService.observeLinks(this);

        if (!i18n.isInitialized) await i18n.init();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
    }

    render() {
        const t = (k) => this.$t(k);
        const currentLang = i18n.locale === 'zh-TW' ? 'English' : '中文';
        const nextLang = i18n.locale === 'zh-TW' ? 'en-US' : 'zh-TW';
        
        const currentTheme = appStore.state.theme || 'system';
        const themeLabel = {
            'light': '☀️ Light',
            'dark': '🌙 Dark',
            'system': '💻 System'
        }[currentTheme];

        return html`
            <a href="#main-content" class="skip-link" style="position: absolute; top: -40px; left: 0; background: var(--primary-color); color: white; padding: 0.5rem; z-index: 100; transition: top 0.3s;">
                ${t('Skip to Content')}
            </a>

            <app-notification></app-notification>
            <nav>
                <a href="#/" onmouseover="prefetchService.preloadModule('./components/pages/HomePage.js')">${t('app.home')}</a> | 
                <a href="#/search" onmouseover="prefetchService.preloadModule('./components/pages/RepoSearch.js')">${t('app.search')}</a> |
                <a href="#/worker" onmouseover="prefetchService.preloadModule('./components/pages/WorkerDemo.js')">${t('app.worker')}</a> |
                <a href="#/profile" onmouseover="prefetchService.preloadModule('./components/pages/Profile.js')">${t('app.profile')}</a> | 
                <a href="#/docs" onmouseover="prefetchService.preloadModule('./components/pages/Docs.js')">${t('app.docs')}</a> | 
                <a href="#/contact">${t('app.contact')}</a> | 
                <a href="#/dashboard" onmouseover="prefetchService.preloadModule('./components/pages/Dashboard.js')">${t('app.dashboard')}</a>
                <div style="float: right;">
                    <button id="lang-toggle" data-lang="${nextLang}" style="cursor: pointer; margin-right: 0.5rem;">${currentLang}</button>
                    <button id="theme-toggle" style="cursor: pointer;">${themeLabel}</button>
                </div>
            </nav>
            <hr>
            <main id="main-content" style="min-height: 60vh; outline: none;" tabindex="-1">
                <x-switch>
                    <x-route path="/" exact module="./components/pages/HomePage.js" meta-title="app.home" meta-desc="home.desc"><page-home></page-home></x-route>
                    <x-route path="/search" exact module="./components/pages/RepoSearch.js" meta-title="app.search"><page-repo-search></page-repo-search></x-route>
                    <x-route path="/worker" exact module="./components/pages/WorkerDemo.js" meta-title="app.worker"><page-worker-demo></page-worker-demo></x-route>
                    <x-route path="/profile" exact module="./components/pages/Profile.js" meta-title="app.profile" meta-desc="profile.desc"><page-profile></page-profile></x-route>
                    <x-route path="/docs" module="./components/pages/Docs.js" meta-title="app.docs"><page-docs></page-docs></x-route>
                    <x-route path="/dashboard" exact module="./components/pages/Dashboard.js" meta-title="app.dashboard"><page-dashboard></page-dashboard></x-route>
                    <x-route path="/contact" exact meta-title="app.contact">
                        <h2>${t('app.contact')} (Demo)</h2>
                        <form id="demo-form" style="display: grid; gap: 1rem; max-width: 300px;">
                            <input name="name" placeholder="${t('profile.name')}" required style="padding: 0.5rem;">
                            <textarea name="msg" placeholder="${t('profile.bio')}" required style="padding: 0.5rem;"></textarea>
                            <button type="submit" style="padding: 0.5rem; background: #28a745; color: white; border: none; cursor: pointer;">${t('profile.save')}</button>
                        </form>
                    </x-route>
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

        this.querySelector('#demo-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            appStore.state.notifications = [...appStore.state.notifications, "Message Sent!"];
            e.target.reset();
        });
    }
}
export const registerApp = () => customElements.define("x-app", App);
