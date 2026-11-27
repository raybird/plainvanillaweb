import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";

const ISSUE_BASE = "https://github.com/raybird/plainvanillaweb/issues/";

/**
 * Solutions 目錄。`status: 'planned'` 的項目還沒有路由，只列出規劃內容，不放開啟連結。
 * 由其他區域交付的項目（Browser Cluster 由 Lab 提供）只連過去，不在 Solutions 重做。
 */
export const SOLUTIONS_CATALOG = Object.freeze([
  {
    id: "pos",
    icon: "store",
    title: "Multi-Window POS",
    kind: "商業工作流",
    status: "available",
    href: "#/solutions/pos",
    docId: "solutions/pos",
    issue: 10,
    purpose: "同一台機器上的點餐、廚房、顧客叫號、管理統計四個視窗協同運作，展示 local-first 的訂單流程。",
    capabilities: ["IndexedDB transaction", "MessageBus", "Web Locks", "多視窗 kiosk 版面"],
    limits: "展示用，不處理真實付款或個資；正式商用需要權限、後端交易與跨裝置同步。",
    howTo: "從入口依角色開啟四個視窗，走一次下單、備餐、完成、取餐。",
  },
  {
    id: "pos-v2",
    icon: "tablet-smartphone",
    title: "Multi-Window POS v2",
    kind: "商業工作流",
    status: "available",
    href: "#/solutions/pos-v2/admin",
    docId: "solutions/pos-v2",
    issue: 16,
    purpose: "店員平板與顧客手機從其他裝置加入同一份訂單：配對店員裝置、桌牌 QR Code 加入桌碼點餐、即時查單，主機分頁是唯一的權威。",
    capabilities: ["WebRTC DataChannel", "自架信令（Node／Cloudflare Worker）", "IndexedDB transaction", "Web Locks", "QR Code"],
    limits: "需要自架信令伺服器；只用 STUN，裝置要和主機在同一個網路。展示用，不處理真實付款或個資。",
    howTo: "主機頁設定信令網址，配對店員裝置、開桌並列印桌牌，再用手機掃碼點餐。",
  },
  {
    id: "farm",
    icon: "cpu",
    title: "Browser Computing Farm",
    kind: "技術應用",
    status: "available",
    href: "#/solutions/farm",
    docId: "solutions/farm",
    issue: 11,
    purpose: "多個分頁分工處理本機圖片批次（縮放、壓縮、格式轉換），節點中斷後可重新認領並恢復進度。",
    capabilities: ["DurableTaskQueue", "Web Worker", "OffscreenCanvas", "IndexedDB Blob store"],
    limits: "只在同一台機器、同源分頁之間分工；多分頁不保證比單分頁快，以實測結果為準。",
    howTo: "匯入圖片或使用內建測試資料，開多個分頁加入處理，再比較單節點與多節點的耗時。",
  },
  {
    id: "browser-cluster",
    icon: "layers",
    title: "Browser Cluster",
    kind: "協作基礎建設（Lab）",
    status: "external",
    href: "#/lab/browser-cluster",
    docId: "coordination",
    issue: 6,
    purpose: "Leader 選舉、節點探索、跨分頁 RPC 與持久工作佇列的整合實驗室。",
    capabilities: ["LeaderElection", "PeerDiscovery", "RpcChannel", "DurableTaskQueue"],
    limits: "由 Lab 交付（#6），Solutions 只提供入口，不重複實作。",
    howTo: "開多個分頁加入同一個 namespace，觀察選主、認領任務與關閉 Leader 後的接管。",
  },
]);

const STATUS_LABEL = {
  available: "可使用",
  planned: "規劃中",
  external: "Lab 提供",
};

export class SolutionsIndex extends BaseComponent {
  render() {
    return html`
      <style>
        .solutions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
        }
        .solution-card {
          padding: 1.5rem;
          border: 1px solid var(--card-border);
          border-radius: 12px;
          background: var(--card-bg);
          color: var(--text-color);
          box-shadow: var(--card-shadow);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .solution-card-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .solution-card h3 {
          margin: 0;
          color: var(--primary-color);
          font-size: 1.1rem;
        }
        .solution-kind {
          margin: 0;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .solution-status {
          margin-left: auto;
          padding: 0.15rem 0.6rem;
          border-radius: 999px;
          font-size: 0.75rem;
          border: 1px solid var(--border-color);
          color: var(--text-muted);
          white-space: nowrap;
        }
        .solution-status[data-status="available"] {
          border-color: var(--primary-color);
          color: var(--primary-color);
        }
        .solution-card dl {
          margin: 0;
          display: grid;
          gap: 0.5rem;
        }
        .solution-card dt {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-muted);
        }
        .solution-card dd {
          margin: 0;
          font-size: 0.9rem;
        }
        .solution-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .solution-tags span {
          padding: 0.1rem 0.5rem;
          border-radius: 6px;
          font-size: 0.75rem;
          background: var(--surface-color);
          border: 1px solid var(--border-color);
        }
        .solution-actions {
          margin-top: auto;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .solutions-conventions {
          margin-top: 2.5rem;
          padding: 1.25rem 1.5rem;
          border: 1px dashed var(--border-color);
          border-radius: 12px;
        }
        .solutions-conventions h2 {
          margin-top: 0;
          font-size: 1.1rem;
        }
      </style>

      <h2>Reference Applications</h2>
      <div class="solutions-grid">
        ${SOLUTIONS_CATALOG.map((item) => html`
          <article class="solution-card" data-solution="${item.id}">
            <div class="solution-card-header">
              <i data-lucide="${item.icon}"></i>
              <div>
                <h3>${item.title}</h3>
                <p class="solution-kind">${item.kind}</p>
              </div>
              <span class="solution-status" data-status="${item.status}">${STATUS_LABEL[item.status]}</span>
            </div>
            <dl>
              <div><dt>用途</dt><dd>${item.purpose}</dd></div>
              <div><dt>使用能力</dt><dd class="solution-tags">${item.capabilities.map((c) => html`<span>${c}</span>`)}</dd></div>
              <div><dt>限制</dt><dd>${item.limits}</dd></div>
              <div><dt>操作方式</dt><dd>${item.howTo}</dd></div>
            </dl>
            <div class="solution-actions">
              ${item.href ? html`<a class="btn btn-primary" href="${item.href}">開啟</a>` : ""}
              ${item.docId ? html`<a class="btn" href="#/docs/${item.docId}">文件</a>` : ""}
              <a class="btn" href="${ISSUE_BASE}${item.issue}" target="_blank" rel="noopener">Issue #${item.issue}</a>
            </div>
          </article>
        `)}
      </div>

      <section class="solutions-conventions">
        <h2>共通規範</h2>
        <p>
          每個範例使用獨立的路由、namespace 與儲存空間，可以單獨重設與卸載，只透過公開的 coordination API 協作，核心不依賴 Solutions。
        </p>
        <p>
          <a href="#/docs/solutions/conventions">Reference App 慣例</a> ·
          <a href="#/docs/solutions/reference-app-template">文件範本</a> ·
          <a href="#/docs/decisions/0108-solutions-reference-app-conventions">ADR 0108</a>
        </p>
      </section>
    `;
  }
}

customElements.define("page-solutions-index", SolutionsIndex);
