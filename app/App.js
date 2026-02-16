export class App extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <nav>
                <a href="#/">首頁</a> | 
                <a href="#/about">關於</a> | 
                <a href="#/search">GitHub 搜尋 (API Demo)</a>
            </nav>
            <hr>
            <x-route path="/" exact><h1>Vanilla 首頁</h1><p>這是純原生實作的範本。</p></x-route>
            <x-route path="/about" exact><h1>關於我們</h1><p>完全不使用框架，回歸 Web 本質。</p></x-route>
            <x-route path="/search" exact><page-repo-search></page-repo-search></x-route>
            <x-route path="*"><h1>404</h1><p>找不到頁面</p></x-route>
        `;
    }
}
customElements.define('x-app', App);
