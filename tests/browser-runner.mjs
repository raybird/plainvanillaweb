#!/usr/bin/env node
/**
 * 瀏覽器端自動化測試（零依賴：只用 Node 內建模組與系統上的 Chrome，透過 Chrome DevTools Protocol 操作）
 *
 * 在兩種部署路徑下各執行一次，確保 <base> 與相對路徑在兩邊都正確：
 *   - 根目錄：      http://127.0.0.1:<port>/                （在 repo 根目錄啟動本機伺服器）
 *   - 子路徑：      http://127.0.0.1:<port>/plainvanillaweb/ （GitHub Pages）
 * 子路徑伺服器只提供 /plainvanillaweb/ 底下的檔案，路徑解析錯誤會直接 404，不會被根目錄的檔案掩蓋。
 *
 * 每種路徑檢查：
 *   1. tests/browser.html 的 BaseComponent 測試全部通過
 *   2. 整站冒煙測試：逐一開啟所有路由（含延遲載入的 Lab 子路由）與文件，
 *      不得有未捕捉的例外、console.error 或 4xx/5xx 回應
 *
 * 用法：node tests/browser-runner.mjs
 * Chrome 路徑可用 CHROME_PATH 指定；預設依序尋找 google-chrome、google-chrome-stable、chromium、chromium-browser。
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBPATH = '/plainvanillaweb/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 忽略的 console.error（正規表示式）：只放 headless 環境缺少硬體或權限造成、不代表程式有問題的錯誤。目前沒有需要忽略的項目
const IGNORED_ERRORS = [];

// ---------- 靜態檔案伺服器 ----------

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

/** @param {string} prefix 只提供這個前綴底下的檔案 */
function startServer(prefix) {
    const server = http.createServer((req, res) => {
        const { pathname } = new URL(req.url, 'http://localhost');
        if (!pathname.startsWith(prefix)) return send404(res);
        let file = path.join(ROOT, decodeURIComponent(pathname.slice(prefix.length)));
        if (!file.startsWith(ROOT)) return send404(res);
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!fs.existsSync(file)) return send404(res);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function send404(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
}

// ---------- Chrome 與 DevTools Protocol ----------

function findChrome() {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
        try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch { /* 繼續找下一個 */ }
    }
    throw new Error('找不到 Chrome，請以 CHROME_PATH 指定路徑');
}

async function launchChrome() {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvw-chrome-'));
    const args = [
        '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
        `--user-data-dir=${userDataDir}`, 'about:blank',
    ];
    // GitHub Actions 的 Ubuntu 限制了非特權 user namespace，Chrome 沙箱無法啟動
    if (process.env.CI) args.unshift('--no-sandbox');
    const proc = spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'pipe'] });

    const wsUrl = await new Promise((resolve, reject) => {
        let buffer = '';
        const timer = setTimeout(() => reject(new Error(`Chrome 啟動逾時：\n${buffer}`)), 20000);
        proc.stderr.on('data', (chunk) => {
            buffer += chunk;
            const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        proc.on('exit', (code) => reject(new Error(`Chrome 結束（${code}）：\n${buffer}`)));
    });

    const { port } = new URL(wsUrl);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    const close = async () => {
        page.ws.close();
        const exited = new Promise((resolve) => proc.once('exit', resolve));
        proc.kill();
        await Promise.race([exited, sleep(5000)]);
        // Chrome 結束後仍可能短暫寫入設定檔，失敗時重試
        fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    };
    return { page, close };
}

async function connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', reject);
    });
    let nextId = 0;
    const pending = new Map();
    const listeners = new Map();
    ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        } else if (msg.method) {
            (listeners.get(msg.method) || []).forEach((fn) => fn(msg.params));
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const on = (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]);
    const evaluate = async (expression, timeoutMs = 10000) => {
        const { result, exceptionDetails } = await Promise.race([
            send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
            sleep(timeoutMs).then(() => { throw new Error(`頁面求值逾時（${timeoutMs}ms）：${expression.slice(0, 60)}`); }),
        ]);
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
        return result.value;
    };
    return { ws, send, on, evaluate };
}

// ---------- 測試 ----------

/** 等到 predicate（頁面內的 JS 運算式）為真，逾時回傳 false */
async function waitFor(page, predicate, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try { if (await page.evaluate(predicate)) return true; } catch { /* 頁面切換中 */ }
        await sleep(100);
    }
    return false;
}

// 進行中超過這個時間的請求視為長連線（例如 Worker 腳本的完成事件發在 worker target、串流、EventSource），不再等待
const LONG_LIVED_MS = 2000;

/** 等到網路安靜 quietMs（沒有進行中的一般請求），最多等 timeoutMs */
async function waitForNetworkIdle(network, quietMs = 150, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const now = Date.now();
        const busy = [...network.inflight.values()].some((startedAt) => now - startedAt < LONG_LIVED_MS);
        if (!busy && now - network.lastActivity >= quietMs) return;
        await sleep(25);
    }
}

/** 追蹤進行中的請求（requestId -> 開始時間），供 waitForNetworkIdle 使用 */
function trackNetwork(page) {
    const network = { inflight: new Map(), lastActivity: Date.now() };
    const done = ({ requestId }) => { network.inflight.delete(requestId); network.lastActivity = Date.now(); };
    page.on('Network.requestWillBeSent', ({ requestId }) => { network.inflight.set(requestId, Date.now()); network.lastActivity = Date.now(); });
    page.on('Network.loadingFinished', done);
    page.on('Network.loadingFailed', done);
    return network;
}

/** 收集頁面上發生的問題：未捕捉的例外、console.error、4xx/5xx 回應 */
function trackProblems(page) {
    let problems = [];
    page.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) =>
        problems.push(`未捕捉的例外：${d.exception?.description?.split('\n')[0] || d.text}`));
    page.on('Runtime.consoleAPICalled', ({ type, args }) => {
        if (type !== 'error') return;
        const text = args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (!IGNORED_ERRORS.some((re) => re.test(text))) problems.push(`console.error：${text.split('\n')[0]}`);
    });
    page.on('Network.responseReceived', ({ response }) => {
        if (response.status >= 400) problems.push(`HTTP ${response.status}：${response.url}`);
    });
    return { take: () => { const p = problems; problems = []; return p; } };
}

async function runComponentTests(page, base) {
    await page.send('Page.navigate', { url: new URL('tests/browser.html', base).href });
    if (!(await waitFor(page, 'window.__TEST_RESULTS__ !== undefined', 15000))) {
        return ['tests/browser.html：逾時，沒有產生測試結果'];
    }
    const { passed, total, results } = await page.evaluate('window.__TEST_RESULTS__');
    console.log(`  BaseComponent 測試：${passed} / ${total} 通過`);
    return results.filter((r) => !r.ok).map((r) => `tests/browser.html：${r.name}：${r.error}`);
}

async function runSmokeTests(page, base, tracker, network) {
    const failures = [];
    await page.send('Page.navigate', { url: base });
    if (!(await waitFor(page, "document.querySelector('x-switch x-route[active]') !== null", 15000))) {
        return ['/：首頁沒有渲染出任何路由'];
    }

    // 逐一開啟路由；每開一頁就收集新出現的 <x-route>（例如 /lab 底下的子路由）
    const collectRoutes = `[...document.querySelectorAll('x-route')]
        .map((r) => r.getAttribute('path'))
        .filter((p) => p && p !== '*' && !p.includes(':'))`;
    const queue = ['/', ...(await page.evaluate(collectRoutes))];
    const visited = new Set();
    const docs = new Set();

    const visit = async (hash, label) => {
        const started = Date.now();
        try {
            await page.evaluate(`location.hash = ${JSON.stringify(hash)}`);
            await waitFor(page, "document.querySelector('x-switch x-route[active]') !== null", 5000);
            // 等延遲載入的模組與資料請求完成，再等兩個 frame 讓 rAF 排程的重繪跑完
            await waitForNetworkIdle(network);
            await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', 3000);
            await waitForNetworkIdle(network);
        } catch (err) {
            failures.push(`${label}：${err.message}`);
        }
        if (process.env.DEBUG) console.log(`    ${label}（${Date.now() - started}ms）`);
        // Lucide 會把 <i data-lucide> 換成 <svg>；留下來的就是沒被渲染的圖示（含 Shadow DOM 內）
        try {
            const unrendered = await page.evaluate(`(() => {
                const roots = [document, ...[...document.querySelectorAll('*')].map((el) => el.shadowRoot).filter(Boolean)];
                return [...new Set(roots.flatMap((root) => [...root.querySelectorAll('i[data-lucide]')].map((i) => i.dataset.lucide)))];
            })()`);
            if (unrendered.length) failures.push(`${label}：有圖示沒有被渲染：${unrendered.join(', ')}`);
        } catch (err) {
            failures.push(`${label}：${err.message}`);
        }
        const problems = tracker.take();
        if (problems.length) failures.push(...problems.map((p) => `${label}：${p}`));
    };

    while (queue.length) {
        const route = queue.shift();
        if (visited.has(route)) continue;
        visited.add(route);
        await visit(`#${route}`, route);
        // 必須啟用宣告這條路徑的 <x-route>；被導向別處（例如 auth-required 導向 /login）時網址必須已改變
        const activeOk = await page.evaluate(`[...document.querySelectorAll('x-route[active]')]
            .some((r) => r.getAttribute('path') === ${JSON.stringify(route)}) || location.hash !== ${JSON.stringify(`#${route}`)}`);
        if (!activeOk) {
            const active = await page.evaluate(`[...document.querySelectorAll('x-route[active]')].map((r) => r.getAttribute('path')).join(', ')`);
            failures.push(`${route}：啟用的路由不是它本身（啟用中：${active || '無'}）`);
        }
        for (const found of await page.evaluate(collectRoutes)) if (!visited.has(found)) queue.push(found);
        // 文件來源：Lab 等頁面的 #/docs/<id> 連結，以及文件頁清單的 onclick="...loadDoc('<id>')"
        const docLinks = await page.evaluate(`[
            ...[...document.querySelectorAll('[href^="#/docs/"]')]
                .map((a) => a.getAttribute('href').match(/^#\\/docs\\/([^/?#]+)/)?.[1]),
            ...[...document.querySelectorAll('[onclick*="loadDoc("]')]
                .map((el) => el.getAttribute('onclick').match(/loadDoc\\('([^']+)'\\)/)?.[1]),
        ].filter(Boolean)`);
        docLinks.forEach((d) => docs.add(d));
    }

    for (const doc of docs) await visit(`#/docs/${doc}`, `/docs/${doc}`);
    console.log(`  冒煙測試：${visited.size} 個路由、${docs.size} 份文件`);
    return failures;
}

async function main() {
    const servers = {
        '根目錄': await startServer('/'),
        '子路徑': await startServer(SUBPATH),
    };
    const { page, close } = await launchChrome();
    // 被中斷（Ctrl+C、CI 逾時）時也要關掉 Chrome，避免留下孤兒程序
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => close().finally(() => process.exit(130)));
    }
    let failed = 0;

    try {
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        // alert()/confirm() 會卡住頁面，記錄後自動關閉
        page.on('Page.javascriptDialogOpening', ({ type, message }) => {
            console.log(`  ⚠️ 自動關閉 ${type} 對話框：${message}`);
            page.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
        });
        await page.send('Network.enable');
        await page.send('Network.setCacheDisabled', { cacheDisabled: true });
        // Service Worker 會攔截請求並使用快取，自動化測試一律繞過
        await page.send('Network.setBypassServiceWorker', { bypass: true });
        const tracker = trackProblems(page);
        const network = trackNetwork(page);

        for (const [label, server] of Object.entries(servers)) {
            const prefix = label === '子路徑' ? SUBPATH : '/';
            const base = `http://127.0.0.1:${server.address().port}${prefix}`;
            console.log(`\n▶ ${label}：${base}`);

            tracker.take();
            const failures = [
                ...(await runComponentTests(page, base)),
                ...tracker.take().map((p) => `tests/browser.html：${p}`),
                ...(await runSmokeTests(page, base, tracker, network)),
            ];
            // 同一個問題常在多頁重複出現（例如背景預載失敗），只列一次並註明第一次出現的頁面與次數
            const grouped = new Map();
            for (const f of failures) {
                const [where, ...rest] = f.split('：');
                const problem = rest.join('：');
                const entry = grouped.get(problem) || { where, count: 0 };
                entry.count++;
                grouped.set(problem, entry);
            }
            for (const [problem, { where, count }] of grouped) {
                console.log(`  ❌ ${problem}\n     （首次出現於 ${where}${count > 1 ? `，共 ${count} 次` : ''}）`);
            }
            failed += grouped.size;
        }
    } finally {
        await close();
        Object.values(servers).forEach((s) => s.close());
    }

    if (failed) {
        console.log(`\n❌ 共 ${failed} 個問題`);
        process.exit(1);
    }
    console.log('\n✅ 瀏覽器測試全部通過');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
