import { appStore } from "../lib/store.js";

export class App extends HTMLElement {
    constructor() {
        super();
        this.updateTheme = this.updateTheme.bind(this);
    }

    connectedCallback() {
        appStore.addEventListener('change', this.updateTheme);
        this.render();
        this.applyTheme(appStore.state.theme);
    }

    updateTheme(e) {
        if (e.detail.key === 'theme') {
            this.applyTheme(e.detail.value);
        }
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    render() {
        this.innerHTML = `
            <app-notification></app-notification>
            <nav>
                <a href="#/">首頁</a> | 
                <a href="#/search">GitHub 搜尋</a> |
                <a href="#/contact">聯絡我們</a>
                <button id="theme-toggle" style="float: right; cursor: pointer;">切換主題</button>
            </nav>
            <hr>
            <x-route path="/" exact><page-home></page-home></x-route>
            <x-route path="/search" exact><page-repo-search></page-repo-search></x-route>
            <x-route path="/contact" exact>
                <h2>聯絡我們 (表單 Demo)</h2>
                <form id="demo-form" style="display: grid; gap: 1rem; max-width: 300px;">
                    <input name="name" placeholder="您的姓名" required style="padding: 0.5rem;">
                    <textarea name="msg" placeholder="您的留言" required style="padding: 0.5rem;"></textarea>
                    <button type="submit" style="padding: 0.5rem; background: #28a745; color: white; border: none; cursor: pointer;">送出訊息</button>
                </form>
            </x-route>
            <x-route path="*"><h1>404</h1></x-route>
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
customElements.define('x-app', App);
