import { html } from '../../lib/html.js';
import { appStore } from "../../lib/store.js";
import { BaseComponent } from '../../lib/base-component.js';

export class RepoSearch extends BaseComponent {
    constructor() {
        super();
        this.repos = [];
        this.loading = false;
    }

    async search(query) {
        const cached = appStore.getCache(`repo_${query}`);
        if (cached) {
            this.repos = cached;
            this.update();
            return;
        }
        if (!query) return;
        this.loading = true;
        this.update();
        try {
            const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars`);
            const data = await res.json();
            this.repos = data.items || [];
            appStore.setCache(`repo_${query}`, this.repos);
            appStore.state.lastSearch = query;
        } catch (err) {
            console.error(err);
        } finally {
            this.loading = false;
            this.update();
        }
    }

    render() {
        return html`
            <div class="repo-search">
                <h2>GitHub 專案搜尋 (API Demo)</h2>
                <div style="margin-bottom: 1rem;">
                    <input type="text" placeholder="搜尋專案 (例如: web-components)..." id="q" style="padding: 0.5rem; width: 250px;">
                    <button id="go" style="padding: 0.5rem;">搜尋</button>
                </div>
                ${this.loading ? html`<p>正在從 GitHub 獲取數據...</p>` : ''}
                <ul>
                    ${this.repos.slice(0, 10).map(r => html`
                        <li style="margin-bottom: 0.5rem;">
                            <strong><a href="${r.html_url}" target="_blank">${r.full_name}</a></strong>
                            <br><small>⭐ ${r.stargazers_count.toLocaleString()} stars | ${r.description || '無描述'}</small>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    afterFirstRender() {
        this.querySelector('#go')?.addEventListener('click', () => {
            const query = this.querySelector('#q').value;
            this.search(query);
        });
    }
}
customElements.define('page-repo-search', RepoSearch);
