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

// 啟動網路監控
networkMonitor.enable();

// 將核心頁面組件改為靜態載入 (避免 GitHub Pages 下動態路徑解析錯誤)
import './components/pages/HomePage.js';
import './components/pages/Lab.js';

// 初始化國際化並啟動應用
async function bootstrap() {
    try {
        // 1. 基礎服務註冊與元件定義
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

                // 檢查是否有更新
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // 跨分頁防抖機制：利用 localStorage 確保 10 秒內只通知一次
                            const lastUpdateNotify = localStorage.getItem('sw-update-notified-at');
                            const now = Date.now();

                            if (!lastUpdateNotify || (now - parseInt(lastUpdateNotify)) > 10000) {
                                notificationService.info("✨ 應用程式有新版本，請重新整理頁面以套用更新。");
                                localStorage.setItem('sw-update-notified-at', now.toString());
                            }
                        }
                    });
                });
            })
            .catch(err => console.error('[SW] Registration failed:', err));
    });
}
