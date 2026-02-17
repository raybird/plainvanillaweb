import "./components/pages/Dashboard.js";
import { errorService } from "./lib/error-service.js";
import { networkMonitor } from "./lib/network-monitor.js"; // 引入 Network Monitor
import "./components/pages/WorkerDemo.js";
import "./components/Notification.js";
import "./components/pages/HomePage.js";
import "./components/pages/RepoSearch.js";
import { registerApp } from "./app/App.js";
import { registerRoute } from "./components/route/route.js";

// 啟動網路監控
networkMonitor.enable();

registerRoute();
registerApp();

// PWA Service Worker 註冊
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[SW] Registered:', reg.scope))
            .catch(err => console.error('[SW] Registration failed:', err));
    });
}
