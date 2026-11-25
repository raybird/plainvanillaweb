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
import { startRealtimeTestServer } from './helpers/realtime-server.mjs';

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
        if (server.testOffline) { req.socket.destroy(); return; }
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
    const browser = await connect(wsUrl);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);

    // newWindow：每個分頁自成一個視窗。同一視窗內只有最前面的分頁是 visible，
    // 背景分頁的 requestAnimationFrame 會暫停，BaseComponent 的重繪也跟著停住；
    // 需要同時觀察多個分頁畫面的測試（例如 POS 多視窗）要開在不同視窗。
    const openTab = async ({ newWindow = false } = {}) => {
        const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow });
        let tabPage = null;
        try {
            const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
            const target = list.find((t) => t.id === targetId);
            if (!target) throw new Error(`找不到新建立的分頁 target：${targetId}`);
            tabPage = await connect(target.webSocketDebuggerUrl);
            await tabPage.send('Page.enable');
            await tabPage.send('Runtime.enable');
            await tabPage.send('Network.enable');
            await tabPage.send('Network.setCacheDisabled', { cacheDisabled: true });
            await tabPage.send('Network.setBypassServiceWorker', { bypass: true });
            return {
                page: tabPage,
                close: async () => {
                    tabPage.ws.close();
                    await browser.send('Target.closeTarget', { targetId }).catch(() => {});
                },
            };
        } catch (err) {
            tabPage?.ws.close();
            await browser.send('Target.closeTarget', { targetId }).catch(() => {});
            throw err;
        }
    };

    const close = async () => {
        page.ws.close();
        browser.ws.close();
        await killGroup(proc.pid);
        // 群組已清空，理論上不會再有人寫入；保險起見仍重試幾次，失敗只警告，不影響測試結果
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
        } catch (err) {
            console.warn(`  ⚠️ 無法移除 Chrome 暫存目錄 ${userDataDir}：${err.code || err.message}`);
        }
    };
    return { page, openTab, close };
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

    // 站內不走 hash 路由的連結（例如 href="docs/x/"）會由伺服器處理，目標必須存在
    const checkedFiles = new Set();
    const checkFileLinks = async (label) => {
        const urls = await page.evaluate(`[...document.querySelectorAll('a[href]')]
            .map((a) => a.getAttribute('href'))
            .filter((href) => !href.startsWith('#') && !/^[a-z][a-z0-9+.-]*:/i.test(href))
            .map((href) => new URL(href, document.baseURI).href)`);
        for (const url of urls) {
            if (checkedFiles.has(url)) continue;
            checkedFiles.add(url);
            const status = await page.evaluate(`fetch(${JSON.stringify(url)}, { method: 'HEAD' }).then((r) => r.status, () => 0)`);
            if (status !== 200) failures.push(`${label}：站內連結 ${url} 回應 ${status}`);
        }
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
        await checkFileLinks(route);
        // 文件來源：Lab 等頁面的 #/docs/<id> 連結，以及文件頁清單的 onclick="...loadDoc('<id>')"
        const docLinks = await page.evaluate(`[
            ...[...document.querySelectorAll('[href^="#/docs/"]')]
                .map((a) => a.getAttribute('href').match(/^#\\/docs\\/([^?#]+)/)?.[1]?.replace(/\\/$/, '/README')),
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
    console.log('  互動測試：主題、語系、登入登出、實驗室子頁只建立一次、音量滑桿、頁面生命週期');
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

    const skip = await page.evaluate(`(() => {
        const before = location.hash;
        document.querySelector('.skip-link').click();
        return location.hash === before && document.activeElement.id === 'main-content';
    })()`);
    check(skip, '跳至主內容應移動焦點並保留路由');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
    const mobileNav = await page.evaluate(`(async () => {
        const button = document.querySelector('.hamburger-btn');
        const link = document.querySelector('#app-nav a');
        link.focus();
        const closed = document.activeElement !== link;
        button.click();
        await new Promise(requestAnimationFrame);
        link.focus();
        const opened = document.activeElement === link && button.getAttribute('aria-expanded') === 'true';
        link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await new Promise(requestAnimationFrame);
        return closed && opened && document.activeElement === button && button.getAttribute('aria-expanded') === 'false';
    })()`);
    await page.send('Emulation.clearDeviceMetricsOverride');
    check(mobileNav, '手機導覽關閉後不可聚焦，Esc 應返回開關');

    await page.evaluate("location.hash = '#/playground'");
    const preview = await waitFor(page, `(() => {
        const frame = document.querySelector('page-playground iframe');
        return frame?.src.startsWith('blob:') && frame.sandbox.contains('allow-scripts')
            && !frame.sandbox.contains('allow-same-origin') && !!frame.title;
    })()`, 4000);
    check(preview, 'Playground 應在有名稱且隔離來源的 iframe 執行預覽');
    await page.evaluate("location.hash = '#/'");
    await waitFor(page, '!!document.querySelector("page-home")');

    // 主題：每按一次只前進一步（重複綁定監聽器會一次跳好幾步）
    const modes = ['system', 'light', 'dark'];
    for (let i = 0; i < 3; i++) {
        const before = await theme();
        await page.evaluate("document.querySelector('#theme-toggle').click()");
        // 等待 App.js 400ms 主題切換 View Transition 動畫結束，避免轉場重疊卡住 rAF
        await settle(450);
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
    // 從側欄切換主題：Profile 不會因 App 重繪而重建，主題選單要自己跟著更新
    await page.evaluate("document.querySelector('#theme-toggle').click()");
    // 等待 400ms 主題切換 View Transition 動畫結束，避免隨後的 #/lab/audio 路由轉場重疊中斷
    await settle(450);
    check(await page.evaluate("document.querySelector('#theme-select')?.value") === await theme(),
        'Profile 的主題選單應反映側欄切換後的主題');

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

    // 頁面生命週期（ADR 0102）：App 重繪不重建目前的頁面；在 /lab/* 之間換頁保留 <page-lab>，只換子頁面
    await page.evaluate(`(() => {
        window.__lab = document.querySelector('page-lab');
        window.__audio = document.querySelector('page-lab-audio');
        document.querySelector('x-app').update();
    })()`);
    await settle();
    check(await page.evaluate("document.querySelector('page-lab-audio') === window.__audio && window.__audio.state.volume === 55"),
        'App 重繪後目前的頁面應保留原本的實例與狀態');
    await page.evaluate("location.hash = '#/lab/speech'");
    await waitFor(page, "document.querySelector('page-lab-speech') !== null", 10000);
    await settle();
    check(await page.evaluate("document.querySelector('page-lab') === window.__lab"), '在 /lab/* 之間換頁應保留同一個 <page-lab>');
    check(await page.evaluate("!window.__audio.isConnected && document.querySelectorAll('page-lab-audio').length === 0"),
        '離開 /lab/audio 後該頁應從 DOM 移除（才會收到 disconnectedCallback）');
    check(await page.evaluate("document.querySelector('page-lab .lab-header code')?.textContent === '#/lab/speech'"),
        '實驗室標頭顯示的路徑應隨換頁更新');

    // 登出（confirm 由對話框處理器自動確認）；監聽器重複綁定時會跳出多次 confirm
    if (!(await page.evaluate("document.querySelector('#logout-btn') !== null"))) {
        failures.push('互動：找不到登出按鈕（登入沒有成功）');
        return;
    }
    // 停在受保護頁面時登出：網址沒變，靠 router.refresh() 讓 <x-switch> 重新執行守衛
    await page.evaluate("location.hash = '#/profile'");
    await waitFor(page, "document.querySelector('x-route[path=\"/profile\"][active]') !== null", 5000);
    const dialogsBefore = page.dialogCount;
    await page.evaluate("document.querySelector('#logout-btn').click()");
    await settle();
    await waitFor(page, "location.hash === '#/login'", 5000);
    check(await page.evaluate("location.hash === '#/login' && document.querySelector('x-route[path=\"/profile\"][active]') === null"),
        '停在 /profile 時登出應導向 /login');
    check(page.dialogCount - dialogsBefore === 1, `按一次登出應只跳出 1 次確認對話框，實際 ${page.dialogCount - dialogsBefore} 次（監聽器重複綁定）`);
    check(await page.evaluate("localStorage.getItem('vanilla_auth_token') === null"), '登出後應清除登入狀態');
}

/** 雙分頁協作測試：coordination-demo.html 載入檢查 + 真實多分頁協調／選舉／RPC／探索／共享連線 */
async function runCoordinationTests(openTab, base, realtime) {
    const failures = [];
    const check = (ok, message) => { if (!ok) failures.push(`雙分頁協作：${message}`); };

    // 1. 驗證 coordination-demo.html 可正常載入、可互動且無 console.error / 例外 / 4xx-5xx
    const demoTab = await openTab();
    const demoTracker = trackProblems(demoTab.page);
    try {
        await demoTab.page.send('Page.navigate', { url: new URL('coordination-demo.html', base).href });
        const ready = await waitFor(demoTab.page, "document.querySelector('#busTabId')?.textContent !== '-' && document.querySelector('#stateA')?.textContent?.includes('count') && document.querySelector('#peerStatus')?.textContent === 'stopped'", 10000);
        check(ready, 'coordination-demo.html 未正常初始化或 PeerDiscovery 未維持 opt-in stopped');
        if (ready) {
            await demoTab.page.evaluate(`(() => {
                document.querySelector('#localCheck').checked = true;
                document.querySelector('#publishBtn').click();
                document.querySelector('#setABtn').click();
                document.querySelector('#startElectionBtn').click();
                document.querySelector('#startPeerBtn').click();
            })()`);
            const interacted = await waitFor(demoTab.page, "document.querySelector('#busLogs')?.textContent?.includes('local | ns=') && document.querySelector('#stateA')?.textContent?.includes('alpha') && document.querySelector('#leaderRole')?.textContent === 'leader' && document.querySelector('#peerStatus')?.textContent === 'running' && document.querySelector('#peerCount')?.textContent === '1'", 5000);
            check(interacted, 'coordination-demo.html 點擊 Publish / 寫入 Store / Start Election / Start Discovery 未反映於畫面');
            if (interacted) {
                await demoTab.page.evaluate(`(() => {
                    document.querySelector('#rpcAddBtn').click();
                    document.querySelector('#rpcUnknownBtn').click();
                    document.querySelector('#releaseElectionBtn').click();
                    document.querySelector('#peerCapInput').value = 'sync,ws';
                    document.querySelector('#updatePeerCapBtn').click();
                    document.querySelector('#stopPeerBtn').click();
                })()`);
                const rpcAndPeerChecked = await waitFor(demoTab.page, "document.querySelector('#rpcLogs')?.textContent?.includes('42') && document.querySelector('#rpcLogs')?.textContent?.includes('METHOD_NOT_FOUND') && document.querySelector('#leaderRole')?.textContent === 'idle' && document.querySelector('#peerStatus')?.textContent === 'stopped' && document.querySelector('#peerLogs')?.textContent?.includes('sync')", 5000);
                check(rpcAndPeerChecked, 'coordination-demo.html Phase 2/3 控制互動未正常運作');
            }
        }
        failures.push(...demoTracker.take().map((p) => `coordination-demo.html：${p}`));
    } finally {
        await demoTab.close();
    }

    // 2. 開啟真實 Chrome 分頁測試跨上下文協作（Phase 1 + Phase 2 + Phase 3）
    let tabA = null;
    let tabB = null;
    let tabC = null;
    let tabD = null;
    try {
        tabA = await openTab();
        tabB = await openTab();
        const trackerA = trackProblems(tabA.page);
        const trackerB = trackProblems(tabB.page);
        let trackerC = null;
        let trackerD = null;
        const testPageUrl = new URL('tests/coordination-browser.html', base).href;
        await Promise.all([
            tabA.page.send('Page.navigate', { url: testPageUrl }),
            tabB.page.send('Page.navigate', { url: testPageUrl }),
        ]);
        const readyA = await waitFor(tabA.page, 'window.__COORD_READY__ === true', 10000);
        const readyB = await waitFor(tabB.page, 'window.__COORD_READY__ === true', 10000);
        check(readyA && readyB, 'tests/coordination-browser.html 未就緒');

        // 2.1 在真實瀏覽器驗證 import lib/coordination.js 不建立 BroadcastChannel、WebSocket、EventSource、不開啟 IndexedDB 也不呼叫 navigator.locks.request
        const sideEffects = await tabA.page.evaluate(`(async () => {
            const OrigBC = window.BroadcastChannel;
            const OrigWS = window.WebSocket;
            const OrigES = window.EventSource;
            const locksProto = window.navigator?.locks ? Object.getPrototypeOf(window.navigator.locks) : null;
            const origRequest = locksProto?.request;
            const idbProto = window.indexedDB ? Object.getPrototypeOf(window.indexedDB) : null;
            const origIdbOpen = idbProto?.open;
            let bcCount = 0;
            let lockCount = 0;
            let wsCount = 0;
            let sseCount = 0;
            let idbOpenCount = 0;
            window.BroadcastChannel = class extends OrigBC {
                constructor(...args) { bcCount++; super(...args); }
            };
            if (OrigWS) {
                window.WebSocket = class extends OrigWS {
                    constructor(...args) { wsCount++; super(...args); }
                };
            }
            if (OrigES) {
                window.EventSource = class extends OrigES {
                    constructor(...args) { sseCount++; super(...args); }
                };
            }
            if (idbProto && origIdbOpen) {
                idbProto.open = function (...args) {
                    idbOpenCount++;
                    return origIdbOpen.apply(this, args);
                };
            }
            if (locksProto && origRequest) {
                locksProto.request = function (...args) {
                    lockCount++;
                    return origRequest.apply(this, args);
                };
            }
            try {
                await import('./lib/coordination.js?e2e_side_effect=1');
                return { bcCount, lockCount, wsCount, sseCount, idbOpenCount };
            } finally {
                window.BroadcastChannel = OrigBC;
                window.WebSocket = OrigWS;
                window.EventSource = OrigES;
                if (idbProto && origIdbOpen) idbProto.open = origIdbOpen;
                if (locksProto && origRequest) locksProto.request = origRequest;
            }
        })()`);
        check(
            sideEffects.bcCount === 0 &&
            sideEffects.lockCount === 0 &&
            sideEffects.wsCount === 0 &&
            sideEffects.sseCount === 0 &&
            sideEffects.idbOpenCount === 0,
            `import lib/coordination.js 應零副作用，實際 bc=${sideEffects.bcCount}, locks=${sideEffects.lockCount}, ws=${sideEffects.wsCount}, sse=${sideEffects.sseCount}, idb=${sideEffects.idbOpenCount}`);

        // 2.2 MessageBus 雙分頁投遞、local/remote、namespace 隔離、unsubscribe 與 dispose
        await tabA.page.evaluate(`(async () => {
            const { createMessageBus } = await import('./lib/coordination.js');
            window.__state = { aReceived: [], otherNsReceived: [] };
            window.__busA = createMessageBus({ namespace: 'e2e-ns' });
            window.__busOther = createMessageBus({ namespace: 'other-ns' });
            window.__busA.subscribe('chat', (p, meta) => window.__state.aReceived.push({ p, meta }));
            window.__busOther.subscribe('*', (p, meta) => window.__state.otherNsReceived.push({ p, meta }));
        })()`);
        await tabB.page.evaluate(`(async () => {
            const { createMessageBus } = await import('./lib/coordination.js');
            window.__state = { bAll: [], bRemote: [], bLocal: [], bUnsub: [] };
            window.__busB = createMessageBus({ namespace: 'e2e-ns' });
            window.__busB.subscribe('chat', (p, meta) => window.__state.bAll.push({ p, meta }), { receive: 'all' });
            window.__busB.subscribe('chat', (p, meta) => window.__state.bRemote.push({ p, meta }), { receive: 'remote' });
            window.__busB.subscribe('chat', (p, meta) => window.__state.bLocal.push({ p, meta }), { receive: 'local' });
            const unsub = window.__busB.subscribe('chat', (p, meta) => window.__state.bUnsub.push({ p, meta }));
            unsub();
        })()`);

        const pub1 = await tabA.page.evaluate(`window.__busA.publish('chat', { msg: 'hi-from-A' })`);
        check(pub1.localCount === 0 && pub1.remoteSent === true, '預設 publish 應僅遠端投遞');
        check(await waitFor(tabB.page, 'window.__state.bAll.length === 1', 5000), 'Tab B 未收到 Tab A 遠端訊息');
        const bRecv = await tabB.page.evaluate('window.__state');
        check(bRecv.bAll[0].p.msg === 'hi-from-A' && bRecv.bAll[0].meta.origin === 'remote', 'Tab B 收到的 meta/payload 不正確');
        check(bRecv.bRemote.length === 1 && bRecv.bLocal.length === 0 && bRecv.bUnsub.length === 0, 'Tab B receive 過濾或 unsubscribe 失效');

        const aAfterDefault = await tabA.page.evaluate('window.__state');
        check(aAfterDefault.aReceived.length === 0 && aAfterDefault.otherNsReceived.length === 0, '預設不應本地回聲也不應跨 namespace 收到');

        const pub2 = await tabB.page.evaluate(`window.__busB.publish('chat', { msg: 'local-only-B' }, { local: true, remote: false })`);
        check(pub2.localCount === 2 && pub2.remoteSent === false, 'local-only publish 回傳計數不符');
        await sleep(80);
        check(await tabA.page.evaluate('window.__state.aReceived.length === 0'), 'local-only 不應傳送到 Tab A');
        check(await tabB.page.evaluate('window.__state.bLocal.length === 1 && window.__state.bRemote.length === 1'), 'Tab B local 投遞過濾不正確');

        await tabA.page.evaluate('window.__busA.dispose()');
        await tabB.page.evaluate(`window.__busB.publish('chat', { msg: 'after-dispose' })`);
        await sleep(80);
        check(await tabA.page.evaluate('window.__state.aReceived.length === 0'), 'busA dispose 後不應再收到訊息');
        await tabA.page.evaluate('window.__busOther.dispose()');
        await tabB.page.evaluate('window.__busB.dispose()');

        // 2.3 Store 雙分頁隔離、刪除語意、快照、並行更新與 dispose
        await tabA.page.evaluate(`(async () => {
            localStorage.clear();
            const { Store } = await import('./lib/store.js');
            window.__sA1 = new Store({ alpha: 0, keep: 'yes' }, 'e2e_store_1');
            window.__sA2 = new Store({ alpha: 100 }, 'e2e_store_2');
        })()`);
        await tabB.page.evaluate(`(async () => {
            const { Store } = await import('./lib/store.js');
            window.__sB1 = new Store({ alpha: 0, keep: 'yes' }, 'e2e_store_1');
            window.__sB2 = new Store({ alpha: 100 }, 'e2e_store_2');
        })()`);

        await tabA.page.evaluate(`window.__sA1.state.alpha = 42;`);
        check(await waitFor(tabB.page, 'window.__sB1.state.alpha === 42', 5000), 'Store 跨分頁更新未同步');
        check(await tabB.page.evaluate('window.__sB2.state.alpha === 100'), '不同 storageKey 的 Store 被互相污染');

        await tabA.page.evaluate(`delete window.__sA1.state.keep;`);
        check(await waitFor(tabB.page, "!('keep' in window.__sB1._baseState)", 5000), '遠端刪除頂層屬性未實際 delete');
        check(await tabB.page.evaluate("!('keep' in JSON.parse(localStorage.getItem('e2e_store_1') || '{}'))"), '刪除後 localStorage 仍殘留該鍵');

        await tabA.page.evaluate(`window.__sA1.applySnapshot({ fresh: 99 });`);
        check(await waitFor(tabB.page, "window.__sB1.state.fresh === 99 && !('alpha' in window.__sB1._baseState)", 5000), 'applySnapshot 未移除舊鍵');

        // 並行更新不同鍵與同一鍵 LWW 收斂
        await Promise.all([
            tabA.page.evaluate(`window.__sA1.state.kA = 'fromA'; window.__sA1.state.race = 'A';`),
            tabB.page.evaluate(`window.__sB1.state.kB = 'fromB'; window.__sB1.state.race = 'B';`),
        ]);
        const converged = await waitFor(tabA.page, `window.__sA1.state.kA === 'fromA' && window.__sA1.state.kB === 'fromB'`, 5000)
            && await waitFor(tabB.page, `window.__sB1.state.kA === 'fromA' && window.__sB1.state.kB === 'fromB'`, 5000);
        check(converged, '並行更新不同鍵時有鍵遺失');
        await sleep(100);
        const raceA = await tabA.page.evaluate(`window.__sA1.state.race`);
        const raceB = await tabB.page.evaluate(`window.__sB1.state.race`);
        const raceLS = await tabA.page.evaluate(`JSON.parse(localStorage.getItem('e2e_store_1') || '{}').race`);
        check(raceA === raceB && raceA === raceLS, `同鍵並行衝突未收斂一致（A=${raceA}, B=${raceB}, LS=${raceLS}）`);

        // dispose 清理後不再同步
        await tabB.page.evaluate(`window.__sB1.dispose();`);
        await tabA.page.evaluate(`window.__sA1.state.afterDispose = 'should-not-sync';`);
        await sleep(100);
        check(await tabB.page.evaluate(`window.__sB1.state.afterDispose === undefined`), 'Store.dispose() 後仍收到遠端更新');

        // 晚加入／重整分頁寫入既有鍵時，既有分頁必須接受更新（HLC 持久化基線）
        await tabB.page.evaluate(`(async () => {
            const { Store } = await import('./lib/store.js');
            window.__sBLate = new Store({ fresh: 0 }, 'e2e_store_1');
            window.__sBLate.state.fresh = 777;
        })()`);
        check(await waitFor(tabA.page, 'window.__sA1.state.fresh === 777', 5000), '晚加入分頁更新既有鍵時，既有分頁未接受');

        await Promise.all([
            tabA.page.evaluate(`window.__sA1.dispose(); window.__sA2.dispose();`),
            tabB.page.evaluate(`window.__sB2.dispose(); window.__sBLate.dispose();`),
        ]);

        // 2.4 Phase 2：真實多分頁 Web Locks Leader Election（競爭、不同 scope 隔離、release、reload 接管、關閉分頁接管）
        const leResA = await tabA.page.evaluate(`(async () => {
            const { createLeaderElection } = await import('./lib/coordination.js');
            window.__elA = createLeaderElection({ namespace: 'e2e-le', scope: 'primary' });
            return await window.__elA.start();
        })()`);
        const leResB = await tabB.page.evaluate(`(async () => {
            const { createLeaderElection } = await import('./lib/coordination.js');
            window.__elB = createLeaderElection({ namespace: 'e2e-le', scope: 'primary' });
            window.__elBOther = createLeaderElection({ namespace: 'e2e-le', scope: 'secondary' });
            const primary = await window.__elB.start();
            const secondary = await window.__elBOther.start();
            return { primary, secondary };
        })()`);
        check(leResA.acquired === true && leResA.role === 'leader', 'Tab A 應優先成為 leader');
        check(leResB.primary.acquired === false && leResB.primary.role === 'follower', '同 scope Tab B 應成為 follower');
        check(leResB.secondary.acquired === true && leResB.secondary.role === 'leader', '不同 scope 應各自持鎖');

        // 主動 release 接管
        await tabA.page.evaluate(`window.__elA.release()`);
        check(await waitFor(tabB.page, "window.__elB.role === 'leader'", 5000), 'leader release 後 follower 未接管');
        await tabB.page.evaluate(`window.__elB.release()`);
        await tabB.page.evaluate(`window.__elBOther.dispose()`);

        // Page.reload 接管：Tab A 重新取得 leader 後重載，Tab B 應接管
        const reA = await tabA.page.evaluate(`window.__elA.start()`);
        const reB = await tabB.page.evaluate(`window.__elB.start()`);
        check(reA.role === 'leader' && reB.role === 'follower', '重測 reload 前 Tab A 應為 leader、Tab B 為 follower');
        await tabA.page.evaluate(`window.__tabAMarker = 'before-reload'`);
        await tabA.page.send('Page.reload');
        check(await waitFor(tabB.page, "window.__elB.role === 'leader'", 8000), 'leader 分頁 reload 後 follower 未接管');
        check(await waitFor(tabA.page, "window.__tabAMarker === undefined && window.__COORD_READY__ === true", 8000), 'Tab A reload 後未恢復就緒');

        // Target.closeTarget 接管：開 Tab C 當 follower，關閉 Tab B（目前 leader）後 Tab C 接管
        tabC = await openTab();
        trackerC = trackProblems(tabC.page);
        await tabC.page.send('Page.navigate', { url: testPageUrl });
        check(await waitFor(tabC.page, 'window.__COORD_READY__ === true', 10000), 'Tab C 測試頁未就緒');
        const leResC = await tabC.page.evaluate(`(async () => {
            const { createLeaderElection } = await import('./lib/coordination.js');
            window.__elC = createLeaderElection({ namespace: 'e2e-le', scope: 'primary' });
            return await window.__elC.start();
        })()`);
        check(leResC.role === 'follower', 'Tab C 加入時應為 follower');

        failures.push(...trackerB.take().map((p) => `雙分頁 Tab B：${p}`));
        await tabB.close();
        tabB = null;
        check(await waitFor(tabC.page, "window.__elC.role === 'leader'", 8000), '關閉 leader 分頁後 follower (Tab C) 未接管');
        await tabC.page.evaluate(`window.__elC.dispose()`);

        // 2.5 Phase 2：真實雙分頁 Cross-Tab RPC（Tab A 提供方法，Tab C 呼叫／逾時不重試／取消／dispose 清理）
        const rpcNodeA = await tabA.page.evaluate(`(async () => {
            const { createRpcChannel } = await import('./lib/coordination.js');
            window.__rpcState = { sideEffects: 0, slowAborted: false };
            window.__rpcA = createRpcChannel({ namespace: 'e2e-rpc', timeoutMs: 2000 });
            window.__rpcA.register('math.add', ({ a, b }) => a + b);
            window.__rpcA.register('boom', () => { throw new RangeError('out of range'); });
            window.__rpcA.register('slowSideEffect', async ({ delayMs = 400 }, ctx) => {
                window.__rpcState.sideEffects += 1;
                ctx.signal.addEventListener('abort', () => { window.__rpcState.slowAborted = true; }, { once: true });
                await new Promise((r) => setTimeout(r, delayMs));
                return { ok: true };
            });
            return window.__rpcA.nodeId;
        })()`);
        const rpcCheck = await tabC.page.evaluate(`(async (targetA) => {
            const { createRpcChannel, RPC_ERROR_CODES } = await import('./lib/coordination.js');
            const rpcC = createRpcChannel({ namespace: 'e2e-rpc', timeoutMs: 2000 });
            const out = {};

            out.sum = await rpcC.call('math.add', { a: 17, b: 25 });

            try {
                await rpcC.call('nope', {}, { target: targetA });
            } catch (e) {
                out.unknownCode = e.code;
            }

            try {
                await rpcC.call('boom', {}, { target: targetA });
            } catch (e) {
                out.boomCode = e.code;
                out.boomRemoteName = e.remoteName;
            }

            try {
                await rpcC.call('slowSideEffect', { delayMs: 350 }, { timeoutMs: 40 });
            } catch (e) {
                out.timeoutCode = e.code;
                out.pendingAfterTimeout = rpcC.pendingCount;
            }

            const ac = new AbortController();
            const abortP = rpcC.call('slowSideEffect', { delayMs: 350 }, { signal: ac.signal });
            setTimeout(() => ac.abort('stop'), 20);
            try {
                await abortP;
            } catch (e) {
                out.abortCode = e.code;
                out.pendingAfterAbort = rpcC.pendingCount;
            }

            const disposeP = rpcC.call('slowSideEffect', { delayMs: 500 });
            rpcC.dispose();
            out.pendingAfterDispose = rpcC.pendingCount;
            try {
                await disposeP;
            } catch (e) {
                out.disposeCode = e.code;
            }
            return out;
        })(${JSON.stringify(rpcNodeA)})`);

        check(rpcCheck.sum === 42, `跨分頁 RPC 回傳值錯誤：${rpcCheck.sum}`);
        check(rpcCheck.unknownCode === 'METHOD_NOT_FOUND', `未知方法錯誤碼不符：${rpcCheck.unknownCode}`);
        check(rpcCheck.boomCode === 'HANDLER_ERROR' && rpcCheck.boomRemoteName === 'RangeError',
            `遠端錯誤序列化不符：${rpcCheck.boomCode}/${rpcCheck.boomRemoteName}`);
        check(rpcCheck.timeoutCode === 'TIMEOUT' && rpcCheck.pendingAfterTimeout === 0,
            `RPC timeout 或 pending 清理異常：${rpcCheck.timeoutCode}/${rpcCheck.pendingAfterTimeout}`);
        check(rpcCheck.abortCode === 'ABORTED' && rpcCheck.pendingAfterAbort === 0,
            `RPC AbortSignal 或 pending 清理異常：${rpcCheck.abortCode}/${rpcCheck.pendingAfterAbort}`);
        check(rpcCheck.disposeCode === 'CHANNEL_CLOSED' && rpcCheck.pendingAfterDispose === 0,
            `RPC dispose 清理異常：${rpcCheck.disposeCode}/${rpcCheck.pendingAfterDispose}`);
        check(await waitFor(tabA.page, 'window.__rpcState.slowAborted === true && window.__rpcState.sideEffects === 3', 3000),
            '遠端取消訊號未觸發或副作用執行次數異常（不可自動重試）');

        await tabA.page.evaluate(`window.__rpcA.dispose()`);

        // 2.6 Phase 3：真實雙分頁 PeerDiscovery（加入、能力宣告/更新、離開、過期且不影響 Web Lock 持鎖）
        const pdTag = base.includes('/plainvanillaweb/') ? 'sub' : 'root';
        await tabA.page.evaluate(`(async (tag) => {
            const { createPeerDiscovery, createLeaderElection } = await import('./lib/coordination.js');
            window.__pdLockA = createLeaderElection({ namespace: 'e2e-pd-' + tag, scope: 'res' });
            await window.__pdLockA.start();
            window.__pdEventsA = [];
            window.__pdA = createPeerDiscovery({
                namespace: 'e2e-pd-' + tag,
                capabilities: ['sync', 'ws'],
                meta: { tab: 'A' },
                heartbeatIntervalMs: 4000,
                peerTimeoutMs: 120,
                sweepIntervalMs: 5000,
            });
            window.__pdA.on('peer-leave', (e) => window.__pdEventsA.push({ type: 'leave', id: e.peer.nodeId }));
            window.__pdA.start();
        })(${JSON.stringify(pdTag)})`);
        await tabC.page.evaluate(`(async (tag) => {
            const { createPeerDiscovery, createLeaderElection } = await import('./lib/coordination.js');
            window.__pdLockC = createLeaderElection({ namespace: 'e2e-pd-' + tag, scope: 'res' });
            await window.__pdLockC.start();
            window.__pdEventsC = [];
            window.__pdC = createPeerDiscovery({
                namespace: 'e2e-pd-' + tag,
                capabilities: ['cache'],
                heartbeatIntervalMs: 4000,
                peerTimeoutMs: 120,
                sweepIntervalMs: 5000,
            });
            window.__pdC.on('peer-join', (e) => window.__pdEventsC.push({ type: 'join', id: e.peer.nodeId, rejoined: e.rejoined }));
            window.__pdC.on('peer-update', (e) => window.__pdEventsC.push({ type: 'update', caps: e.peer.capabilities }));
            window.__pdC.on('peer-expire', (e) => window.__pdEventsC.push({ type: 'expire', id: e.peer.nodeId }));
            window.__pdC.start();
            window.__pdAId = null;
        })(${JSON.stringify(pdTag)})`);

        check(await waitFor(tabC.page, "window.__pdC.getPeers().length === 1", 5000), 'PeerDiscovery 未於雙分頁彼此發現');
        await tabA.page.evaluate(`window.__pdA.updateCapabilities(['sync', 'ws', 'rpc'])`);
        check(await waitFor(tabC.page, "window.__pdEventsC.some((e) => e.type === 'update' && e.caps.includes('rpc'))", 5000),
            'PeerDiscovery 能力更新未同步');
        await sleep(160);
        const pdExpiredCheck = await tabC.page.evaluate(`(() => {
            window.__pdC.sweep();
            return {
                expiredCount: window.__pdEventsC.filter((e) => e.type === 'expire').length,
                aliveCount: window.__pdC.getPeers().length,
                lockCRole: window.__pdLockC.role,
            };
        })()`);
        const lockARoleAfterExpire = await tabA.page.evaluate(`window.__pdLockA.role`);
        check(pdExpiredCheck.expiredCount >= 1 && pdExpiredCheck.aliveCount === 0, 'PeerDiscovery 逾時後未標記 peer-expire');
        check(lockARoleAfterExpire === 'leader' && pdExpiredCheck.lockCRole === 'follower',
            'PeerDiscovery 過期後不應釋放或奪取 Web Lock');

        await tabA.page.evaluate(`window.__pdA.announce()`);
        check(await waitFor(tabC.page, "window.__pdEventsC.some((e) => e.type === 'join' && e.rejoined === true) && window.__pdC.getPeers().length === 1", 5000),
            'PeerDiscovery 恢復送出心跳後未觸發 rejoined: true');

        await tabC.page.evaluate(`window.__pdC.stop();`);
        check(await waitFor(tabA.page, "window.__pdEventsA.some((e) => e.type === 'leave')", 5000), 'PeerDiscovery stop 未發出 peer-leave');
        await Promise.all([
            tabA.page.evaluate(`window.__pdA.dispose(); window.__pdLockA.dispose();`),
            tabC.page.evaluate(`window.__pdC.dispose(); window.__pdLockC.dispose();`),
        ]);

        // 2.7 Phase 3：真實 Chrome 原生 WebSocket & EventSource 共享連線驗證
        realtime.resetStats();
        const wsRoomA = `ws-a-${pdTag}`;
        const wsRoomB = `ws-b-${pdTag}`;
        const wsUrlA = realtime.wsUrl(wsRoomA);
        const wsUrlB = realtime.wsUrl(wsRoomB);

        await tabA.page.evaluate(`(async (tag, wsUrlA) => {
            const { createSharedConnection } = await import('./lib/coordination.js');
            window.__scStateA = { msgs: [], resyncs: [] };
            window.__scWsA = createSharedConnection({
                transport: 'websocket',
                url: wsUrlA,
                identityKey: 'acct-1',
                configKey: 'main',
                namespace: 'e2e-sc-' + tag,
                reconnect: { initialDelayMs: 40, maxDelayMs: 120, jitter: 0, maxAttempts: 5 },
            });
            window.__scWsA.subscribe('orders');
            window.__scWsA.on('message', (m) => window.__scStateA.msgs.push(m));
            window.__scWsA.on('resync', (r) => window.__scStateA.resyncs.push(r));
            await window.__scWsA.start();
        })(${JSON.stringify(pdTag)}, ${JSON.stringify(wsUrlA)})`);

        await tabC.page.evaluate(`(async (tag, wsUrlA, wsUrlB) => {
            const { createSharedConnection } = await import('./lib/coordination.js');
            window.__scStateC = { msgs: [], resyncs: [], otherMsgs: [], diffEndpointMsgs: [] };
            window.__scWsC = createSharedConnection({
                transport: 'websocket',
                url: wsUrlA,
                identityKey: 'acct-1',
                configKey: 'main',
                namespace: 'e2e-sc-' + tag,
                reconnect: { initialDelayMs: 40, maxDelayMs: 120, jitter: 0, maxAttempts: 5 },
            });
            window.__scWsC.subscribe('feed');
            window.__scWsC.on('message', (m) => window.__scStateC.msgs.push(m));
            window.__scWsC.on('resync', (r) => window.__scStateC.resyncs.push(r));

            // 同 URL 不同帳號 (acct-2) 與不同端點 (wsUrlB) 必須完全隔離
            window.__scWsOtherAcct = createSharedConnection({
                transport: 'websocket',
                url: wsUrlA,
                identityKey: 'acct-2',
                configKey: 'main',
                namespace: 'e2e-sc-' + tag,
                reconnect: { initialDelayMs: 40, maxDelayMs: 120, jitter: 0, maxAttempts: 5 },
            });
            window.__scWsOtherAcct.on('message', (m) => window.__scStateC.otherMsgs.push(m));

            window.__scWsDiffUrl = createSharedConnection({
                transport: 'websocket',
                url: wsUrlB,
                identityKey: 'acct-1',
                configKey: 'main',
                namespace: 'e2e-sc-' + tag,
            });
            window.__scWsDiffUrl.on('message', (m) => window.__scStateC.diffEndpointMsgs.push(m));

            await window.__scWsC.start();
            await window.__scWsOtherAcct.start();
            await window.__scWsDiffUrl.start();
        })(${JSON.stringify(pdTag)}, ${JSON.stringify(wsUrlA)}, ${JSON.stringify(wsUrlB)})`);

        check(await waitFor(tabA.page, "window.__scWsA.state === 'open' && window.__scWsA.role === 'leader'", 5000),
            'Chrome Tab A SharedConnection WebSocket 未成為開啟的 leader');
        check(await waitFor(tabC.page, "window.__scWsC.state === 'open' && window.__scWsC.role === 'follower' && window.__scWsOtherAcct.state === 'open' && window.__scWsDiffUrl.state === 'open'", 5000),
            'Chrome Tab C SharedConnection follower 或隔離連線未就緒');

        const wsStatsAfterOpen = realtime.getStats(wsRoomA);
        check(wsStatsAfterOpen.activeWsCount === 2 && realtime.getStats(wsRoomB).activeWsCount === 1,
            `同 scope 應維持 1 條且異 scope 各自獨立，實際 roomA=${wsStatsAfterOpen.activeWsCount}, roomB=${realtime.getStats(wsRoomB).activeWsCount}`);

        // 訂閱聯集、伺服器廣播轉發、follower send 轉發、與異端點隔離
        check(await waitFor(tabA.page, "window.__scWsA.getSubscriptions().includes('orders') && window.__scWsA.getSubscriptions().includes('feed')", 5000),
            '跨分頁訂閱集合未在 leader 彙總');
        realtime.broadcastWs(wsRoomA, JSON.stringify({ event: 'ws-hi' }));
        check(await waitFor(tabC.page, 'window.__scStateC.msgs.length === 1 && window.__scStateC.otherMsgs.length === 1', 5000),
            'WebSocket 推播未轉發到 follower');
        check(await tabC.page.evaluate('window.__scStateC.msgs[0].relayed === true && window.__scStateC.diffEndpointMsgs.length === 0'),
            'follower 應標記 relayed=true 且不同 URL 不應收到推播');

        const followerSendRes = await tabC.page.evaluate(`window.__scWsC.send('chrome-follower-msg')`);
        check(followerSendRes.ok === true && followerSendRes.relayed === true, 'Chrome follower WS send 失敗');
        await waitFor(tabA.page, 'true', 100);
        const deadlineWsRecv = Date.now() + 3000;
        while (realtime.getStats(wsRoomA).receivedWsMessages.length < 1 && Date.now() < deadlineWsRecv) await sleep(20);
        check(realtime.getStats(wsRoomA).receivedWsMessages[0]?.data === 'chrome-follower-msg', '伺服器未收到 follower 轉發的 WebSocket 訊息');

        // 伺服器斷線重連與 resync 事件
        realtime.dropWs(wsRoomA);
        check(await waitFor(tabA.page, "window.__scStateA.resyncs.some((r) => r.reason === 'reconnect') && window.__scWsA.state === 'open'", 6000),
            'Chrome WebSocket 斷線後未重連與 resync');
        check(await waitFor(tabC.page, "window.__scStateC.resyncs.some((r) => r.reason === 'reconnect') && window.__scWsOtherAcct.state === 'open'", 5000),
            'Chrome follower 或隔離帳號未在 reconnect 後恢復開啟');

        // 關閉真實 leader 分頁 Tab A：Tab C 應接管且 acct-1 仍僅 1 條連線
        failures.push(...trackerA.take().map((p) => `雙分頁 Tab A：${p}`));
        await tabA.close();
        tabA = null;
        check(await waitFor(tabC.page, "window.__scWsC.role === 'leader' && window.__scWsC.state === 'open'", 8000),
            '關閉 WebSocket leader 分頁後 follower (Tab C) 未接管連線');
        const deadlineTakeoverStats = Date.now() + 2000;
        while (realtime.getStats(wsRoomA).activeWsCount !== 2 && Date.now() < deadlineTakeoverStats) await sleep(20);
        check(realtime.getStats(wsRoomA).activeWsCount === 2, `接管後 roomA 應維持 2 條連線，實際 ${realtime.getStats(wsRoomA).activeWsCount}`);
        const postTakeoverSend = await tabC.page.evaluate(`window.__scWsC.send('after-takeover-msg')`);
        check(postTakeoverSend.ok === true && postTakeoverSend.relayed === false, '接管後新 leader 直接 send 應成功且 relayed=false');

        await tabC.page.evaluate(`window.__scWsC.dispose(); window.__scWsOtherAcct.dispose(); window.__scWsDiffUrl.dispose();`);

        // 2.7b SSE（原生 EventSource 嚴格單向、lastEventId 追蹤與雙分頁共用 1 條連線）
        tabD = await openTab();
        trackerD = trackProblems(tabD.page);
        await tabD.page.send('Page.navigate', { url: testPageUrl });
        check(await waitFor(tabD.page, 'window.__COORD_READY__ === true', 10000), 'Tab D 測試頁未就緒');

        const sseRoom = `sse-${pdTag}`;
        const sseUrl = realtime.sseUrl(sseRoom);
        await Promise.all([
            tabC.page.evaluate(`(async (tag, sseUrl) => {
                const { createSharedConnection } = await import('./lib/coordination.js');
                window.__scSseMsgsC = [];
                window.__scSseC = createSharedConnection({
                    transport: 'sse',
                    url: sseUrl,
                    identityKey: 'sse-u1',
                    withCredentials: true,
                    eventTypes: ['tick'],
                    namespace: 'e2e-sse-' + tag,
                });
                window.__scSseC.on('message', (m) => window.__scSseMsgsC.push(m));
                await window.__scSseC.start();
            })(${JSON.stringify(pdTag)}, ${JSON.stringify(sseUrl)})`),
            tabD.page.evaluate(`(async (tag, sseUrl) => {
                const { createSharedConnection } = await import('./lib/coordination.js');
                window.__scSseMsgsD = [];
                window.__scSseD = createSharedConnection({
                    transport: 'sse',
                    url: sseUrl,
                    identityKey: 'sse-u1',
                    withCredentials: true,
                    eventTypes: ['tick'],
                    namespace: 'e2e-sse-' + tag,
                });
                window.__scSseD.on('message', (m) => window.__scSseMsgsD.push(m));
                await window.__scSseD.start();
            })(${JSON.stringify(pdTag)}, ${JSON.stringify(sseUrl)})`),
        ]);

        check(await waitFor(tabC.page, "window.__scSseC.state === 'open'", 5000) && await waitFor(tabD.page, "window.__scSseD.state === 'open'", 5000),
            'Chrome 雙分頁 SharedConnection SSE 未就緒');
        check(realtime.getStats(sseRoom).activeSseCount === 1,
            `SSE 穩定狀態同 scope 應只有 1 條連線，實際 ${realtime.getStats(sseRoom).activeSseCount}`);

        // SSE 嚴格單向檢查
        const sseSendErrs = await Promise.all([
            tabC.page.evaluate(`window.__scSseC.send('nope').then(() => 'OK', (e) => e.code)`),
            tabD.page.evaluate(`window.__scSseD.send('nope').then(() => 'OK', (e) => e.code)`),
        ]);
        check(sseSendErrs[0] === 'UNSUPPORTED_OPERATION' && sseSendErrs[1] === 'UNSUPPORTED_OPERATION',
            `SSE send() 必須立即回報 UNSUPPORTED_OPERATION，實際 ${JSON.stringify(sseSendErrs)}`);

        realtime.broadcastSse(sseRoom, { id: '900', event: 'tick', data: 'sse-live-data' });
        check(await waitFor(tabC.page, 'window.__scSseMsgsC.length === 1', 5000) && await waitFor(tabD.page, 'window.__scSseMsgsD.length === 1', 5000),
            'SSE 具名事件未轉發至雙方分頁');
        check(await tabD.page.evaluate("window.__scSseMsgsD[0].event === 'tick' && window.__scSseMsgsD[0].lastEventId === '900' && window.__scSseMsgsD[0].data === 'sse-live-data'"),
            'SSE 轉發事件內容或 lastEventId 不符');

        await Promise.all([
            tabC.page.evaluate(`window.__scSseC.dispose();`),
            tabD.page.evaluate(`window.__scSseD.dispose();`),
        ]);
        const deadlineClose = Date.now() + 3000;
        while ((realtime.getStats().activeWsCount > 0 || realtime.getStats().activeSseCount > 0) && Date.now() < deadlineClose) {
            await sleep(20);
        }
        check(realtime.getStats().activeWsCount === 0 && realtime.getStats().activeSseCount === 0,
            'dispose() 後仍有殘留即時連線未關閉');

        // 2.8 真實 3+ 分頁 IndexedDB DurableTaskQueue 與 #/lab/browser-cluster 整合測試
        {
            const tqDbName = `e2e_tq_db_${Date.now()}`;
            const tqNsParallel = `tq-par-${Date.now()}`;
            const tqNsIso = `tq-iso-${Date.now()}`;
            const tqNsCrash = `tq-crash-${Date.now()}`;
            const tqNsReload = `tq-reload-${Date.now()}`;
            const uiNs = `ui-cluster-${Date.now()}`;

            const tqTab1 = await openTab();
            const tqTab2 = await openTab();
            const tqTab3 = await openTab();
            let tqTab4 = null;
            const uiTab1 = await openTab();
            const uiTab2 = await openTab();
            const uiTab3 = await openTab();

            const tqTrack1 = trackProblems(tqTab1.page);
            const tqTrack2 = trackProblems(tqTab2.page);
            const tqTrack3 = trackProblems(tqTab3.page);
            const uiTrack1 = trackProblems(uiTab1.page);
            const uiTrack2 = trackProblems(uiTab2.page);
            const uiTrack3 = trackProblems(uiTab3.page);

            try {
                await Promise.all([
                    tqTab1.page.send('Page.navigate', { url: testPageUrl }),
                    tqTab2.page.send('Page.navigate', { url: testPageUrl }),
                    tqTab3.page.send('Page.navigate', { url: testPageUrl }),
                ]);
                const tqReady = await Promise.all([
                    waitFor(tqTab1.page, 'window.__COORD_READY__ === true', 10000),
                    waitFor(tqTab2.page, 'window.__COORD_READY__ === true', 10000),
                    waitFor(tqTab3.page, 'window.__COORD_READY__ === true', 10000),
                ]);
                check(tqReady.every(Boolean), 'DurableTaskQueue 測試分頁未就緒');

                // 2.8.1 Idempotency 去重 + namespace 隔離 + 3 分頁並發原子認領
                await Promise.all([
                    tqTab1.page.evaluate(`(async () => {
                        const { createDurableTaskQueue, createMessageBus } = await import('./lib/coordination.js');
                        window.__tqExecutions = [];
                        window.__tqBus1 = createMessageBus({ namespace: ${JSON.stringify(tqNsParallel)} });
                        window.__tq1 = createDurableTaskQueue({
                            namespace: ${JSON.stringify(tqNsParallel)},
                            dbName: ${JSON.stringify(tqDbName)},
                            workerId: 'tq-worker-1',
                            bus: window.__tqBus1,
                            pollIntervalMs: 40,
                            leaseDurationMs: 4000,
                        });
                        window.__tq1.registerHandler('work', async (payload, ctx) => {
                            window.__tqExecutions.push(ctx.taskId);
                            await new Promise((r) => setTimeout(r, 35));
                            return { n: payload.n, worker: ctx.ownerId };
                        });
                        window.__tq1.registerHandler('alwaysFail', async () => {
                            throw new Error('forced failure');
                        });
                        window.__tqIso = createDurableTaskQueue({
                            namespace: ${JSON.stringify(tqNsIso)},
                            dbName: ${JSON.stringify(tqDbName)},
                            workerId: 'tq-iso-worker',
                        });
                        const e1 = await window.__tq1.enqueue({ type: 'work', idempotencyKey: 'same-key', payload: { n: 1 }, priority: 5 });
                        const e2 = await window.__tq1.enqueue({ type: 'work', idempotencyKey: 'same-key', payload: { n: 999 } });
                        const eIso = await window.__tqIso.enqueue({ type: 'work', idempotencyKey: 'same-key', payload: { n: 2 } });
                        window.__idemRes = {
                            d1: e1.deduplicated,
                            d2: e2.deduplicated,
                            sameId: e1.task.id === e2.task.id,
                            isoDedup: eIso.deduplicated,
                            isoDiffId: eIso.task.id !== e1.task.id,
                        };
                        for (let i = 2; i <= 6; i++) {
                            await window.__tq1.enqueue({ type: 'work', payload: { n: i }, priority: i });
                        }
                    })()`),
                    tqTab2.page.evaluate(`(async () => {
                        const { createDurableTaskQueue, createMessageBus } = await import('./lib/coordination.js');
                        window.__tqExecutions = [];
                        window.__tqBus2 = createMessageBus({ namespace: ${JSON.stringify(tqNsParallel)} });
                        window.__tq2 = createDurableTaskQueue({
                            namespace: ${JSON.stringify(tqNsParallel)},
                            dbName: ${JSON.stringify(tqDbName)},
                            workerId: 'tq-worker-2',
                            bus: window.__tqBus2,
                            pollIntervalMs: 40,
                            leaseDurationMs: 4000,
                        });
                        window.__tq2.registerHandler('work', async (payload, ctx) => {
                            window.__tqExecutions.push(ctx.taskId);
                            await new Promise((r) => setTimeout(r, 35));
                            return { n: payload.n, worker: ctx.ownerId };
                        });
                    })()`),
                    tqTab3.page.evaluate(`(async () => {
                        const { createDurableTaskQueue, createMessageBus } = await import('./lib/coordination.js');
                        window.__tqExecutions = [];
                        window.__tqBus3 = createMessageBus({ namespace: ${JSON.stringify(tqNsParallel)} });
                        window.__tq3 = createDurableTaskQueue({
                            namespace: ${JSON.stringify(tqNsParallel)},
                            dbName: ${JSON.stringify(tqDbName)},
                            workerId: 'tq-worker-3',
                            bus: window.__tqBus3,
                            pollIntervalMs: 40,
                            leaseDurationMs: 4000,
                        });
                        window.__tq3.registerHandler('work', async (payload, ctx) => {
                            window.__tqExecutions.push(ctx.taskId);
                            await new Promise((r) => setTimeout(r, 35));
                            return { n: payload.n, worker: ctx.ownerId };
                        });
                    })()`),
                ]);

                const idemRes = await tqTab1.page.evaluate('window.__idemRes');
                check(idemRes.d1 === false && idemRes.d2 === true && idemRes.sameId && idemRes.isoDedup === false && idemRes.isoDiffId,
                    `IndexedDB idempotency/namespace 檢查失敗：${JSON.stringify(idemRes)}`);

                await Promise.all([
                    tqTab1.page.evaluate('window.__tq1.start()'),
                    tqTab2.page.evaluate('window.__tq2.start()'),
                    tqTab3.page.evaluate('window.__tq3.start()'),
                ]);

                const parDone = await waitFor(tqTab1.page, `(async () => {
                    const stats = await window.__tq1.getStats();
                    return stats.completed === 6 && stats.pending === 0 && stats.running === 0;
                })()`, 10000);
                check(parDone, '3 分頁並發原子認領 IndexedDB 任務未在時限內完成');

                const [exec1, exec2, exec3] = await Promise.all([
                    tqTab1.page.evaluate('window.__tqExecutions'),
                    tqTab2.page.evaluate('window.__tqExecutions'),
                    tqTab3.page.evaluate('window.__tqExecutions'),
                ]);
                const allExecs = [...exec1, ...exec2, ...exec3];
                check(allExecs.length === 6 && new Set(allExecs).size === 6,
                    `3 分頁正常並發認領應零重複，實際總執行次數=${allExecs.length}, unique=${new Set(allExecs).size}`);

                // 2.8.2 Retry 上限與 Purge（不影響他 namespace）
                const failDone = await tqTab1.page.evaluate(`(async () => {
                    await window.__tq1.enqueue({ type: 'alwaysFail', maxAttempts: 2, payload: {} });
                    for (let i = 0; i < 60; i++) {
                        const stats = await window.__tq1.getStats();
                        if (stats.failed === 1) break;
                        await new Promise((r) => setTimeout(r, 50));
                    }
                    const statsAfterFail = await window.__tq1.getStats();
                    const purged = await window.__tq1.purge({ olderThanMs: 0 });
                    const isoAfterPurge = await window.__tqIso.listTasks();
                    await window.__tqIso.clearNamespace();
                    return { statsAfterFail, purgedCount: purged.purgedCount, isoLen: isoAfterPurge.length };
                })()`);
                check(failDone.statsAfterFail.failed === 1 && failDone.purgedCount === 7 && failDone.isoLen === 1,
                    `重試上限與 purge 結果不如預期：${JSON.stringify(failDone)}`);

                // 2.8.3 真實 Worker 分頁關閉（Crash/Close）Web Lock 孤兒快速回收接手
                await tqTab3.page.evaluate(`(async () => {
                    const { createDurableTaskQueue } = await import('./lib/coordination.js');
                    window.__crashWorker3 = createDurableTaskQueue({
                        namespace: ${JSON.stringify(tqNsCrash)},
                        dbName: ${JSON.stringify(tqDbName)},
                        workerId: 'crash-w3',
                        pollIntervalMs: 30,
                        leaseDurationMs: 8000,
                    });
                    window.__crashWorker3.registerHandler('slowCrash', async () => {
                        await new Promise((r) => setTimeout(r, 6000));
                        return { from: 'w3' };
                    });
                    const { task } = await window.__crashWorker3.enqueue({ type: 'slowCrash', payload: { marker: 'takeover' } });
                    window.__crashTaskId = task.id;
                    await window.__crashWorker3.start();
                })()`);
                const lockedRunning = await waitFor(tqTab3.page, `(async () => {
                    const t = await window.__crashWorker3.getTask(window.__crashTaskId);
                    return t && t.status === 'running' && t.lockProtected === true;
                })()`, 8000);
                check(lockedRunning, 'Worker 3 未進入 lockProtected running 狀態');
                const crashTaskId = await tqTab3.page.evaluate('window.__crashTaskId');

                await Promise.all([
                    tqTab1.page.evaluate(`(async () => {
                        const { createDurableTaskQueue } = await import('./lib/coordination.js');
                        window.__crashWorker1 = createDurableTaskQueue({
                            namespace: ${JSON.stringify(tqNsCrash)},
                            dbName: ${JSON.stringify(tqDbName)},
                            workerId: 'survivor-w1',
                            pollIntervalMs: 40,
                            reclaimIntervalMs: 60,
                            leaseDurationMs: 8000,
                        });
                        window.__crashWorker1.registerHandler('slowCrash', async (p, ctx) => ({ from: 'w1', marker: p.marker, attempt: ctx.attemptCount }));
                        await window.__crashWorker1.start();
                    })()`),
                    tqTab2.page.evaluate(`(async () => {
                        const { createDurableTaskQueue } = await import('./lib/coordination.js');
                        window.__crashWorker2 = createDurableTaskQueue({
                            namespace: ${JSON.stringify(tqNsCrash)},
                            dbName: ${JSON.stringify(tqDbName)},
                            workerId: 'survivor-w2',
                            pollIntervalMs: 40,
                            reclaimIntervalMs: 60,
                            leaseDurationMs: 8000,
                        });
                        window.__crashWorker2.registerHandler('slowCrash', async (p, ctx) => ({ from: 'w2', marker: p.marker, attempt: ctx.attemptCount }));
                        await window.__crashWorker2.start();
                    })()`),
                ]);

                // 確認尚在執行的 tqTab3 問題記錄清空，然後直接關閉分頁模擬崩潰
                failures.push(...tqTrack3.take().map((p) => `DurableTaskQueue Tab 3：${p}`));
                await tqTab3.close();

                const recoveredCrash = await waitFor(tqTab1.page, `(async () => {
                    const t = await window.__crashWorker1.getTask(${JSON.stringify(crashTaskId)});
                    return t && t.status === 'completed';
                })()`, 5000);
                check(recoveredCrash, 'Worker 3 關閉分頁後存活 Worker 未透過孤兒快收接手完成');
                const crashFinal = await tqTab1.page.evaluate(`window.__crashWorker1.getTask(${JSON.stringify(crashTaskId)})`);
                check(crashFinal.result?.marker === 'takeover' && crashFinal.attemptCount === 2,
                    `孤兒接手後任務結果異常：${JSON.stringify(crashFinal)}`);

                // 2.8.4 所有分頁全數關閉後再重開新分頁，任務仍從 IndexedDB 持久化復原完成
                await tqTab1.page.evaluate(`(async () => {
                    const { createDurableTaskQueue } = await import('./lib/coordination.js');
                    const q = createDurableTaskQueue({ namespace: ${JSON.stringify(tqNsReload)}, dbName: ${JSON.stringify(tqDbName)} });
                    await q.enqueue({ type: 'afterReload', payload: { item: 'persisted' } });
                    await window.__tq1.dispose();
                    await window.__tqIso.dispose();
                    await window.__crashWorker1.dispose();
                    window.__tqBus1.close();
                    await q.dispose();
                })()`);
                await tqTab2.page.evaluate(`(async () => {
                    await window.__tq2.dispose();
                    await window.__crashWorker2.dispose();
                    window.__tqBus2.close();
                })()`);

                failures.push(...tqTrack1.take().map((p) => `DurableTaskQueue Tab 1：${p}`));
                failures.push(...tqTrack2.take().map((p) => `DurableTaskQueue Tab 2：${p}`));
                await tqTab1.close();
                await tqTab2.close();

                tqTab4 = await openTab();
                const tqTrack4 = trackProblems(tqTab4.page);
                await tqTab4.page.send('Page.navigate', { url: testPageUrl });
                check(await waitFor(tqTab4.page, 'window.__COORD_READY__ === true', 10000), '重開分頁 Tab 4 未就緒');

                const reloadRecovered = await tqTab4.page.evaluate(`(async () => {
                    const { createDurableTaskQueue } = await import('./lib/coordination.js');
                    const q = createDurableTaskQueue({
                        namespace: ${JSON.stringify(tqNsReload)},
                        dbName: ${JSON.stringify(tqDbName)},
                        pollIntervalMs: 30,
                    });
                    const beforeList = await q.listTasks();
                    q.registerHandler('afterReload', (p) => ({ ok: true, item: p.item }));
                    await q.start();
                    for (let i = 0; i < 60; i++) {
                        const list = await q.listTasks();
                        if (list[0]?.status === 'completed') {
                            await q.clearNamespace();
                            const crashQ = createDurableTaskQueue({ namespace: ${JSON.stringify(tqNsCrash)}, dbName: ${JSON.stringify(tqDbName)} });
                            await crashQ.clearNamespace();
                            await crashQ.dispose();
                            await q.dispose();
                            return { beforeStatus: beforeList[0]?.status, after: list[0] };
                        }
                        await new Promise((r) => setTimeout(r, 40));
                    }
                    await q.dispose();
                    return { beforeStatus: beforeList[0]?.status, after: null };
                })()`);
                check(reloadRecovered.beforeStatus === 'pending' && reloadRecovered.after?.status === 'completed' && reloadRecovered.after?.result?.item === 'persisted',
                    `所有分頁關閉重開後 IndexedDB 復原失敗：${JSON.stringify(reloadRecovered)}`);
                failures.push(...tqTrack4.take().map((p) => `DurableTaskQueue Tab 4：${p}`));
                await tqTab4.close();
                tqTab4 = null;

                // 2.8.5 真實 3 分頁 #/lab/browser-cluster UI 整合測試（opt-in、join、Peer/Leader/RPC、送出任務與 Leader 關分頁接管）
                const clusterUrl = `${base}#/lab/browser-cluster?ns=${encodeURIComponent(uiNs)}`;
                await Promise.all([
                    uiTab1.page.send('Page.navigate', { url: clusterUrl }),
                    uiTab2.page.send('Page.navigate', { url: clusterUrl }),
                    uiTab3.page.send('Page.navigate', { url: clusterUrl }),
                ]);
                const uiReady = await Promise.all([
                    waitFor(uiTab1.page, 'Boolean(document.querySelector("page-lab-browser-cluster #bc-join-btn"))', 10000),
                    waitFor(uiTab2.page, 'Boolean(document.querySelector("page-lab-browser-cluster #bc-join-btn"))', 10000),
                    waitFor(uiTab3.page, 'Boolean(document.querySelector("page-lab-browser-cluster #bc-join-btn"))', 10000),
                ]);
                check(uiReady.every(Boolean), 'Browser Cluster Lab 三分頁 UI 未載入完成');

                // 確認預設 opt-in：尚未點擊前不應成為 leader 也不應有活躍節點
                const optInState = await uiTab1.page.evaluate(`({
                    roleText: document.querySelector('#bc-role-badge')?.textContent || '',
                    peerRows: document.querySelectorAll('#bc-peers-table tbody tr[data-label], #bc-peers-table tbody th[scope="row"]').length,
                    nsValue: document.querySelector('#bc-namespace')?.value || '',
                })`);
                check(optInState.roleText.includes('idle') && optInState.peerRows === 0 && optInState.nsValue === uiNs,
                    `Browser Cluster Lab 應採 opt-in 啟動，實際：${JSON.stringify(optInState)}`);

                // 分頁 1 加入成為 leader，隨後分頁 2 與 3 加入成為 follower
                await uiTab1.page.evaluate(`document.querySelector('#bc-join-btn').click()`);
                check(await waitFor(uiTab1.page, '(document.querySelector("#bc-role-badge")?.textContent || "").includes("leader")', 8000),
                    'Browser Cluster UI Tab 1 未成為 leader');

                await uiTab2.page.evaluate(`document.querySelector('#bc-join-btn').click()`);
                await uiTab3.page.evaluate(`document.querySelector('#bc-join-btn').click()`);
                check(await waitFor(uiTab2.page, '(document.querySelector("#bc-stats-summary")?.textContent || "").includes("3 節點")', 8000),
                    'Browser Cluster UI 未偵測到 3 個線上節點');

                // 在 UI 送出真實持久化任務並等待完成
                await uiTab1.page.evaluate(`(() => {
                    const input = document.querySelector('#bc-task-input');
                    const keyInput = document.querySelector('#bc-task-idempotency');
                    input.value = 'ui-e2e-checksum';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    keyInput.value = 'ui-idem-1';
                    keyInput.dispatchEvent(new Event('input', { bubbles: true }));
                    document.querySelector('#bc-enqueue-btn').click();
                })()`);
                check(await waitFor(uiTab2.page, 'Boolean(document.querySelector("#bc-tasks-table tbody tr[data-task-status=\'completed\']"))', 8000),
                    'Browser Cluster UI 送出的任務未完成並同步於其他分頁');

                // Follower 透過 UI 呼叫 RPC cluster.ping
                await uiTab2.page.evaluate(`document.querySelector('#bc-rpc-ping-btn').click()`);
                check(await waitFor(uiTab2.page, '(document.querySelector("#bc-rpc-result")?.textContent || "").includes(\'"pong": true\')', 5000),
                    'Browser Cluster UI RPC cluster.ping 未收到正確回應');

                // 關閉 UI Leader 分頁 1，驗證分頁 2/3 其中之一自動接管成為 Leader
                failures.push(...uiTrack1.take().map((p) => `Cluster Lab Tab 1：${p}`));
                await uiTab1.close();

                const deadlineTakeover = Date.now() + 8000;
                let r2 = '';
                let r3 = '';
                let leadersAfterClose = [];
                while (Date.now() < deadlineTakeover) {
                    [r2, r3] = await Promise.all([
                        uiTab2.page.evaluate('document.querySelector("#bc-role-badge")?.textContent || ""').catch(() => ''),
                        uiTab3.page.evaluate('document.querySelector("#bc-role-badge")?.textContent || ""').catch(() => ''),
                    ]);
                    leadersAfterClose = [r2, r3].filter((txt) => txt.includes('leader'));
                    if (leadersAfterClose.length === 1) break;
                    await sleep(100);
                }
                check(leadersAfterClose.length === 1,
                    `關閉 Cluster Lab Leader 後應唯一新分頁接管，實際 r2=${r2.trim()}, r3=${r3.trim()}`);

                // 清理 UI namespace 測試資料
                await uiTab2.page.evaluate(`document.querySelector('#bc-reset-ns-btn').click()`);
                check(await waitFor(uiTab2.page, '!document.querySelector("#bc-tasks-table tbody tr[data-task-id]")', 5000),
                    'Browser Cluster UI 重置命名空間未清空任務表');

                failures.push(...uiTrack2.take().map((p) => `Cluster Lab Tab 2：${p}`));
                failures.push(...uiTrack3.take().map((p) => `Cluster Lab Tab 3：${p}`));
            } finally {
                await tqTab4?.close();
                await tqTab1.close();
                await tqTab2.close();
                await tqTab3.close();
                await uiTab1.close();
                await uiTab2.close();
                await uiTab3.close();
            }
        }

        if (trackerA && tabA) failures.push(...trackerA.take().map((p) => `雙分頁 Tab A：${p}`));
        if (trackerC) failures.push(...trackerC.take().map((p) => `雙分頁 Tab C：${p}`));
        if (trackerD) failures.push(...trackerD.take().map((p) => `雙分頁 Tab D：${p}`));

        // 2.9 Phase 5 PoC：真實雙分頁 SharedWorker 與跨裝置 WebSocket Relay Transport Adapter 驗證
        {
            let swTab1 = await openTab();
            const swTab2 = await openTab();
            const swTrack1 = trackProblems(swTab1.page);
            const swTrack2 = trackProblems(swTab2.page);
            const p5Room = `p5-ws-${Date.now()}`;
            const p5Ns = `p5-ns-${Date.now()}`;
            const wsRelayUrl = realtime.wsUrl(p5Room, { relay: '1' });

            try {
                await Promise.all([
                    swTab1.page.send('Page.navigate', { url: testPageUrl }),
                    swTab2.page.send('Page.navigate', { url: testPageUrl }),
                ]);
                const swReady = await Promise.all([
                    waitFor(swTab1.page, 'window.__COORD_READY__ === true', 10000),
                    waitFor(swTab2.page, 'window.__COORD_READY__ === true', 10000),
                ]);
                check(swReady.every(Boolean), 'Phase 5 PoC 測試分頁未就緒');

                const hasSwSupport = await swTab1.page.evaluate('typeof SharedWorker === "function"');
                if (hasSwSupport) {
                    // 2.9.1 真實瀏覽器 SharedWorker + v1 Envelope / RpcChannel 與分頁關閉狀態延續驗證
                    await Promise.all([
                        swTab1.page.evaluate(`(async () => {
                            const { createMessageBus, createRpcChannel } = await import('./lib/coordination.js');
                            const { createSharedWorkerPortTransport } = await import('./tests/helpers/phase5-poc-transports.js');
                            const swUrl = new URL('./tests/helpers/phase5-shared-worker.js', document.baseURI).href;
                            const worker = new SharedWorker(swUrl);
                            window.__swTransport1 = createSharedWorkerPortTransport(worker.port);
                            window.__swBus1 = createMessageBus({ namespace: ${JSON.stringify(p5Ns)}, transport: window.__swTransport1, tabId: 'sw-tab-1' });
                            window.__swRpc1 = createRpcChannel({ bus: window.__swBus1, timeoutMs: 3000 });
                            window.__swRpc1.register('sw.echo', (params) => ({ ok: true, from: 'sw-tab-1', params }));
                            await window.__swTransport1.queryHub('bump');
                        })()`),
                        swTab2.page.evaluate(`(async () => {
                            const { createMessageBus, createRpcChannel } = await import('./lib/coordination.js');
                            const { createSharedWorkerPortTransport } = await import('./tests/helpers/phase5-poc-transports.js');
                            const swUrl = new URL('./tests/helpers/phase5-shared-worker.js', document.baseURI).href;
                            const worker = new SharedWorker(swUrl);
                            window.__swTransport2 = createSharedWorkerPortTransport(worker.port);
                            window.__swBus2 = createMessageBus({ namespace: ${JSON.stringify(p5Ns)}, transport: window.__swTransport2, tabId: 'sw-tab-2' });
                            window.__swRpc2 = createRpcChannel({ bus: window.__swBus2, timeoutMs: 3000 });
                        })()`),
                    ]);

                    const swRpcRes = await swTab2.page.evaluate(`window.__swRpc2.call('sw.echo', { msg: 'via-shared-worker' }, { target: 'sw-tab-1' })`);
                    check(swRpcRes?.ok === true && swRpcRes?.from === 'sw-tab-1',
                        `SharedWorker RPC 回應異常：${JSON.stringify(swRpcRes)}`);

                    // Tab 1 離開並真實關閉分頁，驗證 Tab 2 仍能讀取 SharedWorker 記憶體計數與已回收 port 數
                    await swTab1.page.evaluate(`(async () => {
                        await window.__swRpc1.dispose();
                        window.__swBus1.close();
                    })()`);
                    failures.push(...swTrack1.take().map((p) => `Phase 5 SharedWorker Tab 1：${p}`));
                    await swTab1.close();
                    swTab1 = null;

                    const statsSettled = await waitFor(swTab2.page, `(async () => {
                        const s = await window.__swTransport2.queryHub('stats');
                        window.__p5LastStats = s;
                        return Boolean(s && s.persistedCounter >= 1 && s.activePorts === 1);
                    })()`, 3000);
                    const afterCloseStats = await swTab2.page.evaluate('window.__p5LastStats');
                    check(statsSettled && afterCloseStats?.persistedCounter >= 1 && afterCloseStats?.activePorts === 1,
                        `關閉 Tab 1 後 SharedWorker 狀態應保留且 port 數降為 1，實際：${JSON.stringify(afterCloseStats)}`);

                    await swTab2.page.evaluate(`(async () => {
                        await window.__swRpc2.dispose();
                        window.__swBus2.close();
                    })()`);
                } else {
                    check(false, 'Chromium 環境應支援 SharedWorker');
                }

                // 2.9.2 跨裝置 JSON Wire Adapter（真實 WebSocket Relay，透過現有 RpcChannel 互通並驗證能力邊界）
                const wsTab1 = await openTab();
                const wsTab2 = swTab2;
                const wsTrack1 = trackProblems(wsTab1.page);
                try {
                    await wsTab1.page.send('Page.navigate', { url: testPageUrl });
                    check(await waitFor(wsTab1.page, 'window.__COORD_READY__ === true', 10000), 'Phase 5 WS Relay Tab 未就緒');

                    await Promise.all([
                        wsTab1.page.evaluate(`(async () => {
                            const { createMessageBus, createRpcChannel } = await import('./lib/coordination.js');
                            const { createJsonWireTransportAdapter } = await import('./tests/helpers/phase5-poc-transports.js');
                            const ws = new WebSocket(${JSON.stringify(wsRelayUrl)});
                            await new Promise((resolve, reject) => {
                                ws.addEventListener('open', resolve, { once: true });
                                ws.addEventListener('error', reject, { once: true });
                            });
                            window.__wsAdapter1 = createJsonWireTransportAdapter(ws, { kind: 'websocket-relay' });
                            window.__wsBus1 = createMessageBus({ namespace: ${JSON.stringify(p5Ns)}, transport: window.__wsAdapter1, tabId: 'dev-tab-1' });
                            window.__wsRpc1 = createRpcChannel({ bus: window.__wsBus1, timeoutMs: 3000 });
                            window.__wsRpc1.register('relay.ping', (p) => ({ pong: true, device: 'dev-tab-1', p }));
                        })()`),
                        wsTab2.page.evaluate(`(async () => {
                            const { createMessageBus, createRpcChannel } = await import('./lib/coordination.js');
                            const { createJsonWireTransportAdapter } = await import('./tests/helpers/phase5-poc-transports.js');
                            const ws = new WebSocket(${JSON.stringify(wsRelayUrl)});
                            await new Promise((resolve, reject) => {
                                ws.addEventListener('open', resolve, { once: true });
                                ws.addEventListener('error', reject, { once: true });
                            });
                            window.__wsAdapter2 = createJsonWireTransportAdapter(ws, { kind: 'websocket-relay' });
                            window.__wsBus2 = createMessageBus({ namespace: ${JSON.stringify(p5Ns)}, transport: window.__wsAdapter2, tabId: 'dev-tab-2' });
                            window.__wsRpc2 = createRpcChannel({ bus: window.__wsBus2, timeoutMs: 3000 });
                        })()`),
                    ]);

                    const relayRpc = await wsTab2.page.evaluate(`(async () => ({
                        res: await window.__wsRpc2.call('relay.ping', { v: 5 }, { target: 'dev-tab-1' }),
                        caps: window.__wsAdapter2.capabilities,
                    }))()`);
                    check(
                        relayRpc?.res?.pong === true &&
                        relayRpc?.res?.device === 'dev-tab-1' &&
                        relayRpc?.caps?.supportsWebLocks === false &&
                        relayRpc?.caps?.scope === 'cross-device',
                        `跨裝置 WS Relay PoC 結果異常：${JSON.stringify(relayRpc)}`
                    );

                    await Promise.all([
                        wsTab1.page.evaluate(`(async () => { await window.__wsRpc1.dispose(); window.__wsBus1.close(); })()`),
                        wsTab2.page.evaluate(`(async () => { await window.__wsRpc2.dispose(); window.__wsBus2.close(); })()`),
                    ]);
                    const wsDeadline = Date.now() + 3000;
                    while (realtime.getStats(p5Room).activeWsCount > 0 && Date.now() < wsDeadline) {
                        await sleep(20);
                    }
                    check(realtime.getStats(p5Room).activeWsCount === 0, 'Phase 5 WS Relay 關閉後仍有殘留連線');
                    failures.push(...wsTrack1.take().map((p) => `Phase 5 WS Tab 1：${p}`));
                } finally {
                    await wsTab1.close();
                }

                failures.push(...swTrack2.take().map((p) => `Phase 5 Tab 2：${p}`));
            } finally {
                await swTab1?.close();
                await swTab2.close();
            }
        }
    } finally {
        await tabA?.close();
        await tabB?.close();
        await tabC?.close();
        await tabD?.close();
    }

    console.log('  雙分頁協作測試：coordination-demo.html、無副作用載入、MessageBus、Store、Web Locks、RPC、PeerDiscovery、Shared WS/SSE、DurableTaskQueue、Browser Cluster Lab、Phase 5 PoC (SharedWorker / WS Relay)');
    return failures;
}

/** A fresh origin installs the worker before any prior fetch can warm its runtime cache. */
/** Solutions（#9）：首頁與側欄入口、深連結、kiosk 版面切換、巢狀路由生命週期與雙語文件 */
async function runSolutionsTests(openTab, base) {
    const failures = [];
    const check = (ok, message) => { if (!ok) failures.push(`Solutions：${message}`); };
    let tab = null;
    try {
        tab = await openTab();
        const { page } = tab;
        const tracker = trackProblems(page);
        const network = trackNetwork(page);
        const settle = async () => {
            await waitForNetworkIdle(network);
            await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', 3000);
        };

        // 深連結：新分頁直接開 #/solutions
        await page.send('Page.navigate', { url: `${base}#/solutions` });
        check(await waitFor(page, "document.querySelector('page-solutions-index .solution-card') !== null", 15000),
            '直接開啟 #/solutions 應顯示目錄');
        await settle();
        const catalog = await page.evaluate(`(() => {
            const cards = [...document.querySelectorAll('page-solutions-index .solution-card')];
            const open = (id) => document.querySelector('.solution-card[data-solution="' + id + '"] a.btn-primary')?.getAttribute('href') ?? null;
            return { ids: cards.map((c) => c.dataset.solution), pos: open('pos'), farm: open('farm'), cluster: open('browser-cluster') };
        })()`);
        check(JSON.stringify(catalog.ids) === JSON.stringify(['pos', 'farm', 'browser-cluster']), `目錄項目不符：${catalog.ids.join(', ')}`);
        check(catalog.cluster === '#/lab/browser-cluster', 'Browser Cluster 應連回 #/lab/browser-cluster，不在 Solutions 重做');
        check(catalog.pos === '#/solutions/pos', `POS 應連到 #/solutions/pos，實際為 ${catalog.pos}`);
        check(catalog.farm === '#/solutions/farm', `Farm 應連到 #/solutions/farm，實際為 ${catalog.farm}`);
        check(await page.evaluate("document.querySelector('#app-nav a.nav-link[href=\"#/solutions\"]') !== null"), '側欄應有 Solutions 入口');

        // kiosk 版面：不渲染側欄、漢堡按鈕、頁尾與 Solutions 標頭；切換時目錄頁不重建
        await page.evaluate("document.querySelector('page-solutions-index').__marker = true");
        await page.evaluate("location.hash = '#/solutions?kiosk=1'");
        await waitFor(page, "document.querySelector('.kiosk-exit') !== null", 5000);
        await settle();
        const kiosk = await page.evaluate(`(() => ({
            nav: !!document.querySelector('#app-nav'),
            hamburger: !!document.querySelector('.hamburger-btn'),
            footer: !!document.querySelector('app-footer'),
            header: !!document.querySelector('.solutions-header'),
            exit: document.querySelector('.kiosk-exit')?.getAttribute('href'),
            marginLeft: getComputedStyle(document.querySelector('main#main-content')).marginLeft,
            sameIndex: document.querySelector('page-solutions-index')?.__marker === true,
        }))()`);
        check(!kiosk.nav && !kiosk.hamburger && !kiosk.footer, 'kiosk 版面不應渲染側欄、漢堡按鈕與頁尾');
        check(!kiosk.header, 'kiosk 版面不應顯示 Solutions 標頭');
        check(kiosk.exit === '#/solutions', `離開 kiosk 連結應回到 #/solutions，實際為 ${kiosk.exit}`);
        check(kiosk.marginLeft === '0px', `kiosk 版面主內容不應保留側欄寬度（margin-left: ${kiosk.marginLeft}）`);
        check(kiosk.sameIndex, '切換 kiosk 版面不應重建同一路由的頁面');

        await page.evaluate("document.querySelector('.kiosk-exit').click()");
        await waitFor(page, "document.querySelector('#app-nav') !== null", 5000);
        await settle();
        check(await page.evaluate("location.hash === '#/solutions' && !!document.querySelector('.solutions-header') && !!document.querySelector('app-footer')"),
            '離開 kiosk 後應恢復側欄、頁尾與標頭');

        // 巢狀 404 與離開 Solutions 時移除頁面（ADR 0102）
        await page.evaluate("location.hash = '#/solutions/not-a-solution'");
        await waitFor(page, "document.querySelector('x-route[path=\"/solutions/*\"][active]') !== null", 5000);
        check(await page.evaluate("document.querySelector('x-route[path=\"/solutions/*\"][active]')?.textContent.includes('找不到這個 Solution')"),
            '未知的 /solutions/* 應顯示 Solutions 的 404');
        await page.evaluate("location.hash = '#/'");
        await waitFor(page, "document.querySelector('page-home') !== null", 5000);
        await settle();
        check(await page.evaluate("document.querySelector('page-solutions') === null"), '離開 /solutions 後應移除 <page-solutions>');
        check(await page.evaluate("document.querySelector('page-home a[href=\"#/solutions\"]') !== null"), '首頁應有 Solutions 入口');

        // 雙語文件互相連結
        for (const [id, heading, counterpart] of [
            ['solutions/conventions', 'Solutions Reference App 慣例', 'solutions/conventions.en'],
            ['solutions/conventions.en', 'Solutions Reference App Conventions', 'solutions/conventions'],
            ['solutions/reference-app-template', 'Solutions 文件範本', 'solutions/reference-app-template.en'],
            ['solutions/reference-app-template.en', 'Solutions Doc Template', 'solutions/reference-app-template'],
        ]) {
            await page.evaluate(`location.hash = ${JSON.stringify(`#/docs/${id}`)}`);
            const ok = await waitFor(page, `document.querySelector('page-docs h1')?.textContent.includes(${JSON.stringify(heading)})`, 5000);
            check(ok, `#/docs/${id} 未顯示標題「${heading}」`);
            if (ok) {
                check(await page.evaluate(`document.querySelector('page-docs a[href="#/docs/${counterpart}"]') !== null`),
                    `#/docs/${id} 應連到另一語言版本 #/docs/${counterpart}`);
            }
        }
        await settle();
        failures.push(...tracker.take().map((p) => `Solutions：${p}`));
    } catch (err) {
        failures.push(`Solutions：測試中斷：${err.message.split('\n')[0]}`);
    } finally {
        await tab?.close();
    }
    console.log('  Solutions 測試：入口、深連結、kiosk 版面、巢狀路由生命週期、雙語文件');
    return failures;
}

/**
 * Multi-Window POS（#10）：真實同源分頁走完下單 → 認領 → 完成 → 取餐；並行認領只有一個成功；
 * 同一 requestId 重送不產生第二張單；晚加入與重新整理看到一致狀態；關閉站台後其他站台可接手；重設後各視窗一致。
 */
async function runPosTests(openTab, base) {
    const failures = [];
    const check = (ok, message) => { if (!ok) failures.push(`POS：${message}`); };
    const ns = `e2e-pos-${Date.now().toString(36)}`;
    const url = (path) => `${base}#/solutions/pos${path}?ns=${ns}&kiosk=1`;
    const tabs = [];
    const open = async (path, ready) => {
        const tab = await openTab({ newWindow: true });
        tab.tracker = trackProblems(tab.page);
        tabs.push(tab);
        await tab.page.send('Page.navigate', { url: url(path) });
        if (!(await waitFor(tab.page, ready, 15000))) throw new Error(`${path} 未就緒`);
        return tab;
    };
    const click = (tab, selector) => tab.page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el || el.disabled) return false;
        el.click();
        return true;
    })()`);
    const text = (tab, selector) => tab.page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null`);
    const repoCall = (tab, namespace, body) => tab.page.evaluate(`(async () => {
        const { createPosRepository } = await import('./components/pages/solutions/pos/pos-repository.js');
        const { solutionStorageName } = await import('./components/pages/solutions/solution-kit.js');
        const repo = createPosRepository({ dbName: solutionStorageName(${JSON.stringify(namespace)}, 'orders') });
        try { return await (${body})(repo); } finally { repo.close(); }
    })()`, 15000);
    try {
        // 入口頁：角色連結帶著 namespace 與 kiosk
        const admin = await open('', "document.querySelector('[data-role-link=\"kitchen\"]') !== null");
        const kitchenLink = await admin.page.evaluate("document.querySelector('[data-role-link=\"kitchen\"]').getAttribute('href')");
        check(kitchenLink === `#/solutions/pos/kitchen?ns=${ns}&kiosk=1`, `入口頁的廚房連結不正確：${kitchenLink}`);

        const order = await open('/order', "document.querySelector('.pos-menu button[data-product=\"burger\"]') !== null");
        const kitchenA = await open('/kitchen', "document.querySelector('[data-column=\"pending\"]') !== null && !!document.querySelector('[data-station]')");
        const kitchenB = await open('/kitchen', "document.querySelector('[data-column=\"pending\"]') !== null && !!document.querySelector('[data-station]')");
        const display = await open('/display', "document.querySelector('[data-column=\"ready\"]') !== null");
        const stationOf = (tab) => tab.page.evaluate("document.querySelector('[data-station]')?.dataset.station ?? null");
        const stationA = await stationOf(kitchenA);
        const stationB = await stationOf(kitchenB);
        check(stationA && stationB && stationA !== stationB, `兩個廚房視窗應是不同站台：${stationA}、${stationB}`);

        // 同一個 requestId 同時送出兩次：只會有一張單
        const dup = await repoCall(order, ns, `async (repo) => {
            const items = [{ productId: 'burger', qty: 1 }];
            const [a, b] = await Promise.all([repo.placeOrder({ items, requestId: 'dup-1' }), repo.placeOrder({ items, requestId: 'dup-1' })]);
            const all = await repo.listOrders();
            return { results: [a.result, b.result].sort(), same: a.order.id === b.order.id, count: all.filter((o) => o.requestId === 'dup-1').length };
        }`);
        check(dup.same && dup.count === 1 && dup.results.join() === 'applied,noop', `同一 requestId 重送應只建立一張單：${JSON.stringify(dup)}`);

        // 點餐視窗下單
        await click(order, '.pos-menu button[data-product="burger"]');
        await click(order, '.pos-menu button[data-product="burger"]');
        await click(order, '.pos-menu button[data-product="cola"]');
        await waitFor(order.page, "document.querySelector('.pos-cart-total')?.textContent.includes('275')", 5000);
        check((await text(order, '.pos-cart-total'))?.includes('275'), '購物車合計應為 275');
        check(await click(order, '[data-action="submit"]'), '送出按鈕應可點擊');
        check(await waitFor(order.page, "document.querySelector('[data-last-order]') !== null", 5000), '送出後應顯示取餐號碼');
        const number = await order.page.evaluate("document.querySelector('[data-last-order]')?.dataset.lastOrder");
        check(number === '002', `第二張單的取餐號碼應為 002，實際為 ${number}`);

        // 其他視窗收到通知後重讀
        const pendingTicket = `[data-column="pending"] [data-order-number="${number}"]`;
        for (const [label, tab] of [['廚房 A', kitchenA], ['廚房 B', kitchenB]]) {
            check(await waitFor(tab.page, `document.querySelector(${JSON.stringify(pendingTicket)}) !== null`, 5000), `${label} 應出現新訂單 ${number}`);
        }
        check(await waitFor(display.page, `document.querySelector('[data-column="preparing"] [data-order-number="${number}"]') !== null`, 5000),
            `叫號畫面的備餐中應出現 ${number}`);

        // 兩個廚房同時認領：只有一個成功
        const claimButton = `${pendingTicket} [data-action="claim"]`;
        await Promise.all([click(kitchenA, claimButton), click(kitchenB, claimButton)]);
        const mine = `[data-column="mine"] [data-order-number="${number}"]`;
        const others = `[data-column="others"] [data-order-number="${number}"]`;
        await waitFor(kitchenA.page, `!!document.querySelector(${JSON.stringify(mine)}) || !!document.querySelector(${JSON.stringify(others)})`, 5000);
        await waitFor(kitchenB.page, `!!document.querySelector(${JSON.stringify(mine)}) || !!document.querySelector(${JSON.stringify(others)})`, 5000);
        const aMine = await kitchenA.page.evaluate(`!!document.querySelector(${JSON.stringify(mine)})`);
        const bMine = await kitchenB.page.evaluate(`!!document.querySelector(${JSON.stringify(mine)})`);
        check(aMine !== bMine, `並行認領應只有一個站台成功（A：${aMine}，B：${bMine}）`);
        const [winner, loser] = aMine ? [kitchenA, kitchenB] : [kitchenB, kitchenA];
        const winnerStation = aMine ? stationA : stationB;
        check(await waitFor(loser.page, "document.querySelector('.pos-notice [data-code=\"CONFLICT\"]') !== null", 3000),
            '認領失敗的站台應顯示「已由其他站台處理」');
        const preparingCount = await repoCall(order, ns, `async (repo) => {
            const all = await repo.listOrders();
            const target = all.find((o) => o.number === ${JSON.stringify(number)});
            return target.history.filter((h) => h.status === 'preparing').length;
        }`);
        check(preparingCount === 1, `訂單歷程應只有一次備餐，實際 ${preparingCount} 次`);

        // 跨分頁原子性：兩個分頁各自對同一批訂單同時認領，每張單只成功一次
        const raceNs = `${ns}-race`;
        await repoCall(kitchenA, raceNs, `async (repo) => {
            for (let i = 0; i < 6; i++) await repo.placeOrder({ items: [{ productId: 'tea', qty: 1 }], requestId: 'race-' + i });
        }`);
        const raceBody = (actor) => `async (repo) => {
            const ids = (await repo.listOrders()).map((o) => o.id);
            const outcomes = await Promise.all(ids.map((id) => repo.transition(id, { action: 'claim', actor: ${JSON.stringify(actor)} })
                .then((r) => r.result, (err) => err.code)));
            return outcomes;
        }`;
        const [raceA, raceB] = await Promise.all([repoCall(kitchenA, raceNs, raceBody('T-A')), repoCall(kitchenB, raceNs, raceBody('T-B'))]);
        const applied = [...raceA, ...raceB].filter((r) => r === 'applied').length;
        const conflicts = [...raceA, ...raceB].filter((r) => r === 'CONFLICT').length;
        check(applied === 6 && conflicts === 6, `跨分頁並行認領 6 張單應各成功一次：applied=${applied}、CONFLICT=${conflicts}`);
        await kitchenA.page.evaluate(`new Promise((resolve) => { const r = indexedDB.deleteDatabase(${JSON.stringify(`vanilla_solution:${raceNs}:orders`)}); r.onsuccess = r.onerror = () => resolve(); })`);

        // 完成備餐 → 叫號 → 取餐
        check(await click(winner, `${mine} [data-action="ready"]`), '認領成功的站台應能按「備餐完成」');
        const readyTicket = `[data-column="ready"] [data-order-number="${number}"]`;
        check(await waitFor(display.page, `document.querySelector(${JSON.stringify(readyTicket)}) !== null`, 5000), `叫號畫面應把 ${number} 移到請取餐`);
        check(await click(display, `${readyTicket} [data-action="pickup"]`), '叫號畫面應能按「已取餐」');
        check(await waitFor(display.page, `document.querySelector(${JSON.stringify(readyTicket)}) === null`, 5000), '取餐後號碼應從請取餐移除');
        check(await waitFor(order.page, "document.querySelector('[data-last-status=\"picked_up\"]') !== null", 5000), '點餐視窗應看到訂單已取餐');

        // 晚加入：入口頁換成管理視窗，看到一致的統計（ADR 0102：入口頁卸載、管理頁新建）
        await admin.page.evaluate(`location.hash = ${JSON.stringify(`#/solutions/pos/admin?ns=${ns}&kiosk=1`)}`);
        check(await waitFor(admin.page, "document.querySelector('page-pos-hub') === null && document.querySelector('[data-stat=\"picked_up\"] strong')?.textContent === '1'", 8000),
            '晚加入的管理視窗應看到 1 張已取餐');
        check(await text(admin, '[data-stat="pending"] strong') === '1', '管理視窗應看到 1 張待處理（重送測試的訂單）');

        // 重新整理：站台身分沿用，狀態從 IndexedDB 恢復
        await loser.page.send('Page.reload');
        await waitFor(loser.page, "document.querySelector('[data-column=\"pending\"] [data-order-number=\"001\"]') !== null", 10000);
        const loserStationBefore = aMine ? stationB : stationA;
        check(await stationOf(loser) === loserStationBefore, '重新整理後應沿用同一個站台');
        check(await loser.page.evaluate("document.querySelector('[data-column=\"pending\"] [data-order-number=\"001\"]') !== null"),
            '重新整理後應看到待處理的 001');

        // 站台關閉後接手：winner 認領 001 後關閉，loser 看到站台已關閉並接手
        const ticket001 = '[data-column="pending"] [data-order-number="001"] [data-action="claim"]';
        await waitFor(winner.page, `document.querySelector(${JSON.stringify(ticket001)}) !== null`, 5000);
        check(await click(winner, ticket001), '站台應能認領 001');
        await waitFor(loser.page, "document.querySelector('[data-column=\"others\"] [data-order-number=\"001\"]') !== null", 5000);
        failures.push(...winner.tracker.take().map((p) => `POS（廚房 ${winnerStation}）：${p}`));
        await winner.close();
        tabs.splice(tabs.indexOf(winner), 1);
        const takeover = `[data-column="others"] [data-order-number="001"] [data-action="takeover"][data-station="${winnerStation}"]`;
        if (!(await waitFor(loser.page, `document.querySelector(${JSON.stringify(takeover)}) !== null`, 8000))) {
            const diag = await loser.page.evaluate(`(async () => ({
                held: (await navigator.locks.query()).held.map((l) => l.name),
                state: document.querySelector('[data-column="others"] [data-order-number="001"] [data-station-state]')?.dataset.stationState ?? null,
                visibility: document.visibilityState,
            }))()`);
            check(false, `站台關閉後應出現「接手」：${JSON.stringify(diag)}`);
        }
        check(await click(loser, takeover), '應能接手已關閉站台的訂單');
        check(await waitFor(loser.page, "document.querySelector('[data-column=\"mine\"] [data-order-number=\"001\"]') !== null", 5000), '接手後訂單應移到本站');

        // 重設：其他視窗的連線自動讓出，各視窗都回到空的訂單與完整菜單
        check(await click(admin, '[data-action="reset"]'), '管理視窗應能重設');
        check(await waitFor(admin.page, "document.querySelector('.pos-notice')?.textContent.includes('已重設')", 8000),
            `重設應成功：${await text(admin, '.pos-notice')}`);
        check(await waitFor(loser.page, "document.querySelectorAll('[data-order-number]').length === 0", 8000), '重設後廚房應沒有訂單');
        check(await waitFor(display.page, "document.querySelectorAll('[data-order-number]').length === 0", 8000), '重設後叫號畫面應沒有訂單');
        check(await waitFor(admin.page, "document.querySelector('[data-stat=\"picked_up\"] strong')?.textContent === '0'", 8000), '重設後統計應歸零');
        check(await order.page.evaluate("document.querySelectorAll('.pos-menu button').length") === 8, '重設後菜單應自動重新載入');

        for (const tab of tabs) failures.push(...tab.tracker.take().map((p) => `POS：${p}`));
    } catch (err) {
        failures.push(`POS：測試中斷：${err.message.split('\n')[0]}`);
    } finally {
        for (const tab of tabs) await tab.close();
    }
    console.log('  POS 多分頁測試：下單、並行認領、冪等重送、晚加入、重新整理、站台接手、重設');
    return failures;
}

/**
 * Browser Computing Farm（#11）：多個真實分頁處理圖片；輸出符合設定；損壞圖片重試到上限後失敗；
 * 處理中途關閉節點、所有分頁都關閉後重新開啟可恢復；沒有孤兒輸出；重設後清空。
 */
async function runFarmTests(openTab, base) {
    const failures = [];
    const check = (ok, message) => { if (!ok) failures.push(`Farm：${message}`); };
    const ns = `e2e-farm-${Date.now().toString(36)}`;
    const tabs = [];
    const open = async () => {
        const tab = await openTab({ newWindow: true });
        tab.tracker = trackProblems(tab.page);
        tabs.push(tab);
        await tab.page.send('Page.navigate', { url: `${base}#/solutions/farm?ns=${ns}` });
        if (!(await waitFor(tab.page, "document.querySelector('[data-action=\"samples\"]') !== null", 15000))) throw new Error('Farm 頁面未就緒');
        return tab;
    };
    const close = async (tab) => {
        failures.push(...tab.tracker.take().map((p) => `Farm：${p}`));
        await tab.close();
        tabs.splice(tabs.indexOf(tab), 1);
    };
    const click = (tab, selector) => tab.page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el || el.disabled) return false;
        el.click();
        return true;
    })()`);
    const join = async (tab) => {
        check(await click(tab, '[data-action="join"]'), '應能加入處理');
        check(await waitFor(tab.page, "document.querySelector('[data-joined=\"true\"]') !== null", 8000), '加入後應顯示處理中');
    };
    const runState = (tab) => tab.page.evaluate(`(() => {
        const rows = [...document.querySelectorAll('[data-task-id]')];
        return {
            run: document.querySelector('[data-run]')?.dataset.run ?? null,
            finished: document.querySelector('[data-run-finished]')?.dataset.runFinished === 'true',
            statuses: rows.map((r) => r.dataset.status),
            attempts: rows.map((r) => Number(r.dataset.attempts)),
        };
    })()`);
    // 直接讀佇列與 Blob store，核對輸出是否符合設定、是否有孤兒
    const inspect = (tab) => tab.page.evaluate(`(async () => {
        const { createDurableTaskQueue } = await import('./lib/coordination.js');
        const { FarmStore } = await import('./components/pages/solutions/farm/farm-store.js');
        const queue = createDurableTaskQueue({ namespace: ${JSON.stringify(ns)} });
        const store = new FarmStore(${JSON.stringify(`vanilla_solution:${ns}:blobs`)});
        try {
            const tasks = await queue.listTasks({ type: 'image.process' });
            const outputs = await store.listOutputMeta();
            const referenced = new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.result.outputKey));
            return {
                completed: tasks.filter((t) => t.status === 'completed').length,
                failed: tasks.filter((t) => t.status === 'failed').length,
                total: tasks.length,
                nodes: [...new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.result.nodeId))].length,
                outputs: outputs.length,
                unreferenced: outputs.filter((o) => !referenced.has(o.key)).length,
                missing: [...referenced].filter((key) => !outputs.some((o) => o.key === key)).length,
                badSize: outputs.filter((o) => o.width !== 320 || o.height !== 240).length,
                types: [...new Set(outputs.map((o) => o.type))],
                inputs: (await store.listInputMeta()).length,
            };
        } finally {
            store.close();
            await queue.dispose();
        }
    })()`, 15000);
    try {
        // 兩個節點先加入，再匯入 8 張測試圖片與 1 張損壞圖片、以 320px WebP 建立批次
        const a = await open();
        const b = await open();
        await join(a);
        await join(b);
        await a.page.evaluate(`(() => {
            const broken = document.querySelector('#farm-broken');
            broken.checked = true;
            broken.dispatchEvent(new Event('change', { bubbles: true }));
            const width = document.querySelector('#farm-max-width');
            width.value = '320';
            width.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        check(await click(a, '[data-action="samples"]'), '應能產生測試圖片');
        check(await waitFor(a.page, "document.querySelector('.farm-notice')?.textContent.includes('已匯入 9 張')", 15000), '應匯入 8 張測試圖片與 1 張損壞圖片');
        await waitFor(a.page, "document.querySelector('[data-action=\"run\"]')?.disabled === false", 5000);
        check(await click(a, '[data-action="run"]'), '應能建立批次');
        check(await waitFor(a.page, "document.querySelector('[data-run-finished=\"true\"]') !== null", 45000), '第一個批次應在時限內處理完');
        const first = await runState(a);
        check(first.statuses.filter((s) => s === 'completed').length === 8, `應完成 8 張：${first.statuses.join(',')}`);
        const brokenIndex = first.statuses.indexOf('failed');
        check(brokenIndex !== -1 && first.attempts[brokenIndex] === 3, `損壞圖片應重試到 3 次後失敗：${JSON.stringify(first)}`);
        check(await b.page.evaluate("document.querySelector('[data-run-finished=\"true\"]') !== null"), '另一個分頁應看到同樣的批次完成');
        check(await waitFor(a.page, "document.querySelectorAll('.farm-gallery img').length === 8", 8000), '應顯示 8 張結果縮圖');
        check(await a.page.evaluate("[...document.querySelectorAll('.farm-gallery a[download]')].every((link) => link.href.startsWith('blob:') && link.download.endsWith('-320w.webp'))"),
            '每張結果應可個別下載，檔名帶寬度與 webp 副檔名');
        const afterFirst = await inspect(a);
        check(afterFirst.nodes === 2, `兩個分頁都應處理到圖片（實際 ${afterFirst.nodes} 個節點）`);
        check(afterFirst.badSize === 0 && afterFirst.types.join() === 'image/webp', `輸出應為 320×240 WebP：${JSON.stringify(afterFirst)}`);
        check(afterFirst.unreferenced === 0 && afterFirst.missing === 0 && afterFirst.outputs === 8, `輸出與任務結果應一一對應：${JSON.stringify(afterFirst)}`);

        // 中斷與全部關閉：A 停止處理並建立第二批，B 處理到一半時關閉，A 也關閉
        check(await click(a, '[data-action="leave"]'), '應能停止處理');
        await waitFor(a.page, "document.querySelector('[data-joined=\"false\"]') !== null", 5000);
        const firstRun = first.run;
        check(await click(a, '[data-action="run"]'), '應能建立第二個批次');
        await waitFor(a.page, `document.querySelector('[data-run]') && document.querySelector('[data-run]').dataset.run !== ${JSON.stringify(firstRun)}`, 5000);
        check(await waitFor(b.page, `[...document.querySelectorAll('[data-task-id]')].some((r) => r.dataset.status === 'completed') && document.querySelector('[data-run]')?.dataset.run !== ${JSON.stringify(firstRun)}`, 15000),
            '第二個批次應開始由 B 處理');
        await close(b);
        await close(a);

        const c = await open();
        const resumed = await runState(c);
        check(!resumed.finished, `所有分頁關閉後重新開啟，第二個批次應仍未完成：${JSON.stringify(resumed)}`);
        await join(c);
        check(await waitFor(c.page, "document.querySelector('[data-run-finished=\"true\"]') !== null", 60000), '重新加入後第二個批次應處理完');
        const second = await runState(c);
        check(second.statuses.filter((s) => s === 'completed').length === 8 && second.statuses.filter((s) => s === 'failed').length === 1,
            `恢復後應完成 8 張、失敗 1 張：${second.statuses.join(',')}`);
        check(await c.page.evaluate("document.querySelectorAll('[data-history-run]').length") === 2, '批次紀錄應有兩筆可比較');
        const afterSecond = await inspect(c);
        check(afterSecond.completed === 16 && afterSecond.outputs === 16 && afterSecond.unreferenced === 0 && afterSecond.badSize === 0,
            `恢復後輸出應符合設定且沒有孤兒：${JSON.stringify(afterSecond)}`);

        // 重設
        check(await click(c, '[data-action="leave"]'), '重設前停止處理');
        check(await click(c, '[data-action="reset"]'), '應能重設');
        check(await waitFor(c.page, "document.querySelector('.farm-notice')?.textContent.includes('已清除')", 10000), '重設應成功');
        const cleared = await inspect(c);
        check(cleared.total === 0 && cleared.outputs === 0 && cleared.inputs === 0, `重設後應清空任務、輸入與輸出：${JSON.stringify(cleared)}`);
        check(await c.page.evaluate("document.querySelector('[data-run]') === null"), '重設後不應顯示批次');

        for (const tab of tabs) failures.push(...tab.tracker.take().map((p) => `Farm：${p}`));
    } catch (err) {
        failures.push(`Farm：測試中斷：${err.message.split('\n')[0]}`);
    } finally {
        for (const tab of [...tabs]) await tab.close();
    }
    console.log('  Farm 多分頁測試：多節點處理、輸出設定、失敗重試、中斷與全部關閉後恢復、孤兒輸出、重設');
    return failures;
}

async function checkOfflineShell(page, base, server) {
    await page.send('Network.setBypassServiceWorker', { bypass: false });
    try {
        await page.send('Page.navigate', { url: base });
        if (!await waitFor(page, '!!navigator.serviceWorker.controller && !!document.querySelector("page-home")')) {
            return 'Service Worker 未接管首頁';
        }
        // 先在線上開一次 Solutions，讓延遲載入的模組進入執行期快取
        await page.evaluate("location.hash = '#/solutions'");
        if (!await waitFor(page, '!!document.querySelector("page-solutions-index .solution-card")')) {
            return '線上開啟 #/solutions 失敗';
        }
        await sleep(300);
        await page.evaluate("location.hash = '#/'");
        await page.send('Network.clearBrowserCache');
        server.testOffline = true;
        await page.evaluate('window.__offlineBeforeReload = true');
        await page.send('Page.reload');
        const loaded = await waitFor(page, '!window.__offlineBeforeReload && !!navigator.serviceWorker.controller && !!document.querySelector("page-home")');
        if (!loaded) return '原始伺服器離線後，首頁未能從快取重啟';
        await page.evaluate("location.hash = '#/solutions'");
        const solutions = await waitFor(page, '!!document.querySelector("page-solutions-index .solution-card")');
        return solutions ? null : '離線時無法開啟已造訪過的 #/solutions';
    } finally {
        server.testOffline = false;
        await page.send('Network.setBypassServiceWorker', { bypass: true });
    }
}

async function main() {
    const servers = {
        '根目錄': await startServer('/'),
        '子路徑': await startServer(SUBPATH),
    };
    const realtime = await startRealtimeTestServer();
    const { page, openTab, close } = await launchChrome();
    // 被中斷（Ctrl+C、CI 逾時）時也要關掉 Chrome，避免留下孤兒程序
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => close().finally(() => realtime.close().finally(() => process.exit(130))));
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
                ...(await runCoordinationTests(openTab, base, realtime)),
                ...(await runSolutionsTests(openTab, base)),
                ...(await runPosTests(openTab, base)),
                ...(await runFarmTests(openTab, base)),
            ];
            const offlineServer = await startServer(prefix);
            try {
                const offlineBase = `http://127.0.0.1:${offlineServer.address().port}${prefix}`;
                const offlineFailure = await checkOfflineShell(page, offlineBase, offlineServer);
                if (offlineFailure) failures.push(`離線：${offlineFailure}`);
                else console.log('  離線冷重載：首頁與已造訪的 Solutions 完成渲染');
            } finally {
                offlineServer.close();
            }
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
        await realtime.close();
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
