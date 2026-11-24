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
    const browser = await connect(wsUrl);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);

    const openTab = async () => {
        const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
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

/** 雙分頁協作測試：coordination-demo.html 載入檢查 + 真實雙分頁 MessageBus 與 Store 隔離/刪除/快照/並行更新 */
async function runCoordinationTests(openTab, base) {
    const failures = [];
    const check = (ok, message) => { if (!ok) failures.push(`雙分頁協作：${message}`); };

    // 1. 驗證 coordination-demo.html 可正常載入、可互動且無 console.error / 例外 / 4xx-5xx
    const demoTab = await openTab();
    const demoTracker = trackProblems(demoTab.page);
    try {
        await demoTab.page.send('Page.navigate', { url: new URL('coordination-demo.html', base).href });
        const ready = await waitFor(demoTab.page, "document.querySelector('#busTabId')?.textContent !== '-' && document.querySelector('#stateA')?.textContent?.includes('count')", 10000);
        check(ready, 'coordination-demo.html 未正常初始化');
        if (ready) {
            await demoTab.page.evaluate(`(() => {
                document.querySelector('#localCheck').checked = true;
                document.querySelector('#publishBtn').click();
                document.querySelector('#setABtn').click();
                document.querySelector('#startElectionBtn').click();
            })()`);
            const interacted = await waitFor(demoTab.page, "document.querySelector('#busLogs')?.textContent?.includes('local | ns=') && document.querySelector('#stateA')?.textContent?.includes('alpha') && document.querySelector('#leaderRole')?.textContent === 'leader'", 5000);
            check(interacted, 'coordination-demo.html 點擊 Publish / 寫入 Store / Start Election 未反映於畫面');
            if (interacted) {
                await demoTab.page.evaluate(`(() => {
                    document.querySelector('#rpcAddBtn').click();
                    document.querySelector('#rpcUnknownBtn').click();
                    document.querySelector('#releaseElectionBtn').click();
                })()`);
                const rpcChecked = await waitFor(demoTab.page, "document.querySelector('#rpcLogs')?.textContent?.includes('42') && document.querySelector('#rpcLogs')?.textContent?.includes('METHOD_NOT_FOUND') && document.querySelector('#leaderRole')?.textContent === 'idle'", 5000);
                check(rpcChecked, 'coordination-demo.html Phase 2 RPC / Release 控制未正常運作');
            }
        }
        failures.push(...demoTracker.take().map((p) => `coordination-demo.html：${p}`));
    } finally {
        await demoTab.close();
    }

    // 2. 開啟真實 Chrome 分頁測試跨上下文協作（Phase 1 + Phase 2）
    let tabA = null;
    let tabB = null;
    let tabC = null;
    try {
        tabA = await openTab();
        tabB = await openTab();
        const trackerA = trackProblems(tabA.page);
        const trackerB = trackProblems(tabB.page);
        let trackerC = null;
        const testPageUrl = new URL('tests/coordination-browser.html', base).href;
        await Promise.all([
            tabA.page.send('Page.navigate', { url: testPageUrl }),
            tabB.page.send('Page.navigate', { url: testPageUrl }),
        ]);
        const readyA = await waitFor(tabA.page, 'window.__COORD_READY__ === true', 10000);
        const readyB = await waitFor(tabB.page, 'window.__COORD_READY__ === true', 10000);
        check(readyA && readyB, 'tests/coordination-browser.html 未就緒');

        // 2.1 在真實瀏覽器驗證 import lib/coordination.js 不建立 BroadcastChannel 也不呼叫 navigator.locks.request
        const sideEffects = await tabA.page.evaluate(`(async () => {
            const OrigBC = window.BroadcastChannel;
            const locksProto = window.navigator?.locks ? Object.getPrototypeOf(window.navigator.locks) : null;
            const origRequest = locksProto?.request;
            let bcCount = 0;
            let lockCount = 0;
            window.BroadcastChannel = class extends OrigBC {
                constructor(...args) { bcCount++; super(...args); }
            };
            if (locksProto && origRequest) {
                locksProto.request = function (...args) {
                    lockCount++;
                    return origRequest.apply(this, args);
                };
            }
            try {
                await import('./lib/coordination.js?e2e_side_effect=1');
                return { bcCount, lockCount };
            } finally {
                window.BroadcastChannel = OrigBC;
                if (locksProto && origRequest) locksProto.request = origRequest;
            }
        })()`);
        check(sideEffects.bcCount === 0 && sideEffects.lockCount === 0,
            `import lib/coordination.js 應零副作用，實際 bc=${sideEffects.bcCount}, locks=${sideEffects.lockCount}`);

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

        failures.push(...trackerA.take().map((p) => `雙分頁 Tab A：${p}`));
        if (trackerC) failures.push(...trackerC.take().map((p) => `雙分頁 Tab C：${p}`));
    } finally {
        await tabA?.close();
        await tabB?.close();
        await tabC?.close();
    }

    console.log('  雙分頁協作測試：coordination-demo.html、無副作用載入、MessageBus、Store 隔離/並行、Web Locks 選舉接管、跨分頁 RPC');
    return failures;
}

async function main() {
    const servers = {
        '根目錄': await startServer('/'),
        '子路徑': await startServer(SUBPATH),
    };
    const { page, openTab, close } = await launchChrome();
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
                ...(await runCoordinationTests(openTab, base)),
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
