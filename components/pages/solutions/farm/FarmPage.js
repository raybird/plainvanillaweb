import { BaseComponent } from '../../../../lib/base-component.js';
import { html } from '../../../../lib/html.js';
import { DEFAULT_PARAMS, FARM_LIMITS, OUTPUT_FORMATS, RUN_STATUS, formatBytes, summarizeRun } from './farm-model.js';
import { FarmSession, detectFarmFeatures } from './farm-session.js';

const STATUS_LABEL = { pending: '等待中', running: '處理中', completed: '完成', failed: '失敗', cancelled: '已取消' };
const shortId = (id) => (id ? String(id).slice(0, 8) : '—');
const seconds = (ms) => `${(ms / 1000).toFixed(1)} 秒`;

/**
 * Browser Computing Farm（#11，`#/solutions/farm`）：多個分頁以 DurableTaskQueue 分工處理本機圖片。
 * 每個分頁都可以匯入、建立批次與觀察進度；按「加入處理」才會開始認領任務（opt-in）。
 */
export class FarmPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            params: { ...DEFAULT_PARAMS },
            lanes: 1,
            broken: false,
            notice: null,
            busy: false,
        });
        this.snapshot = null;
        this.startError = null;
        /** @type {Map<string, string>} 輸出 key → object URL */
        this._urls = new Map();
        this._loadingUrls = new Set();
    }

    connectedCallback() {
        super.connectedCallback();
        if (!FarmSession.supported) return;
        this.session = new FarmSession({
            onChange: (snapshot) => {
                this.snapshot = snapshot;
                this._syncUrls();
                this.scheduleUpdate();
            },
        });
        this.session.start().catch((err) => {
            this.startError = err;
            this.scheduleUpdate();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.session?.dispose();
        this.session = null;
        for (const url of this._urls.values()) URL.revokeObjectURL(url);
        this._urls.clear();
    }

    afterFirstRender() {
        this.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button || button.disabled) return;
            event.preventDefault();
            try {
                await this.onAction(button.dataset.action);
            } catch (err) {
                this.notify(err?.message ?? String(err), 'error');
            } finally {
                this.state.busy = false;
            }
        });
        this.addEventListener('change', async (event) => {
            const target = event.target;
            if (target.id === 'farm-files') {
                const files = [...target.files];
                target.value = '';
                try {
                    this.reportImport(await this.session.addFiles(files));
                } catch (err) {
                    this.notify(err.message, 'error');
                }
            } else if (target.id === 'farm-max-width') this.state.params.maxWidth = Number(target.value);
            else if (target.id === 'farm-format') this.state.params.format = target.value;
            else if (target.id === 'farm-quality') this.state.params.quality = Number(target.value);
            else if (target.id === 'farm-lanes') this.state.lanes = Number(target.value);
            else if (target.id === 'farm-broken') this.state.broken = target.checked;
        });
    }

    /** @param {string} text @param {'info' | 'warn' | 'error'} [level] */
    notify(text, level = 'info') {
        this.state.notice = { text, level };
    }

    reportImport({ accepted, rejected }) {
        const skipped = rejected.map((r) => `${r.name}（${r.reason}）`).join('、');
        this.notify(`已匯入 ${accepted} 張${skipped ? `；略過：${skipped}` : ''}`, rejected.length ? 'warn' : 'info');
    }

    async onAction(name) {
        this.state.busy = true;
        if (name === 'samples') {
            this.reportImport(await this.session.addSamples(8, { broken: this.state.broken }));
        } else if (name === 'run') {
            await this.session.createRun(this.state.params);
            this.notify('已建立批次。按「加入處理」讓這個分頁開始處理，或在其他分頁加入。');
        } else if (name === 'join') {
            await this.session.join(this.state.lanes);
            this.notify(`已加入處理（${this.state.lanes} 條 lane，${this.session.engine === 'worker' ? 'Web Worker + OffscreenCanvas' : '主執行緒降級模式'}）`);
        } else if (name === 'leave') {
            await this.session.leave();
            this.notify('已停止處理；執行中的任務會由其他節點接手。');
        } else if (name === 'retry') {
            const count = await this.session.retryFailed();
            this.notify(count ? `已重新排入 ${count} 個失敗任務` : '沒有失敗的任務');
        } else if (name === 'reset') {
            const report = await this.session.reset();
            const status = Object.values(report.databases)[0];
            if (status === 'blocked') this.notify('有其他分頁沒有釋放資料庫連線，請關閉其他 Farm 分頁後再試一次。', 'warn');
            else this.notify('已清除圖片、輸出、批次與佇列任務。');
        }
        this.session?.refreshSoon();
    }

    /** 最新批次的已完成輸出建立縮圖用的 object URL；不再顯示的 URL 立即釋放 */
    async _syncUrls() {
        const wanted = new Set(this._latestCompleted().map((task) => task.result.outputKey));
        for (const [key, url] of this._urls) {
            if (!wanted.has(key)) {
                URL.revokeObjectURL(url);
                this._urls.delete(key);
            }
        }
        for (const key of wanted) {
            if (this._urls.has(key) || this._loadingUrls.has(key)) continue;
            this._loadingUrls.add(key);
            const blob = await this.session?.getOutputBlob(key).catch(() => null);
            this._loadingUrls.delete(key);
            if (!blob || !this.isConnected) continue;
            this._urls.set(key, URL.createObjectURL(blob));
            this.scheduleUpdate();
        }
    }

    _latestRun() {
        return this.snapshot?.runs?.at(-1) ?? null;
    }

    _latestCompleted() {
        const run = this._latestRun();
        if (!run || !this.snapshot) return [];
        const ids = new Set(run.taskIds);
        return this.snapshot.tasks.filter((t) => ids.has(t.id) && t.status === 'completed' && t.result?.outputKey);
    }

    render() {
        const style = html`
            <style>
                .farm { display: flex; flex-direction: column; gap: 1rem; }
                .farm-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
                .farm-card { padding: 1rem; border: 1px solid var(--card-border); border-radius: 12px; background: var(--card-bg); box-shadow: var(--card-shadow); color: var(--text-color); }
                .farm-card h3 { margin: 0 0 0.6rem; font-size: 1rem; }
                .farm-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; margin-bottom: 0.5rem; }
                .farm-row label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.9rem; white-space: nowrap; }
                .farm-row input[type="file"] { min-width: 0; max-width: 100%; white-space: normal; }
                .farm-row label:has(input[type="file"]) { flex-wrap: wrap; }
                .farm-row input[type="number"] { width: 6rem; }
                .farm-muted { color: var(--text-muted); font-size: 0.85rem; }
                .farm-alert { margin: 0; padding: 0.6rem 0.9rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-color); }
                .farm-alert[data-level="warn"] { border-color: #d97706; }
                .farm-alert[data-level="error"] { border-color: var(--danger, #dc2626); }
                .farm-progress { height: 0.75rem; border-radius: 999px; background: var(--surface-color); border: 1px solid var(--border-color); overflow: hidden; }
                .farm-progress div { height: 100%; background: var(--primary-color); transition: width 0.2s; }
                .farm-stats { display: flex; flex-wrap: wrap; gap: 0.35rem 1.25rem; font-size: 0.9rem; margin-top: 0.6rem; }
                .farm-table-wrap { overflow-x: auto; }
                .farm-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
                .farm-table th, .farm-table td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border-color); white-space: nowrap; }
                .farm-gallery { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
                .farm-gallery figure { margin: 0; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.78rem; }
                .farm-gallery img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface-color); }
                .farm-nodes { margin: 0; padding-left: 1.1rem; font-size: 0.85rem; }
            </style>
        `;
        if (!FarmSession.supported) {
            return html`${style}<p class="farm-alert" data-level="error">此瀏覽器缺少必要能力（IndexedDB、BroadcastChannel 或 createImageBitmap），無法執行 Browser Computing Farm。</p>`;
        }
        if (this.startError) return html`${style}<p class="farm-alert" data-level="error">無法啟動：${this.startError.message}</p>`;
        const snapshot = this.snapshot;
        if (!snapshot) return html`${style}<p class="farm-muted">載入中…</p>`;
        if (snapshot.error) {
            // 讀取失敗時仍顯示最後一次成功的畫面，並標示錯誤
            this.state.notice ??= { text: `讀取失敗：${snapshot.error.message}`, level: 'error' };
        }
        const { missing } = detectFarmFeatures();
        const run = this._latestRun();
        const runTasks = run ? snapshot.tasks.filter((t) => run.taskIds.includes(t.id)) : [];
        const summary = run ? summarizeRun(run, runTasks, Date.now()) : null;
        const nodes = (snapshot.peers ?? []).filter((p) => p.capabilities?.imageFarm);
        const totalBytes = snapshot.inputs.reduce((sum, i) => sum + i.size, 0);
        const failedCount = snapshot.tasks.filter((t) => t.status === 'failed').length;
        const { params, busy } = this.state;
        const notice = this.state.notice;
        return html`
            ${style}
            <section class="farm" data-farm-ns="${this.session.namespace}">
                <p>
                    多個分頁從同一個 IndexedDB 持久佇列認領圖片任務，在 Web Worker 以 OffscreenCanvas 縮放與轉換格式。
                    節點中斷（關閉、重新整理）時租約到期，任務由其他節點重新認領；全部關閉後重新開啟、加入處理，未完成的任務會繼續。
                </p>
                <p class="farm-alert" data-level="warn">多分頁不一定比較快：同一台機器的 CPU 與記憶體是共用的。請用下方的批次紀錄比較實測結果。資料只存在這台瀏覽器（namespace：<code>${this.session.namespace}</code>）。</p>
                ${missing.length ? html`<p class="farm-alert" data-level="warn">缺少選用能力：${missing.join('、')}。${missing.includes('offscreenCanvas') ? '圖片改在主執行緒處理，畫面可能短暫卡頓。' : ''}</p>` : ''}
                <div aria-live="polite" class="farm-notice">${notice ? html`<p class="farm-alert" data-level="${notice.level}">${notice.text}</p>` : ''}</div>

                <div class="farm-grid">
                    <section class="farm-card" aria-label="本節點">
                        <h3>本節點 <code>${shortId(this.session.nodeId)}</code></h3>
                        <div class="farm-row">
                            <label>lane 數
                                <select id="farm-lanes" ${snapshot.joined ? 'disabled' : ''}>
                                    ${Array.from({ length: FARM_LIMITS.maxLanes }, (_, i) => i + 1).map((n) => html`<option value="${n}" ${n === this.state.lanes ? 'selected' : ''}>${n}</option>`)}
                                </select>
                            </label>
                            ${snapshot.joined
                                ? html`<button type="button" class="btn" data-action="leave">停止處理</button>`
                                : html`<button type="button" class="btn btn-primary" data-action="join" ${busy ? 'disabled' : ''}>加入處理</button>`}
                        </div>
                        <p class="farm-muted" data-joined="${String(snapshot.joined)}">
                            ${snapshot.joined ? `處理中：${snapshot.lanes} 條 lane · ${snapshot.engine === 'worker' ? 'Web Worker' : '主執行緒'} · 本節點已完成 ${snapshot.processed} 張` : '尚未加入處理（只觀察與建立批次）'}
                        </p>
                        <h3>處理節點（${nodes.length}）</h3>
                        <ul class="farm-nodes" data-farm-nodes>
                            ${nodes.length ? nodes.map((p) => html`<li>${shortId(p.nodeId)}${p.nodeId === this.session.nodeId ? '（本分頁）' : ''} · ${p.meta?.lanes ?? 0} lane · 完成 ${p.meta?.processed ?? 0}</li>`) : html`<li class="farm-muted">目前沒有節點在處理</li>`}
                        </ul>
                    </section>

                    <section class="farm-card" aria-label="輸入圖片">
                        <h3>輸入圖片（${snapshot.inputs.length} / ${FARM_LIMITS.maxFiles}，${formatBytes(totalBytes)}）</h3>
                        <div class="farm-row">
                            <label>選擇圖片 <input id="farm-files" type="file" accept="image/*" multiple /></label>
                        </div>
                        <div class="farm-row">
                            <button type="button" class="btn" data-action="samples" ${busy ? 'disabled' : ''}>產生 8 張測試圖片</button>
                            <label><input id="farm-broken" type="checkbox" ${this.state.broken ? 'checked' : ''} /> 加入 1 張損壞圖片</label>
                        </div>
                        <p class="farm-muted">單檔上限 ${formatBytes(FARM_LIMITS.maxFileBytes)}，總容量上限 ${formatBytes(FARM_LIMITS.maxTotalBytes)}。</p>
                    </section>

                    <section class="farm-card" aria-label="批次設定">
                        <h3>批次設定</h3>
                        <div class="farm-row">
                            <label>最大寬度 <input id="farm-max-width" type="number" min="${FARM_LIMITS.minWidth}" max="${FARM_LIMITS.maxWidth}" step="1" value="${params.maxWidth}" /></label>
                            <label>格式
                                <select id="farm-format">
                                    ${Object.entries(OUTPUT_FORMATS).map(([type, ext]) => html`<option value="${type}" ${type === params.format ? 'selected' : ''}>${ext.toUpperCase()}</option>`)}
                                </select>
                            </label>
                            <label>品質 <input id="farm-quality" type="number" min="0.1" max="1" step="0.05" value="${params.quality}" /></label>
                        </div>
                        <div class="farm-row">
                            <button type="button" class="btn btn-primary" data-action="run" ${snapshot.inputs.length && !busy ? '' : 'disabled'}>建立批次（${snapshot.inputs.length} 張）</button>
                            <button type="button" class="btn" data-action="retry" ${failedCount ? '' : 'disabled'}>重試失敗任務（${failedCount}）</button>
                            <button type="button" class="btn btn-danger" data-action="reset">重設 demo 資料</button>
                        </div>
                    </section>
                </div>

                ${run ? this.renderRun(run, runTasks, summary) : html`<p class="farm-muted">匯入圖片後建立批次，進度會顯示在這裡。</p>`}
                ${this.renderHistory(snapshot)}
            </section>
        `;
    }

    renderRun(run, tasks, summary) {
        if (run.status === RUN_STATUS.CREATING) {
            return html`
                <section class="farm-card" aria-label="目前批次" data-run="${run.id}" data-run-status="creating">
                    <h3>目前批次建立中（${run.inputs?.length ?? 0} 張）</h3>
                    <p class="farm-muted">正在把任務排入佇列。建立中途關閉分頁的話，其他分頁或下次開啟時會依批次清單補齊。</p>
                </section>
            `;
        }
        const completed = this._latestCompleted();
        return html`
            <section class="farm-card" aria-label="目前批次" data-run="${run.id}" data-run-finished="${String(summary.finished)}">
                <h3>目前批次 · ${run.params.maxWidth}px · ${OUTPUT_FORMATS[run.params.format].toUpperCase()} · 品質 ${run.params.quality}</h3>
                <div class="farm-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(summary.progress * 100)}"><div style="width: ${Math.round(summary.progress * 100)}%"></div></div>
                <div class="farm-stats">
                    <span data-run-stat="completed">完成 ${summary.byStatus.completed} / ${summary.total}</span>
                    <span data-run-stat="running">處理中 ${summary.byStatus.running}</span>
                    <span data-run-stat="failed">失敗 ${summary.byStatus.failed}</span>
                    <span>重試過 ${summary.retried}</span>
                    <span>耗時 ${seconds(summary.elapsedMs)}</span>
                    <span>吞吐量 ${summary.throughput.toFixed(2)} 張/秒</span>
                    <span>節點 ${summary.nodeCount}：${Object.entries(summary.perNode).map(([node, n]) => `${shortId(node)}×${n}`).join('、') || '—'}</span>
                </div>
            </section>
            <section class="farm-card" aria-label="任務">
                <h3>任務</h3>
                <div class="farm-table-wrap" tabindex="0" role="region" aria-label="任務表">
                    <table class="farm-table">
                        <thead><tr><th>圖片</th><th>狀態</th><th>嘗試</th><th>節點</th><th>耗時</th><th>輸出</th><th>錯誤</th></tr></thead>
                        <tbody>
                            ${tasks.map((t) => html`
                                <tr data-task-id="${t.id}" data-status="${t.status}" data-attempts="${t.attemptCount}">
                                    <td>${t.payload?.name}</td>
                                    <td>${STATUS_LABEL[t.status] ?? t.status}</td>
                                    <td>${t.attemptCount} / ${t.maxAttempts}</td>
                                    <td>${shortId(t.result?.nodeId ?? t.ownerId)}</td>
                                    <td>${t.result ? `${t.result.durationMs} ms` : '—'}</td>
                                    <td>${t.result ? `${t.result.width}×${t.result.height} ${formatBytes(t.result.size)}` : '—'}</td>
                                    <td>${t.lastError?.message ?? ''}</td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            </section>
            ${completed.length ? html`
                <section class="farm-card" aria-label="結果">
                    <h3>結果（${completed.length}）</h3>
                    <div class="farm-gallery">
                        ${completed.map((t) => {
                            const url = this._urls.get(t.result.outputKey);
                            return html`
                                <figure data-output-key="${t.result.outputKey}">
                                    ${url ? html`<img src="${url}" alt="${t.result.name}" />` : html`<div class="farm-muted">載入中…</div>`}
                                    <figcaption>${t.result.name} · ${formatBytes(t.result.size)}</figcaption>
                                    ${url ? html`<a href="${url}" download="${t.result.name}">下載</a>` : ''}
                                </figure>
                            `;
                        })}
                    </div>
                </section>
            ` : ''}
        `;
    }

    renderHistory(snapshot) {
        if (!snapshot.runs.length) return '';
        const now = Date.now();
        return html`
            <section class="farm-card" aria-label="批次紀錄">
                <h3>批次紀錄（比較單節點與多節點）</h3>
                <div class="farm-table-wrap" tabindex="0" role="region" aria-label="批次紀錄表">
                    <table class="farm-table">
                        <thead><tr><th>建立時間</th><th>張數</th><th>參數</th><th>實際節點數</th><th>耗時</th><th>吞吐量</th><th>重試</th><th>失敗</th></tr></thead>
                        <tbody>
                            ${[...snapshot.runs].reverse().map((run) => {
                                if (run.status === RUN_STATUS.CREATING) {
                                    return html`<tr data-history-run="${run.id}"><td>${new Date(run.createdAt).toLocaleTimeString('zh-TW', { hour12: false })}</td><td>${run.inputs?.length ?? 0}</td><td colspan="6">建立中</td></tr>`;
                                }
                                const s = summarizeRun(run, snapshot.tasks.filter((t) => run.taskIds.includes(t.id)), now);
                                return html`
                                    <tr data-history-run="${run.id}">
                                        <td>${new Date(run.createdAt).toLocaleTimeString('zh-TW', { hour12: false })}</td>
                                        <td>${s.total}</td>
                                        <td>${run.params.maxWidth}px ${OUTPUT_FORMATS[run.params.format]}</td>
                                        <td>${s.nodeCount}</td>
                                        <td>${s.finished ? seconds(s.elapsedMs) : '進行中'}</td>
                                        <td>${s.finished ? `${s.throughput.toFixed(2)} 張/秒` : '—'}</td>
                                        <td>${s.retried}</td>
                                        <td>${s.byStatus.failed}</td>
                                    </tr>
                                `;
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }
}

customElements.define('page-solution-farm', FarmPage);
