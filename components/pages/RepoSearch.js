import { html } from '../../lib/html.js';
import { appStore } from "../../lib/store.js";
import { BaseComponent } from '../../lib/base-component.js';
import { idbService } from '../../lib/idb-service.js';
import { apiService } from '../../lib/api-service.js';
import { notificationService } from '../../lib/notification-service.js';
 // 引入 APIService

export class RepoSearch extends BaseComponent {
    constructor() {
        super();
        this.repos = [];
        this.loading = false;
    }

    async search(query) {
        if (!query) return;
        
        // 優先從 IndexedDB 讀取大容量快取
        const cached = await idbService.get(`repo_${query}`);
        if (cached) {
            console.log(`[RepoSearch] Cache Hit (IDB): ${query}`);
            this.repos = cached;
            this.update();
            return;
        }

        this.loading = true;
        this.update();
        try {
            // 使用帶有取消機制的服務，key 為 'github_search'
            const data = await apiService.fetchWithCancel(
                'github_search', 
                `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars`
            );

            // 如果返回 null 代表請求被取消，不做任何動作
            if (!data) return;

            this.repos = data.items || [];
            
            // 存儲至 IndexedDB，TTL 設定為 30 分鐘
            await idbService.set(`repo_${query}`, this.repos, 30);
            
            appStore.state.lastSearch = query;
        } catch (err) {
            console.error('[RepoSearch] Search Error:', err);
            notificationService.error("搜尋失敗，請稍後再試。");
        } finally {
            this.loading = false;
            this.update();
        }
    }

    render() {
        const listItems = this.repos.slice(0, 10).map(r => html`
            <li style="margin-bottom: 0.5rem;">
                <strong><a href="${r.html_url}" target="_blank">${r.full_name}</a></strong>
                <br><small>⭐ ${r.stargazers_count.toLocaleString()} stars | ${r.description || '無描述'}</small>
            </li>
        `);

        return html`
            <div class="repo-search">
                <h2>GitHub 專案搜尋 (API Demo)</h2>
                <div style="margin-bottom: 1rem;">
                    <input type="text" placeholder="搜尋專案..." id="q" style="padding: 0.5rem; width: 250px;">
                    <button id="go" style="padding: 0.5rem;">搜尋</button>
                </div>
                ${this.loading ? html`<p>正在從 GitHub 獲取數據...</p>` : ''}
                <ul>
                    ${listItems}
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
