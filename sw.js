const CACHE_NAME = 'vanilla-cache-v6';
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
    './lib/worker-service.js',
    './assets/locales/zh-TW.json',
    './assets/locales/en-US.json'
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
