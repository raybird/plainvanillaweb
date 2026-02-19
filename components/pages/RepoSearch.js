import { html } from '../../lib/html.js';
import { appStore } from "../../lib/store.js";
import { BaseComponent } from '../../lib/base-component.js';
import { idbService } from '../../lib/idb-service.js';
import { apiService } from '../../lib/api-service.js';
import { notificationService } from '../../lib/notification-service.js';
import { speechService } from '../../lib/speech-service.js'; // 引入語音服務
import '../VirtualList.js'; // 引入虛擬列表組件

export class RepoSearch extends BaseComponent {
    constructor() {
        super();
        this.repos = [];
        this.loading = false;
        this.initReactiveState({
            isListening: false,
            searchQuery: appStore.state.lastSearch || ''
        });
    }

    async search(query) {
        if (!query) return;
        this.state.searchQuery = query;
        
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
                `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=100`
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

    toggleVoiceSearch() {
        if (this.state.isListening) {
            speechService.stopListening();
            this.state.isListening = false;
        } else {
            try {
                speechService.startListening('en-US'); // GitHub 搜尋通常用英文
                this.state.isListening = true;
                notificationService.info('請說出專案關鍵字 (English)...');
                
                speechService.once('result', (data) => {
                    this.state.isListening = false;
                    this.querySelector('#q').value = data.text;
                    this.search(data.text);
                });
            } catch (err) {
                notificationService.error(err.message);
            }
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
                <h2>GitHub 專案搜尋 (Voice Search Demo)</h2>
                <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem;">
                    <input type="text" placeholder="搜尋專案..." id="q" value="${this.state.searchQuery}" style="padding: 0.5rem; flex: 1;">
                    <button class="btn ${this.state.isListening ? 'btn-danger' : 'btn-secondary'}" 
                            title="語音搜尋"
                            ?disabled="${!speechService.isRecognitionSupported}"
                            onclick="this.closest('page-repo-search').toggleVoiceSearch()">
                        ${this.state.isListening ? '⏹️' : '🎤'}
                    </button>
                    <button id="go" class="btn btn-primary">搜尋</button>
                </div>
                
                ${this.loading ? html`<p>正在獲取數據...</p>` : ''}
                ${!speechService.isRecognitionSupported ? html`<p style="color:red; font-size:0.7rem;">⚠️ 瀏覽器不支援語音辨識</p>` : ''}
                
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
