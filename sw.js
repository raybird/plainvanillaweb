const CACHE_NAME = 'vanilla-cache-78155a76c3e4';
const CORE_ASSETS = [
    './',
    './index.html',
    './index.css',
    './index.js',
    './app/App.js',
    './lib/base-component.js',
    './lib/morph.js',
    './lib/base-service.js',
    './lib/store.js',
    './lib/html.js',
    './lib/idb-service.js',
    './lib/worker-service.js',
    './lib/lucide.min.js',
    './assets/locales/zh-TW.json',
    './assets/locales/en-US.json'
];

// 安裝階段：快取核心資產（供離線使用；上線時一律走網路）
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
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
                        if (key !== CACHE_NAME) {
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
// 全部檔案都走網路，確保同一次載入拿到的 HTML 與 JS 屬於同一版，不會新舊混用
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
    const { request } = event;
    try {
        // no-cache：一律向伺服器驗證（檔案沒變時只回 304），不讓 HTTP 快取裡的舊檔混進來
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
    } catch (err) {
        // ignoreSearch：讓帶 query 的網址（例如 Share Target）離線時也能命中快取
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // 採 hash 路由，任何頁面導覽都可以回退到 index.html
        if (request.mode === 'navigate') {
            const shell = await caches.match('./index.html');
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
                    return caches.open(CACHE_NAME).then(cache => cache.put('./', response));
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
        const cache = await caches.open(CACHE_NAME);
        const records = await bgFetch.matchAll();

        const promises = records.map(async (record) => {
            const response = await record.responseReady;
            await cache.put(record.request, response);
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
        const url = './#/lab/pwa-advanced'; // 跳轉至相關實驗室頁面
        const clients = await self.clients.matchAll({ type: 'window' });
        
        for (const client of clients) {
            if (client.url.includes(url) && 'focus' in client) {
                return client.focus();
            }
        }
        
        if (self.clients.openWindow) {
            return self.clients.openWindow(url);
        }
    }());
});
