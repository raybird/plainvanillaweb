import "./components/pages/Dashboard.js";
import { errorService } from "./lib/error-service.js";
import "./components/pages/WorkerDemo.js";
import "./components/Notification.js";
import "./components/pages/HomePage.js";
import "./components/pages/RepoSearch.js";
import { registerApp } from "./app/App.js";
import { registerRoute } from "./components/route/route.js";
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
