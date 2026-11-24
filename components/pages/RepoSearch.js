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
        this._searchRevision = 0;
        this.initReactiveState({
            isListening: false,
            searchQuery: appStore.state.lastSearch || ''
        });
    }

    async search(query) {
        query = query.trim();
        if (!query) return;
        const revision = ++this._searchRevision;
        const current = () => this.isConnected && revision === this._searchRevision;
        this.state.searchQuery = query;
        this.loading = true;
        this.update();

        try {
            const cached = await idbService.getCache(`repo_${query}`).catch(() => null);
            if (!current()) return;
            const data = cached ?? (await apiService.fetchWithCancel(
                'github_search',
                `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=100`
            ))?.items;
            if (!current() || !data) return;
            this.repos = data;
            this._syncVirtualList();
            appStore.state.lastSearch = query;
            if (!cached) idbService.set(`repo_${query}`, data, 30).catch(() => {});
        } catch (err) {
            if (current()) notificationService.error(`搜尋失敗：${err.message}`);
        } finally {
            if (current()) {
                this.loading = false;
                this.update();
            }
        }
    }

    _clearSpeech() {
        this._speechSubscriptions?.forEach(off => off());
        this._speechSubscriptions = null;
        this.state.isListening = false;
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._searchRevision++;
        this.loading = false;
        if (this.state.isListening) speechService.stopListening();
        this._clearSpeech();
    }

    toggleVoiceSearch() {
        if (this.state.isListening) {
            speechService.stopListening();
            this._clearSpeech();
            return;
        }
        try {
            this._speechSubscriptions = [
                speechService.on('end', () => this._clearSpeech()),
                speechService.on('result', ({ text }) => {
                    this._clearSpeech();
                    this.querySelector('#q').value = text;
                    this.search(text);
                }),
                speechService.on('error', ({ error }) => {
                    this._clearSpeech();
                    notificationService.error(`語音辨識失敗：${error}`);
                })
            ];
            speechService.startListening('en-US');
            this.state.isListening = true;
            notificationService.info('請說出專案關鍵字 (English)...');
        } catch (err) {
            this._clearSpeech();
            notificationService.error(err.message);
        }
    }

    /**
     * 將數據同步至 v-list 組件
     */
    _syncVirtualList() {
        const vList = this.querySelector('v-list');
        if (vList) {
            vList.props = {
                items: this.repos,
                itemHeight: 90,
                renderItem: (r) => html`
                    <div style="padding: 10px; border-bottom: 1px solid var(--border-color); height: 90px; box-sizing: border-box;">
                        <strong><a href="${/^https:\/\/github\.com\//.test(r.html_url) ? r.html_url : 'https://github.com/'}" target="_blank" rel="noopener noreferrer">${r.full_name}</a></strong>
                        <br><small>⭐ ${r.stargazers_count.toLocaleString()} stars | <span style="color:var(--text-muted);">${r.description || '無描述'}</span></small>
                    </div>
                `
            };
        }
    }

    render() {
        return html`
            <div class="repo-search">
                <h2>GitHub 專案搜尋 (Voice Search Demo)</h2>
                <form style="margin-bottom: 1rem; display: flex; gap: 0.5rem;" role="search">
                    <input type="search" name="q" aria-label="搜尋 GitHub 專案" placeholder="搜尋專案..." id="q" value="${this.state.searchQuery}" style="padding: 0.5rem; flex: 1;">
                    <button type="button" class="btn ${this.state.isListening ? 'btn-danger' : 'btn-secondary'}"
                            aria-label="語音搜尋" aria-pressed="${this.state.isListening}"
                            ${!speechService.isRecognitionSupported ? 'disabled' : ''}
                            onclick="this.closest('page-repo-search').toggleVoiceSearch()">
                        ${this.state.isListening ? '⏹️' : '🎤'}
                    </button>
                    <button type="submit" class="btn btn-primary">搜尋</button>
                </form>
                
                <p role="status">${this.loading ? '正在獲取數據…' : ''}</p>
                ${!speechService.isRecognitionSupported ? html`<p style="color:red; font-size:0.7rem;">⚠️ 瀏覽器不支援語音辨識</p>` : ''}
                
                <div style="border: 1px solid var(--card-border); border-radius: 8px; overflow: hidden; background: var(--card-bg);">
                    <v-list data-persistent="repo-results" style="height: 500px;"></v-list>
                </div>
            </div>
        `;
    }

    afterFirstRender() {
        this.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            const query = this.querySelector('#q').value;
            this.search(query);
        });
        this._syncVirtualList();
    }
}
customElements.define('page-repo-search', RepoSearch);
