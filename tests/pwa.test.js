import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = (file) => readFileSync(new URL(file, root), 'utf8');
function basicResponse(body, options) {
    const response = new Response(body, options);
    function markBasic(value) {
        Object.defineProperty(value, 'type', { value: 'basic' });
        const clone = value.clone.bind(value);
        value.clone = () => markBasic(clone());
        return value;
    }
    return markBasic(response);
}

function serviceWorker(scope = 'https://example.test/plainvanillaweb/') {
    const listeners = new Map();
    const stores = new Map();
    const absolute = (input) => new URL(typeof input === 'string' ? input : input.url, scope).href;
    class Cache {
        entries = new Map();
        async addAll(requests) {
            for (const request of requests) this.entries.set(absolute(request), new Response('precache'));
        }
        async put(request, response) { this.entries.set(absolute(request), response); }
        async match(request, options = {}) {
            const url = absolute(request);
            for (const [key, response] of this.entries) {
                if (key === url || (options.ignoreSearch && key.split('?')[0] === url.split('?')[0])) return response.clone();
            }
        }
        async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
        async delete(request) { return this.entries.delete(absolute(request)); }
    }
    const caches = {
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Cache());
            return stores.get(name);
        },
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); },
        async match(request, options) {
            for (const cache of stores.values()) {
                const response = await cache.match(request, options);
                if (response) return response;
            }
        }
    };
    let fetcher = async () => { throw new TypeError('offline'); };
    const self = {
        registration: { scope }, location: new URL(scope),
        clients: { claim: async () => {}, matchAll: async () => [] },
        skipWaiting() {}, addEventListener: (type, handler) => listeners.set(type, handler)
    };
    vm.runInNewContext(source('sw.js'), {
        self, caches, URL, console: { log() {}, error() {} },
        Request: class extends Request { constructor(input, options) { super(absolute(input), options); } },
        fetch: (...args) => fetcher(...args)
    });
    async function dispatch(type, props = {}) {
        const pending = [];
        let response;
        listeners.get(type)({ ...props, waitUntil: promise => pending.push(promise), respondWith: promise => { response = promise; } });
        const result = response ? await response : undefined;
        await Promise.all(pending);
        return result;
    }
    return { scope, stores, caches, dispatch, setFetch: fn => { fetcher = fn; } };
}

test('SW activation preserves other apps and deployment scopes', async () => {
    const sw = serviceWorker();
    await sw.dispatch('install');
    const own = [...sw.stores.keys()][0];
    const other = serviceWorker('https://example.test/other/');
    await other.dispatch('install');
    const otherName = [...other.stores.keys()][0];
    assert.notEqual(own, otherName, 'each deployment scope needs its own cache');
    await sw.caches.open(otherName);
    await sw.caches.open('other-application-cache');
    await sw.caches.open('vanilla-cache-legacy');
    const obsolete = own.replace(/vanilla-cache-[a-f0-9]+/, 'vanilla-cache-obsolete');
    await sw.caches.open(obsolete);
    await sw.dispatch('activate');
    assert(sw.stores.has(otherName));
    assert(sw.stores.has('other-application-cache'));
    assert(sw.stores.has('vanilla-cache-legacy'), 'unscoped legacy caches have ambiguous ownership');
    assert(!sw.stores.has(obsolete), 'remove only this deployment’s obsolete cache');
});

test('cold offline install contains the complete static application module graph', async () => {
    const sw = serviceWorker();
    await sw.dispatch('install');
    const cache = [...sw.stores.values()][0];
    const seen = new Set();
    function visit(file) {
        if (seen.has(file)) return;
        seen.add(file);
        const imports = source(file).matchAll(/\bimport\s+(?:[^;'"]*?\s+from\s*)?['"]([^'"]+)['"]/g);
        for (const [, specifier] of imports) {
            if (specifier.startsWith('.')) visit(new URL(specifier, new URL(file, root)).href.slice(root.href.length));
        }
    }
    visit('index.js');
    for (const file of seen) assert(await cache.match(file), `missing startup module: ${file}`);
    for (const file of ['manifest.json', 'assets/favicon.svg']) {
        assert(await cache.match(file), `missing offline document resource: ${file}`);
    }
    const version = source('index.html').match(/index\.js\?v=([^"']+)/)[1];
    assert(await cache.match(`index.js?v=${version}`), 'HTML’s exact versioned entry module must work offline');
});

test('offline requests keep exact query semantics and never read another cache', async () => {
    const sw = serviceWorker();
    await sw.dispatch('install');
    const own = [...sw.stores.values()][0];
    await own.put('assets/items.json?filter=one', new Response('one'));
    const other = await sw.caches.open('unrelated');
    await other.put('assets/only-other.json', new Response('foreign'));
    const request = (url, mode = 'cors') => ({ url: new URL(url, sw.scope).href, method: 'GET', mode });
    await assert.rejects(sw.dispatch('fetch', { request: request('assets/items.json?filter=two') }), /offline/);
    await assert.rejects(sw.dispatch('fetch', { request: request('assets/only-other.json') }), /offline/);
    const shell = await sw.dispatch('fetch', { request: request('./?share_text=hello', 'navigate') });
    assert.equal(await shell.text(), 'precache');
});

test('runtime caching excludes API/private responses and requests outside the app scope', async () => {
    const sw = serviceWorker();
    await sw.dispatch('install');
    let fetches = 0;
    sw.setFetch(async () => {
        fetches++;
        return basicResponse('network');
    });
    const cache = [...sw.stores.values()][0];
    await sw.dispatch('fetch', { request: { url: `${sw.scope}api/private`, method: 'GET', mode: 'cors' } });
    assert.equal(await cache.match('api/private'), undefined);
    await sw.dispatch('fetch', { request: { url: 'https://example.test/other/index.js', method: 'GET', mode: 'cors' } });
    assert.equal(fetches, 1, 'out-of-scope request must not be intercepted');
});

test('runtime cache is bounded without evicting the offline shell or retaining private assets', async () => {
    const sw = serviceWorker();
    await sw.dispatch('install');
    sw.setFetch(async request => {
        const headers = request.url.includes('private') ? { 'Cache-Control': 'private, max-age=600' } : {};
        return basicResponse('network', { headers });
    });
    const request = path => ({ url: `${sw.scope}${path}`, method: 'GET', mode: 'cors' });
    const cache = [...sw.stores.values()][0];
    const initialSize = cache.entries.size;
    await sw.dispatch('fetch', { request: request('assets/private.json') });
    assert.equal(await cache.match('assets/private.json'), undefined);
    for (let index = 0; index < 100; index++) await sw.dispatch('fetch', { request: request(`assets/image-${index}.svg`) });
    assert(cache.entries.size <= initialSize + 80, 'runtime entries must be capped');
    assert(await cache.match('index.html'), 'precache entries must survive runtime eviction');
    assert(await cache.match('assets/image-99.svg'), 'recent public static response should be cached');
});

function pwaService(registration, hasServiceWorker = true) {
    const window = { addEventListener() {} };
    const navigator = hasServiceWorker ? { serviceWorker: { ready: Promise.resolve(registration), addEventListener() {} } } : {};
    const context = vm.createContext({ window, navigator, EventTarget, Event, CustomEvent, console });
    vm.runInContext(source('lib/base-service.js').replace('export class', 'class') + '\n' + source('lib/pwa-service.js')
        .replace(/^import .*;\n/, '').replace('export class', 'class').replace('export const', 'const') + '\nglobalThis.service = pwaService;', context);
    return context.service;
}

test('Background Fetch uses the registration capability without a window property', async () => {
    const fetchRegistration = new EventTarget();
    fetchRegistration.downloaded = 3;
    fetchRegistration.downloadTotal = 0;
    const manager = { fetch: async () => fetchRegistration, get: async id => id, getIds: async () => ['download'] };
    const service = pwaService({ backgroundFetch: manager });
    assert.equal(await service.fetch('download', ['index.js']), fetchRegistration);
    assert.equal(await service.getFetch('download'), 'download');
    assert.deepEqual(await service.getFetchIds(), ['download']);
    let percent;
    service.on('fetch-progress', detail => { percent = detail.percent; });
    fetchRegistration.dispatchEvent(new Event('progress'));
    assert.equal(percent, 0, 'unknown totals must not report Infinity');
});

test('all Background Fetch operations explain an unsupported capability', async () => {
    for (const service of [pwaService({}), pwaService({}, false)]) {
        for (const operation of [() => service.fetch('x', []), () => service.getFetch('x'), () => service.getFetchIds()]) {
            await assert.rejects(operation(), /不支援 Background Fetch/);
        }
    }
});
