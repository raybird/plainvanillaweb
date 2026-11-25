const CACHE_NAME = 'vanilla-cache-d75229c9fe47';
// CacheStorage is shared by every application on this origin, including other Pages projects.
const CACHE_PREFIX = `plainvanillaweb:${self.registration.scope}:`;
const SCOPED_CACHE_NAME = `${CACHE_PREFIX}${CACHE_NAME}`;
const MAX_RUNTIME_ENTRIES = 80;
const CORE_ASSETS = [
    './',
    './index.html',
    './index.css',
    './manifest.json',
    './assets/favicon.svg',
    './index.js',
    `./index.js?v=${CACHE_NAME.slice('vanilla-cache-'.length)}`,
    './app/App.js',
    './app/kiosk.js',
    './components/AppFooter.js',
    './components/Modal.js',
    './components/Notification.js',
    './components/pages/HomePage.js',
    './components/pages/Lab.js',
    './components/route/route.js',
    './components/route/switch.js',
    './lib/auth-service.js',
    './lib/base-component.js',
    './lib/morph.js',
    './lib/base-service.js',
    './lib/broadcast-channel.js',
    './lib/broadcast-service.js',
    './lib/connectivity-service.js',
    './lib/error-service.js',
    './lib/i18n-service.js',
    './lib/meta-service.js',
    './lib/modal-service.js',
    './lib/network-monitor.js',
    './lib/notification-service.js',
    './lib/prefetch-service.js',
    './lib/router.js',
    './lib/store.js',
    './lib/theme-service.js',
    './lib/html.js',
    './lib/idb-service.js',
    './lib/worker-service.js',
    './workers/compute.worker.js',
    './lib/lucide.min.js',
    './assets/locales/zh-TW.json',
    './assets/locales/en-US.json'
];
const CORE_URLS = new Set(CORE_ASSETS.map(url => new URL(url, self.registration.scope).href));

function isInScope(url) {
    const scope = new URL(self.registration.scope);
    return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
}

function isCacheableAsset(url) {
    if (!isInScope(url)) return false;
    if (CORE_URLS.has(url.href)) return true;
    if (url.search) return false;
    const relativePath = url.pathname.slice(new URL(self.registration.scope).pathname.length);
    return /^(?:app|components|lib|workers)\/.*\.js$/.test(relativePath)
        || /^assets\/.*\.(?:json|svg|png|jpe?g|webp|avif|gif|ico|woff2?|wasm)$/.test(relativePath)
        || /^docs\/.*\.md$/.test(relativePath);
}

// Serialize writes so concurrent downloads cannot race the eviction limit.
let cacheWrite = Promise.resolve();
function cacheResponse(request, response, { keepResponse = false } = {}) {
    const url = new URL(typeof request === 'string' ? request : request.url, self.registration.scope);
    if (!isCacheableAsset(url) || response.status !== 200 || response.type !== 'basic'
        || /(?:^|,)\s*(?:private|no-store)\b/i.test(response.headers.get('Cache-Control') || '')) {
        return Promise.resolve();
    }
    const copy = keepResponse ? response.clone() : response;
    cacheWrite = cacheWrite.catch(() => {}).then(async () => {
        const cache = await caches.open(SCOPED_CACHE_NAME);
        await cache.put(request, copy);
        const runtimeKeys = (await cache.keys()).filter(key => !CORE_URLS.has(key.url));
        for (const key of runtimeKeys.slice(0, Math.max(0, runtimeKeys.length - MAX_RUNTIME_ENTRIES))) {
            await cache.delete(key);
        }
    });
    return cacheWrite;
}

// 安裝階段：快取核心資產（供離線使用；上線時一律走網路）
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(SCOPED_CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching core assets');
            // cache: 'reload' 略過 HTTP 快取，避免把 CDN 上仍在有效期內的舊檔放進新版快取
            return cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
        })
    );
});

// 啟動階段：清理舊快取
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.map((key) => {
                        // Unscoped legacy names have ambiguous ownership: leave them untouched.
                        if (key.startsWith(CACHE_PREFIX) && key !== SCOPED_CACHE_NAME) {
                            console.log('[Service Worker] Removing old cache', key);
                            return caches.delete(key);
                        }
                    })
                );
            })
        ])
    );
});

// 請求攔截：網路優先策略，離線時才回退到快取
// 模組 URL 並非 immutable content hashes，連線時驗證新鮮度；不宣稱部署中途具備原子版本切換。
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !isInScope(new URL(event.request.url))) {
        return;
    }

    event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
    const { request } = event;
    try {
        // no-cache：一律向伺服器驗證（檔案沒變時只回 304），不讓 HTTP 快取裡的舊檔混進來
        const response = await fetch(request, { cache: 'no-cache' });
        // Only public app assets are persisted; API responses and query variants stay on the network.
        event.waitUntil(cacheResponse(request, response, { keepResponse: true }));
        return response;
    } catch (err) {
        const cache = await caches.open(SCOPED_CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        // 採 hash 路由，任何頁面導覽都可以回退到 index.html
        if (request.mode === 'navigate') {
            const shell = await cache.match(new URL('./index.html', self.registration.scope).href);
            if (shell) return shell;
        }
        throw err;
    }
}

// --- 進階 PWA 特性 ---

// 背景同步：當網路恢復時執行
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-actions') {
        console.log('[Service Worker] Performing background sync for actions');
        // 在此可以調用 IndexedDB 中的待處理隊列
    }
});

// 定期背景同步：週期性更新數據
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-cache') {
        console.log('[Service Worker] Performing periodic sync to update cache');
        event.waitUntil(
            fetch('./').then(response => {
                if (response.ok) {
                    return cacheResponse(new URL('./', self.registration.scope).href, response);
                }
            })
        );
    }
});

// --- Background Fetch 處理 ---

self.addEventListener('backgroundfetchsuccess', (event) => {
    const bgFetch = event.registration;
    console.log('[Service Worker] Background Fetch Success:', bgFetch.id);

    event.waitUntil(async function() {
        const records = await bgFetch.matchAll();

        const promises = records.map(async (record) => {
            const response = await record.responseReady;
            await cacheResponse(record.request, response);
        });

        await Promise.all(promises);
        
        // 更新 UI 狀態 (透過 BroadcastChannel 或向所有 Client 發送訊息)
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'BACKGROUND_FETCH_SUCCESS',
                id: bgFetch.id
            });
        });
    }());
});

self.addEventListener('backgroundfetchfail', (event) => {
    console.error('[Service Worker] Background Fetch Failed:', event.registration.id);
});

self.addEventListener('backgroundfetchclick', (event) => {
    const bgFetch = event.registration;
    console.log('[Service Worker] Background Fetch Clicked:', bgFetch.id);

    event.waitUntil(async function() {
        // 跳轉至相關實驗室頁面；client.url 是絕對網址，比對前先以 SW 的 scope 解析
        const url = new URL('./#/lab/pwa-advanced', self.registration.scope).href;
        const clients = await self.clients.matchAll({ type: 'window' });

        for (const client of clients) {
            if (client.url === url && 'focus' in client) {
                return client.focus();
            }
        }
        
        if (self.clients.openWindow) {
            return self.clients.openWindow(url);
        }
    }());
});
