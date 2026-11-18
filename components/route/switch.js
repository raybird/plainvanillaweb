import { router } from "../../lib/router.js";

/**
 * x-switch 組件
 * 類似 React Router 的 <Switch>，確保同一時間只顯示第一個匹配的路由。
 * 支援 Auth Guard：帶 auth-required 的路由由 router.authGuard 決定能否進入，不通過時導向 router.loginPath
 */
export class SwitchComponent extends HTMLElement {
  constructor() {
    super();
    this.update = this.update.bind(this);
  }

  connectedCallback() {
    router.addEventListener("route-change", this.update);
    // 等待子元素掛載完成
    this._initialUpdate = setTimeout(this.update, 0);
  }

  disconnectedCallback() {
    router.removeEventListener("route-change", this.update);
    clearTimeout(this._initialUpdate);
  }

  update() {
    if (!this.isConnected) return;
    const routePath = router.currentRoutePath;
    const changed = this._routePath !== undefined && this._routePath !== routePath;
    this._routePath = routePath;
    if (!changed || this.parentElement?.closest("x-switch") || !document.startViewTransition
        || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this._performUpdate();
      return;
    }

    const transition = document.startViewTransition(() => {
      if (this.isConnected && router.currentRoutePath === routePath) this._performUpdate();
    });
    // 必須捕獲所有關聯的 Promise，防止瀏覽器在跳過動畫時拋出 Uncaught (in promise)
    transition.ready.catch(() => {});
    transition.updateCallbackDone.catch(() => {});
    transition.finished.catch(err => {
      if (err.name !== 'AbortError') {
        console.error('[ViewTransition] Route transition failed:', err);
      }
    });
  }

  _performUpdate() {
    // 只管理屬於自己的路由；巢狀 <x-switch>（例如 Lab 的 /lab/*）裡的路由由它自己決定
    const routes = Array.from(this.querySelectorAll("x-route")).filter(
      (route) => route.closest("x-switch") === this,
    );
    let activeRoute;
    let params;
    let redirect = false;
    for (const route of routes) {
      params = router.match(route.getAttribute("path") || "", { exact: route.hasAttribute("exact") });
      if (!params) continue;
      if (route.hasAttribute("auth-required") && !router.authGuard(route)) {
        redirect = true;
      } else {
        activeRoute = route;
      }
      break;
    }
    for (const route of routes) {
      if (route === activeRoute) continue;
      route.removeAttribute("active");
      route.style.display = "none";
    }
    if (redirect && router.currentRoutePath !== router.loginPath) {
      router.push(router.loginPath);
    } else if (activeRoute) {
      activeRoute.params = params;
      activeRoute.setAttribute("active", "");
    }
  }
}

customElements.define("x-switch", SwitchComponent);
