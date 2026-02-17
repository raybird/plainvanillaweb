import { html } from '../../lib/html.js';
import { appStore } from "../../lib/store.js";
import { BaseComponent } from '../../lib/base-component.js';
import { idbService } from '../../lib/idb-service.js';
import { apiService } from '../../lib/api-service.js';
import { notificationService } from '../../lib/notification-service.js';
import '../VirtualList.js'; // 引入虛擬列表組件

export class RepoSearch extends BaseComponent {
    constructor() {
        super();
        this.repos = [];
        this.loading = false;
    }

    async search(query) {
        if (!query) return;
        
        const cached = await idbService.get(`repo_${query}`);
        if (cached) {
            this.repos = cached;
            this.update();
            this._syncVirtualList();
            return;
        }

        this.loading = true;
        this.update();
        try {
            const data = await apiService.fetchWithCancel(
                'github_search', 
                `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=100` // 增加數量以展示虛擬列表
            );

            if (!data) return;

            this.repos = data.items || [];
            await idbService.set(`repo_${query}`, this.repos, 30);
            appStore.state.lastSearch = query;
        } catch (err) {
            console.error('[RepoSearch] Search Error:', err);
            notificationService.error("搜尋失敗，請稍後再試。");
        } finally {
            this.loading = false;
            this.update();
            this._syncVirtualList();
        }
    }

    /**
     * 將數據同步至 v-list 組件
     */
    _syncVirtualList() {
        const vList = this.querySelector('v-list');
        if (vList && this.repos.length > 0) {
            vList.props = {
                items: this.repos,
                itemHeight: 90,
                renderItem: (r) => html`
                    <div style="padding: 10px; border-bottom: 1px solid #eee; height: 90px; box-sizing: border-box;">
                        <strong><a href="${r.html_url}" target="_blank">${r.full_name}</a></strong>
                        <br><small>⭐ ${r.stargazers_count.toLocaleString()} stars | ${r.description || '無描述'}</small>
                    </div>
                `
            };
        }
    }

    render() {
        return html`
            <div class="repo-search">
                <h2>GitHub 專案搜尋 (Virtual List Demo)</h2>
                <div style="margin-bottom: 1rem;">
                    <input type="text" placeholder="搜尋專案..." id="q" style="padding: 0.5rem; width: 250px;">
                    <button id="go" style="padding: 0.5rem;">搜尋</button>
                </div>
                
                ${this.loading ? html`<p>正在獲取數據...</p>` : ''}
                
                <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: white;">
                    <v-list style="height: 500px;"></v-list>
                </div>
            </div>
        `;
    }

    afterFirstRender() {
        this.querySelector('#go')?.addEventListener('click', () => {
            const query = this.querySelector('#q').value;
            this.search(query);
        });
        this._syncVirtualList();
    }
}
customElements.define('page-repo-search', RepoSearch);
