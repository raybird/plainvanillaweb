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
    self.skipWaiting();
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

// 請求攔截：Stale-While-Revalidate 策略
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});

// --- 進階 PWA 特性 ---

// 背景同步：當網路恢復時執行
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-actions') {
        console.log('[Service Worker] Performing background sync for actions');
        // 在此可以調用 IndexedDB 中的待處理隊列
        // 由於 SW 不能直接調用 lib，通常透過 postMessage 或直接操作 IDB
    }
});

// 定期背景同步：週期性更新數據
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-cache') {
        console.log('[Service Worker] Performing periodic sync to update cache');
        event.waitUntil(
            // 範例：重新抓取首頁數據
            fetch('./').then(response => {
                if (response.ok) {
                    return caches.open(CACHE_NAME).then(cache => cache.put('./', response));
                }
            })
        );
    }
});
