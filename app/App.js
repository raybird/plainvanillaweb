export class App extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <nav>
                <a href="#/">首頁</a> | 
                <a href="#/search">GitHub 搜尋 (API Demo)</a>
            </nav>
            <hr>
            <x-route path="/" exact><page-home></page-home></x-route>
            <x-route path="/search" exact><page-repo-search></page-repo-search></x-route>
            <x-route path="*"><h1>404</h1><p>找不到頁面</p></x-route>
        `;
    }
}
customElements.define('x-app', App);
