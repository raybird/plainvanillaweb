const CACHE_NAME = 'vanilla-cache-v1';
const CORE_ASSETS = [
    './',
    './index.html',
    './index.css',
    './index.js',
    './app/App.js',
    './lib/base-component.js',
    './lib/base-service.js',
    './lib/store.js',
    './lib/html.js',
    './lib/idb-service.js',
    './lib/worker-service.js'
];

// 安裝階段：快取核心資產
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching core assets');
            return cache.addAll(CORE_ASSETS);
        })
    );
});

// 啟動階段：清理舊快取
self.addEventListener('activate', (event) => {
    event.waitUntil(
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
    );
});

// 請求攔截：Stale-While-Revalidate 策略
// 優先使用快取，同時背景更新快取
self.addEventListener('fetch', (event) => {
    // 忽略非 GET 請求或非本域請求
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // 如果網路請求成功，更新快取
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            });

            // 如果有快取，直接回傳快取（並在背景更新）；否則等待網路請求
            return cachedResponse || fetchPromise;
        })
    );
});
