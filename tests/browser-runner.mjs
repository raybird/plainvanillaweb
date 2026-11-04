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
    // detached：Chrome 自成一個程序群組，結束時連同 GPU、renderer 等子程序一起處理
    const proc = spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    // 脫離群組後不會隨終端機的 Ctrl+C 一起結束：執行器意外退出時也要收掉 Chrome
    process.once('exit', () => {
        try {
            process.kill(-proc.pid, 'SIGKILL');
        } catch {
            // 已結束
        }
    });

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
        await killGroup(proc.pid);
        // 群組已清空，理論上不會再有人寫入；保險起見仍重試幾次，失敗只警告，不影響測試結果
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
        } catch (err) {
            console.warn(`  ⚠️ 無法移除 Chrome 暫存目錄 ${userDataDir}：${err.code || err.message}`);
        }
    };
    return { page, close };
}

/** 結束整個程序群組並等它清空；子程序還在寫設定檔時刪不掉暫存目錄 */
async function killGroup(pid) {
    const alive = () => {
        try {
            process.kill(-pid, 0);
            return true;
        } catch {
            return false;
        }
    };
    const signal = (sig) => {
        try {
            process.kill(-pid, sig);
        } catch {
            // 群組已不存在
        }
    };
    signal('SIGTERM');
    for (let waited = 0; alive() && waited < 5000; waited += 100) await sleep(100);
    if (alive()) {
        signal('SIGKILL');
        for (let waited = 0; alive() && waited < 2000; waited += 100) await sleep(100);
    }
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

    for (const doc of docs) {
        await visit(`#/docs/${doc}`, `/docs/${doc}`);
        // 文件頁必須真的載入了網址指定的文件（子元件重建／重新讀取網址的行為被改壞時會停在上一份）
        const loaded = await page.evaluate("document.querySelector('page-docs')?.state?.currentDoc ?? null");
        if (loaded !== doc) failures.push(`/docs/${doc}：文件頁載入的是 ${loaded}`);
    }
    console.log(`  冒煙測試：${visited.size} 個路由、${docs.size} 份文件`);
    return failures;
}

/** App 層級的互動：主題、語系切換與登入登出流程（驗證事件委派與重繪後監聽器仍有效） */
async function runInteractionTests(page, base, tracker, network) {
    const failures = [];
    try {
        await interact(page, base, network, failures);
    } catch (err) {
        failures.push(`互動：測試中斷：${err.message.split('\n')[0]}`);
    }
    failures.push(...tracker.take().map((p) => `互動：${p}`));
    console.log('  互動測試：主題、語系、登入登出、實驗室子頁只建立一次、音量滑桿');
    return failures;
}

async function interact(page, base, network, failures) {
    const check = (ok, message) => { if (!ok) failures.push(`互動：${message}`); };
    const settle = async (ms = 0) => {
        await waitForNetworkIdle(network);
        await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', 3000);
        if (ms) await sleep(ms);
    };
    const theme = () => page.evaluate("JSON.parse(localStorage.getItem('app_state') || '{}').theme || 'system'");

    await page.send('Page.navigate', { url: base });
    await waitFor(page, "document.querySelector('#theme-toggle') !== null", 15000);
    await page.evaluate('localStorage.clear()');
    await page.send('Page.reload');
    await waitFor(page, "document.querySelector('#theme-toggle') !== null", 15000);
    await settle();
    await page.evaluate('window.__noReload = true');

    // 主題：每按一次只前進一步（重複綁定監聽器會一次跳好幾步）
    const modes = ['system', 'light', 'dark'];
    for (let i = 0; i < 3; i++) {
        const before = await theme();
        await page.evaluate("document.querySelector('#theme-toggle').click()");
        await settle(100);
        const after = await theme();
        const expected = modes[(modes.indexOf(before) + 1) % modes.length];
        check(after === expected, `第 ${i + 1} 次切換主題後應為 ${expected}，實際為 ${after}`);
    }

    // 語系：按下後按鈕改為顯示另一個語系，再按一次切回
    const langBefore = await page.evaluate("document.querySelector('#lang-toggle').dataset.lang");
    await page.evaluate("document.querySelector('#lang-toggle').click()");
    await settle(100);
    const langAfter = await page.evaluate("document.querySelector('#lang-toggle').dataset.lang");
    check(langAfter !== langBefore, `切換語系後按鈕應改變（前後都是 ${langBefore}）`);
    await page.evaluate("document.querySelector('#lang-toggle').click()");
    await settle(100);

    // 登入：先輸入錯誤密碼，錯誤訊息重繪後再以正確密碼登入（submit 監聽器必須仍有效，否則表單會原生送出並重新載入頁面）
    const submitLogin = (password) => page.evaluate(`(() => {
        const form = document.querySelector('#login-form');
        form.username.value = 'admin';
        form.password.value = ${JSON.stringify(password)};
        form.requestSubmit();
    })()`);
    await page.evaluate("location.hash = '#/profile'");
    await waitFor(page, "location.hash === '#/login' && document.querySelector('#login-form') !== null", 5000);
    check(await page.evaluate("location.hash === '#/login'"), '未登入進入 /profile 應導向 /login');
    await submitLogin('wrong');
    await waitFor(page, "document.querySelector('.error-box') !== null", 5000);
    check(await page.evaluate("document.querySelector('.error-box') !== null"), '密碼錯誤時應顯示錯誤訊息');
    await submitLogin('1234');
    await waitFor(page, "localStorage.getItem('vanilla_auth_token') !== null", 5000);
    await settle();
    check(await page.evaluate('window.__noReload === true'), '重試登入時頁面被重新載入（submit 監聽器在重繪後遺失）');
    check(await page.evaluate("localStorage.getItem('vanilla_auth_token') !== null"), '以正確密碼重試後應登入成功');

    await page.evaluate("location.hash = '#/profile'");
    await waitFor(page, "document.querySelector('x-route[path=\"/profile\"][active]') !== null", 5000);
    check(await page.evaluate("document.querySelector('x-route[path=\"/profile\"][active]') !== null"), '登入後應能進入 /profile');

    // 實驗室的行內事件處理器：只能呼叫元件方法，參照模組內 import 的名稱會拋 ReferenceError（由 tracker 回報）
    // 同時計算子頁面被建立幾次：換頁一次應只建立一個，重複建立會讓相機等初始化多跑
    await page.evaluate(`(() => {
        window.__audioPages = 0;
        const seen = new WeakSet();
        new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            for (const el of [n, ...n.querySelectorAll('page-lab-audio')]) {
                if (el.localName === 'page-lab-audio' && !seen.has(el)) { seen.add(el); window.__audioPages++; }
            }
        }))).observe(document.body, { childList: true, subtree: true });
    })()`);
    await page.evaluate("location.hash = '#/lab/audio'");
    await waitFor(page, "document.querySelector('page-lab-audio button.btn-primary') !== null", 10000);
    await settle(300);
    check(await page.evaluate('window.__audioPages') === 1,
        `進入 #/lab/audio 應只建立一個 page-lab-audio，實際 ${await page.evaluate('window.__audioPages')} 個`);
    // 滑桿在啟動音訊引擎後才出現；headless Chrome 可建立 AudioContext（不會真的發聲）
    await page.evaluate("document.querySelector('page-lab-audio button.btn-primary').click()");
    await waitFor(page, "document.querySelector('page-lab-audio input[type=range]') !== null", 5000);
    await page.evaluate(`(() => {
        const slider = document.querySelector('page-lab-audio input[type=range]');
        slider.value = '55';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await settle();
    check(await page.evaluate("document.querySelector('page-lab-audio').state.volume === 55"), '拖動音量滑桿後音量狀態應為 55');

    // 登出（confirm 由對話框處理器自動確認）；監聽器重複綁定時會跳出多次 confirm
    if (!(await page.evaluate("document.querySelector('#logout-btn') !== null"))) {
        failures.push('互動：找不到登出按鈕（登入沒有成功）');
        return;
    }
    const dialogsBefore = page.dialogCount;
    await page.evaluate("document.querySelector('#logout-btn').click()");
    await settle();
    check(page.dialogCount - dialogsBefore === 1, `按一次登出應只跳出 1 次確認對話框，實際 ${page.dialogCount - dialogsBefore} 次（監聽器重複綁定）`);
    check(await page.evaluate("localStorage.getItem('vanilla_auth_token') === null"), '登出後應清除登入狀態');
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
        page.dialogCount = 0;
        page.on('Page.javascriptDialogOpening', ({ type, message }) => {
            page.dialogCount++;
            if (process.env.DEBUG) console.log(`  ⚠️ 自動關閉 ${type} 對話框：${message}`);
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
                ...(await runInteractionTests(page, base, tracker, network)),
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
