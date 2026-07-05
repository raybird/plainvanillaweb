import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

/**
 * HomePage - 符合 Vanilla Manifesto 精神的首頁
 * 核心訴求：讓訪客第一眼就感受到「瀏覽器原生能力的廣度與深度」
 */
export class HomePage extends BaseComponent {
    render() {
        const t = (k) => this.$t(k);

        // 技術標籤展示：代表實驗室涵蓋的核心 API 類別
        const apiTags = [
            { label: 'WebRTC', color: '#2563eb' },
            { label: 'WebGPU', color: '#7c3aed' },
            { label: 'Web Bluetooth', color: '#0891b2' },
            { label: 'WebCodecs', color: '#dc2626' },
            { label: 'WebAssembly', color: '#ea580c' },
            { label: 'PWA', color: '#059669' },
            { label: 'WebAuthn', color: '#0f172a' },
            { label: 'Web Serial', color: '#b45309' },
            { label: 'File System', color: '#4f46e5' },
            { label: 'Web NFC', color: '#be185d' },
            { label: 'Speech API', color: '#0369a1' },
            { label: 'Web MIDI', color: '#6d28d9' },
            { label: 'SubtleCrypto', color: '#065f46' },
            { label: 'WebSocket', color: '#1d4ed8' },
            { label: 'BroadcastChannel', color: '#9333ea' },
            { label: 'Compression Streams', color: '#854d0e' },
        ];

        return html`
            <style>
                /* ── Hero ── */
                .hero {
                    padding: 4rem 2rem 3rem;
                    text-align: center;
                    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0c4a6e 100%);
                    color: white;
                    border-radius: 20px;
                    margin-bottom: 3rem;
                    position: relative;
                    overflow: hidden;
                }
                .hero::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: radial-gradient(ellipse at 70% 30%, rgba(37,99,235,0.25) 0%, transparent 60%),
                                radial-gradient(ellipse at 20% 80%, rgba(124,58,237,0.15) 0%, transparent 50%);
                    pointer-events: none;
                }
                .hero h1 {
                    font-size: 2.8rem;
                    font-weight: 800;
                    margin: 0 0 1rem;
                    letter-spacing: -0.5px;
                    line-height: 1.2;
                }
                .hero h1 em {
                    font-style: normal;
                    background: linear-gradient(90deg, #60a5fa, #a78bfa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                .hero p {
                    font-size: 1.15rem;
                    opacity: 0.85;
                    max-width: 620px;
                    margin: 0 auto 2rem;
                    line-height: 1.7;
                }

                /* ── API Tag Cloud ── */
                .tag-cloud {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 0.5rem;
                    margin: 1.5rem auto 2.5rem;
                    max-width: 700px;
                }
                .api-tag {
                    padding: 0.3rem 0.75rem;
                    border-radius: 999px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    letter-spacing: 0.3px;
                    opacity: 0.9;
                    border: 1px solid rgba(255,255,255,0.2);
                    background: rgba(255,255,255,0.1);
                    backdrop-filter: blur(4px);
                    transition: opacity 0.2s, transform 0.2s;
                }
                .api-tag:hover {
                    opacity: 1;
                    transform: scale(1.05);
                }

                /* ── CTA 按鈕 ── */
                .hero-actions {
                    display: flex;
                    gap: 1rem;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                .btn-hero-primary {
                    background: linear-gradient(135deg, #2563eb, #7c3aed);
                    color: white;
                    padding: 0.85rem 2rem;
                    border-radius: 30px;
                    font-weight: 700;
                    font-size: 1rem;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    box-shadow: 0 4px 15px rgba(37,99,235,0.4);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .btn-hero-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 25px rgba(37,99,235,0.5);
                }
                .btn-hero-ghost {
                    background: rgba(255,255,255,0.12);
                    color: white;
                    padding: 0.85rem 1.8rem;
                    border-radius: 30px;
                    font-weight: 600;
                    font-size: 1rem;
                    text-decoration: none;
                    border: 1px solid rgba(255,255,255,0.2);
                    transition: background 0.2s;
                }
                .btn-hero-ghost:hover { background: rgba(255,255,255,0.2); }

                /* ── Nav Cards ── */
                .nav-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 3rem;
                }
                .nav-card {
                    padding: 1.75rem;
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    text-decoration: none;
                    color: inherit;
                    display: block;
                    transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
                    background: var(--card-bg, var(--card-bg));
                    position: relative;
                    overflow: hidden;
                }
                .nav-card::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 3px;
                    background: var(--card-accent, #2563eb);
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .nav-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 30px rgba(0,0,0,0.1);
                    border-color: var(--card-accent, #2563eb);
                }
                .nav-card:hover::before { opacity: 1; }
                .nav-card .icon { font-size: 2.5rem; margin-bottom: 0.75rem; display: block; }
                .nav-card h3 { margin: 0 0 0.5rem; font-size: 1.2rem; color: var(--card-accent, #2563eb); }
                .nav-card p { margin: 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.6; }
                .nav-card .badge {
                    display: inline-block;
                    margin-top: 1rem;
                    padding: 0.2rem 0.6rem;
                    background: #eff6ff;
                    color: var(--card-accent, #2563eb);
                    border-radius: 999px;
                    font-size: 0.75rem;
                    font-weight: 700;
                }

                /* ── Stats ── */
                .stats-bar {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 1rem;
                    padding: 2rem;
                    background: linear-gradient(135deg, var(--surface-color), var(--surface-color));
                    border-radius: 16px;
                    border: 1px solid var(--border-color);
                    text-align: center;
                    margin-bottom: 3rem;
                }
                .stat-item .stat-num {
                    font-size: 2.2rem;
                    font-weight: 800;
                    color: var(--primary-color, #2563eb);
                    display: block;
                    line-height: 1;
                }
                .stat-item .stat-label {
                    font-size: 0.8rem;
                    color: var(--text-subtle);
                    margin-top: 0.4rem;
                    font-weight: 500;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                }

                /* ── Quote ── */
                .manifesto-quote {
                    padding: 2rem 2.5rem;
                    border-left: 4px solid var(--primary-color, #2563eb);
                    background: var(--nav-bg, var(--surface-color));
                    border-radius: 0 12px 12px 0;
                    font-style: italic;
                    color: var(--text-muted);
                    margin-bottom: 2rem;
                }
                .manifesto-quote strong { color: var(--text-color); font-style: normal; }
                .manifesto-quote a { color: var(--primary-color, #2563eb); }

                @media (max-width: 640px) {
                    .hero { padding: 2.5rem 1.25rem 2rem; }
                    .hero h1 { font-size: 2rem; }
                    .hero p { font-size: 1rem; }
                    .stats-bar { grid-template-columns: 1fr 1fr; }
                }
            </style>

            <!-- ── Hero Section ── -->
            <section class="hero">
                <h1>🍦 Plain <em>Vanilla</em> Web</h1>
                <p>瀏覽器比你想得強大得多。<br>
                37 個原生 API 實驗，零建置步驟，直接在你的瀏覽器中運行。</p>

                <div class="tag-cloud">
                    ${apiTags.map(tag => html`
                        <span class="api-tag">${tag.label}</span>
                    `)}
                </div>

                <div class="hero-actions">
                    <a href="#/lab" class="btn-hero-primary">
                        <i data-lucide="flask-conical" style="width: 1.2em; height: 1.2em; stroke-width: 2.5;"></i> 進入實驗室
                    </a>
                    <a href="#/docs/manifesto" class="btn-hero-ghost">
                        <i data-lucide="scroll" style="width: 1.2em; height: 1.2em; stroke-width: 2;"></i> 閱讀宣言
                    </a>
                </div>
            </section>

            <!-- ── Stats Bar ── -->
            <div class="stats-bar">
                <div class="stat-item">
                    <span class="stat-num">37</span>
                    <span class="stat-label">API 實驗</span>
                </div>
                <div class="stat-item">
                    <span class="stat-num">0</span>
                    <span class="stat-label">建置步驟</span>
                </div>
                <div class="stat-item">
                    <span class="stat-num">0</span>
                    <span class="stat-label">外部依賴</span>
                </div>
                <div class="stat-item">
                    <span class="stat-num">∞</span>
                    <span class="stat-label">瀏覽器相容年限</span>
                </div>
            </div>

            <!-- ── Navigation Cards ── -->
            <h2 style="margin-bottom: 1.25rem;">📍 開始探索</h2>
            <div class="nav-grid">
                <a href="#/lab" class="nav-card" style="--card-accent: #2563eb;">
                    <span class="icon" style="color: var(--card-accent);"><i data-lucide="flask-conical" style="width: 2.2rem; height: 2.2rem; stroke-width: 1.8;"></i></span>
                    <h3>互動式實驗室</h3>
                    <p>從 WebRTC 到 WebGPU，以最純粹的原生 (Vanilla) 形態體驗 37 個前沿瀏覽器 API。</p>
                    <span class="badge">37 個實驗 →</span>
                </a>

                <a href="#/dashboard" class="nav-card" style="--card-accent: #059669;">
                    <span class="icon" style="color: var(--card-accent);"><i data-lucide="layout-dashboard" style="width: 2.2rem; height: 2.2rem; stroke-width: 1.8;"></i></span>
                    <h3>開發者儀表板</h3>
                    <p>內建網路監控、IndexedDB 統計、記憶體觀察與服務狀態 — 你的迷你 DevTools。</p>
                    <span class="badge">即時監控 →</span>
                </a>

                <a href="#/docs/manifesto" class="nav-card" style="--card-accent: #7c3aed;">
                    <span class="icon" style="color: var(--card-accent);"><i data-lucide="scroll" style="width: 2.2rem; height: 2.2rem; stroke-width: 1.8;"></i></span>
                    <h3>Vanilla Manifesto</h3>
                    <p>了解本專案的核心哲學：標準優於框架、零建置成本、透明性與安全預設值。</p>
                    <span class="badge">6 項原則 →</span>
                </a>
            </div>

            <!-- ── Manifesto Quote ── -->
            <blockquote class="manifesto-quote">
                <strong>「Frameworks come and go, but the platform is forever.」</strong><br>
                本專案透過 90+ 份架構決策紀錄 (ADR) 完整還原了從零到一的構建思維，
                證明原生開發在<strong>長期穩定性</strong>、<strong>效能</strong>與<strong>安全性</strong>上，
                與最現代的框架旗鼓相當。
                <br><br>
                <a href="#/docs/manifesto">閱讀完整宣言 →</a>
            </blockquote>
        `;
    }
}

customElements.define('page-home', HomePage);
