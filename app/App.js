import { appStore } from "../lib/store.js";
import { BaseComponent } from "../lib/base-component.js"; // 繼承 BaseComponent
import { i18n } from "../lib/i18n-service.js"; // 引入 i18n
import { html } from "../lib/html.js";
import "../components/AppFooter.js";
import "../components/pages/Profile.js";

export class App extends BaseComponent {
    constructor() {
        super();
        this.updateTheme = this.updateTheme.bind(this);
    }

    async connectedCallback() {
        super.connectedCallback(); // BaseComponent 的連線處理 (包含 i18n 監聽)
        appStore.addEventListener('change', this.updateTheme);
        this.applyTheme(appStore.state.theme);
        
        // 初始化 i18n (非同步)
        if (!i18n.locale) await i18n.init();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        appStore.removeEventListener('change', this.updateTheme);
    }

    updateTheme(e) { if (e.detail.key === 'theme') this.applyTheme(e.detail.value); }
    applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); }

    render() {
        // 使用 i18n.t 取得翻譯
        const t = (k) => this.$t(k);
        const currentLang = i18n.locale === 'zh-TW' ? 'English' : '中文';
        const nextLang = i18n.locale === 'zh-TW' ? 'en-US' : 'zh-TW';

        return html`
            <app-notification></app-notification>
            <nav>
                <a href="#/">${t('app.home')}</a> | 
                <a href="#/search">${t('app.search')}</a> |
                <a href="#/worker">${t('app.worker')}</a> |
                <a href="#/profile">${t('app.profile')}</a> | 
                <a href="#/contact">${t('app.contact')}</a> | 
                <a href="#/dashboard">${t('app.dashboard')}</a>
                <div style="float: right;">
                    <button id="lang-toggle" data-lang="${nextLang}" style="cursor: pointer; margin-right: 0.5rem;">${currentLang}</button>
                    <button id="theme-toggle" style="cursor: pointer;">${t('app.theme')}</button>
                </div>
            </nav>
            <hr>
            <main style="min-height: 60vh;">
                <x-route path="/" exact><page-home></page-home></x-route>
                <x-route path="/search" exact><page-repo-search></page-repo-search></x-route>
                <x-route path="/worker" exact><page-worker-demo></page-worker-demo></x-route>
                <x-route path="/profile" exact><page-profile></page-profile></x-route>
                <x-route path="/dashboard" exact><page-dashboard></page-dashboard></x-route>
                <x-route path="/contact" exact>
                    <h2>${t('app.contact')} (Demo)</h2>
                    <form id="demo-form" style="display: grid; gap: 1rem; max-width: 300px;">
                        <input name="name" placeholder="${t('profile.name')}" required style="padding: 0.5rem;">
                        <textarea name="msg" placeholder="${t('profile.bio')}" required style="padding: 0.5rem;"></textarea>
                        <button type="submit" style="padding: 0.5rem; background: #28a745; color: white; border: none; cursor: pointer;">${t('profile.save')}</button>
                    </form>
                </x-route>
                <x-route path="*"><h1>404</h1><p>Page Not Found</p></x-route>
            </main>
            
            <app-footer></app-footer>
        `;
    }

    afterFirstRender() {
        this.addEventListeners();
    }

    // 因為 BaseComponent 每次 update 都會重繪，所以事件綁定要重新執行
    // 這裡我們 override update 來確保每次重繪後都綁定
    update() {
        super.update();
        this.addEventListeners();
    }

    addEventListeners() {
        this.querySelector('#theme-toggle')?.addEventListener('click', () => {
            appStore.state.theme = appStore.state.theme === 'light' ? 'dark' : 'light';
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
