import { appStore } from "../lib/store.js";

export class App extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <app-notification></app-notification>
            <nav>
                <a href="#/">首頁</a> | 
                <a href="#/search">GitHub 搜尋</a> |
                <a href="#/contact">聯絡我們</a>
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

        this.querySelector('#demo-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = new FormData(e.target);
            const name = data.get('name');
            // 觸發全域通知
            appStore.state.notifications = [...appStore.state.notifications, `感謝 ${name}，您的訊息已送出！` ];
            e.target.reset();
        });
    }
}
customElements.define('x-app', App);
