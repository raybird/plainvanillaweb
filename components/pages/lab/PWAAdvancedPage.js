import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { pwaService } from "../../../lib/pwa-service.js";
import { notificationService } from "../../../lib/notification-service.js";

export class PWAAdvancedPage extends BaseComponent {
  constructor() {
    super();
    this.initReactiveState({
      fetchProgress: 0,
      activeFetchId: null,
      isListening: false
    });
  }

  connectedCallback() {
    super.connectedCallback();

    // 監聽 Background Fetch 事件
    pwaService.on('fetch-started', ({ id }) => {
      this.state.activeFetchId = id;
      this.state.fetchProgress = 0;
      notificationService.info(`背景下載已啟動: ${id}`);
    });

    pwaService.on('fetch-progress', ({ percent }) => {
      this.state.fetchProgress = percent;
    });

    pwaService.on('fetch-success', ({ id }) => {
      this.state.activeFetchId = null;
      this.state.fetchProgress = 100;
      notificationService.success(`任務 ${id} 已存入快取！`);
    });
  }

  async testSync() {
    try {
      await pwaService.registerSync('sync-actions');
      notificationService.success('背景同步 (One-off) 已註冊！當網路恢復時將執行。');
    } catch (err) {
      notificationService.error(err.message);
    }
  }

  async testPeriodicSync() {
    try {
      await pwaService.registerPeriodicSync('update-cache', 24 * 60 * 60 * 1000);
      notificationService.success('定期背景同步已註冊！瀏覽器將在合適時機觸發更新。');
    } catch (err) {
      notificationService.error(err.message);
    }
  }

  async runBackgroundFetch() {
    try {
      const id = `vanilla-dl-${Date.now()}`;
      // 模擬下載大型檔案 (實際上是專案中的資產)
      const urls = [
        './index.js',
        './index.css',
        './assets/favicon.svg'
      ];

      await pwaService.fetch(id, urls, {
        title: '下載 Vanilla 核心組件',
        icons: [{ src: './assets/favicon.svg', sizes: '192x192', type: 'image/svg+xml' }],
        downloadTotal: 50 * 1024 // 模擬預估大小
      });
    } catch (err) {
      notificationService.error(err.message);
    }
  }

  render() {
    return html`
      <style>
        .pwa-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
        .pwa-card { border: 1px solid #ddd; padding: 1.5rem; border-radius: 12px; background: #fff; }
        .progress-container { height: 10px; background: #eee; border-radius: 5px; margin: 1rem 0; overflow: hidden; }
        .progress-bar { height: 100%; background: var(--primary-color); transition: width 0.3s; }
        .code-snippet { background: #2d2d2d; color: #ccc; padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; margin-top: 1rem; }
      </style>

      <h2>📦 PWA 進階功能實驗室</h2>
      <p>探索背景同步、定期更新與大型文件抓取技術。</p>

      <div class="pwa-grid">
        <!-- Background Fetch -->
        <div class="pwa-card">
          <h3>📥 Background Fetch API</h3>
          <p><small>即使關閉分頁，大型檔案下載仍持續進行。</small></p>
          
          <div class="progress-container">
            <div class="progress-bar" style="width: ${this.state.fetchProgress}%"></div>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>${this.state.activeFetchId ? `正在下載: ${this.state.activeFetchId}` : '無進行中的任務'}</span>
            <strong>${this.state.fetchProgress}%</strong>
          </div>

          <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;" 
                  ${this.state.activeFetchId ? 'disabled' : ''}
                  onclick="this.closest('page-pwa-advanced').runBackgroundFetch()">
            啟動背景下載 (模擬)
          </button>
        </div>

        <!-- Background Sync -->
        <div class="pwa-card">
          <h3>同步機制</h3>
          <div class="btn-group">
            <button class="btn btn-secondary" onclick="this.closest('page-pwa-advanced').testSync()">
              註冊背景同步 (Sync)
            </button>
            <button class="btn btn-secondary" onclick="this.closest('page-pwa-advanced').testPeriodicSync()">
              註冊定期同步 (Periodic)
            </button>
          </div>
          <p style="margin-top: 1rem;"><small>注意：定期同步需要 PWA 已安裝且具備足夠的「使用者參與度 (Engagement Score)」。</small></p>
        </div>
      </div>

      <section style="margin-top: 2rem;">
        <h3>🎓 教學說明</h3>
        <ul>
          <li><strong>Background Fetch</strong>：適合下載影片、地圖或大型遊戲資源。下載成功後資源會自動進入 Cache Storage。</li>
          <li><strong>Background Sync</strong>：適合處理離線時的留言、送出表單，待網路恢復後由系統自動完成。</li>
          <li><strong>Periodic Sync</strong>：適合新聞、氣象等需要每日靜默更新內容的應用。</li>
        </ul>
      </section>
    `;
  }
}

customElements.define("page-pwa-advanced", PWAAdvancedPage);
