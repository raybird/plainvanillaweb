import { errorService } from "./lib/error-service.js";
import { networkMonitor } from "./lib/network-monitor.js";
import { prefetchService } from "./lib/prefetch-service.js";
import "./components/Notification.js"; // 通知組件保持全域載入
import { registerApp } from "./app/App.js";
import { registerRoute } from "./components/route/route.js";
import { connectivityService } from "./lib/connectivity-service.js";
import { appStore } from "./lib/store.js";
import { i18n } from "./lib/i18n-service.js";
import { notificationService } from "./lib/notification-service.js"; // 引入通知服務
import { router } from "./lib/router.js";
import { authService } from "./lib/auth-service.js";

// 啟動網路監控
networkMonitor.enable();

// 將核心頁面組件改為靜態載入 (避免 GitHub Pages 下動態路徑解析錯誤)
import './components/pages/HomePage.js';
import './components/pages/Lab.js';

// 初始化國際化並啟動應用
async function bootstrap() {
    try {
        // 1. 基礎服務註冊與元件定義；auth-required 路由以展示用的 authService 判斷是否已登入
        router.authGuard = () => authService.isAuthenticated;
        registerRoute();

        // 2. 初始化核心資源 (國際化)
        await i18n.init();

        // 3. 註冊根組件並啟動
        registerApp();

        console.log('[Bootstrap] Application started successfully.');
    } catch (err) {
        console.error('[Bootstrap] App initialization failed:', err);
        // Fallback: 即使 i18n 失敗也要嘗試顯示 UI
        registerApp();
    }
}

bootstrap();

// 監聽連線狀態
connectivityService.on('status-change', (data) => {
    if (data.online) {
        notificationService.success('🟢 已恢復連線');
    } else {
        notificationService.error('🔴 目前處於離線模式');
    }
});

// PWA Service Worker 註冊與更新管理
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('[SW] Registered:', reg.scope);

                // SW 採網路優先：上線時這次載入的已是最新檔案，新版 SW 只是更新離線快取，不需要請使用者重新整理
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'activated') {
                            console.log('[SW] Offline cache updated');
                        }
                    });
                });
            })
            .catch(err => console.error('[SW] Registration failed:', err));
    });
}
