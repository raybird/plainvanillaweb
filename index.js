import "./components/pages/Dashboard.js";
import { errorService } from "./lib/error-service.js";
import { networkMonitor } from "./lib/network-monitor.js"; // 引入 Network Monitor
import "./components/pages/WorkerDemo.js";
import "./components/Notification.js";
import "./components/pages/HomePage.js";
import "./components/pages/RepoSearch.js";
import { registerApp } from "./app/App.js";
import { registerRoute } from "./components/route/route.js";
import { connectivityService } from "./lib/connectivity-service.js";
import { appStore } from "./lib/store.js";

// 啟動網路監控
networkMonitor.enable();

registerRoute();
registerApp();

// 監聽連線狀態
connectivityService.addEventListener('change', (e) => {
    const status = e.detail.isOnline ? '🟢 已恢復連線' : '🔴 目前處於離線模式';
    appStore.state.notifications = [...appStore.state.notifications, status];
});

// PWA Service Worker 註冊與更新管理
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('[SW] Registered:', reg.scope);
                
                // 檢查是否有更新
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            appStore.state.notifications = [...appStore.state.notifications, "✨ 應用程式有新版本，請重新整理頁面以套用更新。"];
                        }
                    });
                });
            })
            .catch(err => console.error('[SW] Registration failed:', err));
    });
}
