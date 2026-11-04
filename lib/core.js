/**
 * Plain Vanilla 核心入口：只匯出可單獨使用的基礎建設，不會載入任何展示用 service。
 *
 *   import { BaseComponent, html, router } from './lib/core.js';
 *
 * 包含：安全模板（html）、元件基底與 DOM morphing、服務基底、全域 Store、
 * hash 路由（matchRoute、<x-route>、<x-switch>）與 i18n。
 * 需要全部 service（WebGPU、WebRTC、WebAuthn…）時改用 ./vanilla-sdk.js。
 *
 * 匯出清單是公開 API：增減或改名要更新 tests/core.test.js 並依語意化版本升版（見 CHANGELOG.md）。
 *
 * 引入本檔的副作用：定義 <x-switch>、建立 router／appStore／i18n 單例。
 * <x-route> 需呼叫 registerRoute() 才會定義；需要登入的路由請設定 router.authGuard。
 */
export { VERSION } from './version.js';
export { html, unsafe, escapeHTML } from './html.js';
export { BaseComponent } from './base-component.js';
export { morph } from './morph.js';
export { BaseService } from './base-service.js';
export { Store, appStore } from './store.js';
export { broadcastService } from './broadcast-service.js';
export { i18n, I18nService } from './i18n-service.js';
export { metaService } from './meta-service.js';
export { router, RouterService, matchRoute } from './router.js';
export { RouteComponent, registerRoute } from '../components/route/route.js';
export { SwitchComponent } from '../components/route/switch.js';
