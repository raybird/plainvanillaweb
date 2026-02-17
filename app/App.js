import { appStore } from "../lib/store.js";
import "../components/AppFooter.js"; // 引入 Footer 組件 (自動註冊)

export class App extends HTMLElement {
    constructor() { super(); this.updateTheme = this.updateTheme.bind(this); }
    connectedCallback() {
        appStore.addEventListener('change', this.updateTheme);
        this.render();
        this.applyTheme(appStore.state.theme);
    }
    updateTheme(e) { if (e.detail.key === 'theme') this.applyTheme(e.detail.value); }
    applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); }

    render() {
        this.innerHTML = `
            <app-notification></app-notification>
            <nav>
                <a href="#/">首頁</a> | 
                <a href="#/search">GitHub 搜尋</a> |
                <a href="#/worker">高效能運算</a> |
                <a href="#/contact">聯絡我們</a> | <a href="#/dashboard">儀表板</a>
                <button id="theme-toggle" style="float: right; cursor: pointer;">切換主題</button>
            </nav>
            <hr>
            <main style="min-height: 60vh;">
                <x-route path="/" exact><page-home></page-home></x-route>
                <x-route path="/search" exact><page-repo-search></page-repo-search></x-route>
                <x-route path="/worker" exact><page-worker-demo></page-worker-demo></x-route>
                <x-route path="/dashboard" exact><page-dashboard></page-dashboard></x-route>
                <x-route path="/contact" exact>
                    <h2>聯絡我們 (表單 Demo)</h2>
                    <form id="demo-form" style="display: grid; gap: 1rem; max-width: 300px;">
                        <input name="name" placeholder="您的姓名" required style="padding: 0.5rem;">
                        <textarea name="msg" placeholder="您的留言" required style="padding: 0.5rem;"></textarea>
                        <button type="submit" style="padding: 0.5rem; background: #28a745; color: white; border: none; cursor: pointer;">送出訊息</button>
                    </form>
                </x-route>
                <x-route path="*"><h1>404 - 找不到頁面</h1><p>請檢查您的網址或返回首頁。</p></x-route>
            </main>
            
            <app-footer></app-footer>
        `;
        this.querySelector('#theme-toggle')?.addEventListener('click', () => {
            appStore.state.theme = appStore.state.theme === 'light' ? 'dark' : 'light';
        });
        this.querySelector('#demo-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = new FormData(e.target);
            appStore.state.notifications = [...appStore.state.notifications, "感謝您的留言！" ];
            e.target.reset();
        });
    }
}
export const registerApp = () => customElements.define("x-app", App);
