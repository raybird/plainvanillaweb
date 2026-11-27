import { html } from "../../lib/html.js";
import { BaseComponent } from "../../lib/base-component.js";
import { router } from "../../lib/router.js";
import { isKioskMode } from "../../app/kiosk.js";

/**
 * SolutionsPage - Solutions 佈局容器（ADR 0108）
 * 負責 /solutions/* 巢狀路由；各 reference app 由自己的 <x-route module> 延遲載入（ADR 0102）。
 * kiosk 版面（`?kiosk=1`）下不顯示標頭，角色畫面佔滿視窗。
 */
export class SolutionsPage extends BaseComponent {
  connectedCallback() {
    super.connectedCallback();
    // /solutions/* 之間換頁或切換 kiosk 時不會重建本元件，標頭要自己更新；
    // 重繪時 <x-switch data-persistent> 原樣保留，不會重建子頁面。
    this._offRoute = router.on("route-change", () => this.scheduleUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._offRoute?.();
  }

  render() {
    const kiosk = isKioskMode(window.location.hash);
    return html`
      <style>
        .solutions-header {
          margin-bottom: 2rem;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 1rem;
        }
        .solutions-content {
          max-width: 1200px;
        }
      </style>

      ${kiosk ? "" : html`
        <div class="solutions-header">
          <h1>🧱 Native Web Solutions</h1>
          <p>Labs 解釋單一 API；Solutions 把多個原生能力組成可重複使用的完整應用與工作流程。</p>
        </div>
      `}

      <div class="solutions-content">
        <x-switch data-persistent="solutions-routes">
          <x-route path="/solutions" exact module="./components/pages/solutions/SolutionsIndex.js"><template><page-solutions-index></page-solutions-index></template></x-route>
          <x-route path="/solutions/" exact module="./components/pages/solutions/SolutionsIndex.js"><template><page-solutions-index></page-solutions-index></template></x-route>
          <x-route path="/solutions/pos" exact module="./components/pages/solutions/pos/PosHubPage.js"><template><page-pos-hub></page-pos-hub></template></x-route>
          <x-route path="/solutions/pos/order" exact module="./components/pages/solutions/pos/PosOrderPage.js"><template><page-pos-order></page-pos-order></template></x-route>
          <x-route path="/solutions/pos/kitchen" exact module="./components/pages/solutions/pos/PosKitchenPage.js"><template><page-pos-kitchen></page-pos-kitchen></template></x-route>
          <x-route path="/solutions/pos/display" exact module="./components/pages/solutions/pos/PosDisplayPage.js"><template><page-pos-display></page-pos-display></template></x-route>
          <x-route path="/solutions/pos/admin" exact module="./components/pages/solutions/pos/PosAdminPage.js"><template><page-pos-admin></page-pos-admin></template></x-route>
          <x-route path="/solutions/pos-v2/admin" exact module="./components/pages/solutions/pos-v2/PosV2AdminPage.js"><template><page-pos-v2-admin></page-pos-v2-admin></template></x-route>
          <x-route path="/solutions/pos-v2/join" exact module="./components/pages/solutions/pos-v2/PosV2JoinPage.js"><template><page-pos-v2-join></page-pos-v2-join></template></x-route>
          <x-route path="/solutions/pos-v2/order" exact module="./components/pages/solutions/pos-v2/PosV2StaffPages.js"><template><page-pos-v2-order></page-pos-v2-order></template></x-route>
          <x-route path="/solutions/pos-v2/kitchen" exact module="./components/pages/solutions/pos-v2/PosV2StaffPages.js"><template><page-pos-v2-kitchen></page-pos-v2-kitchen></template></x-route>
          <x-route path="/solutions/pos-v2/display" exact module="./components/pages/solutions/pos-v2/PosV2StaffPages.js"><template><page-pos-v2-display></page-pos-v2-display></template></x-route>
          <x-route path="/solutions/farm" exact module="./components/pages/solutions/farm/FarmPage.js"><template><page-solution-farm></page-solution-farm></template></x-route>
          <x-route path="/solutions/*"><template><h2>404</h2><p>找不到這個 Solution。<a href="#/solutions">回到 Solutions</a></p></template></x-route>
        </x-switch>
      </div>
    `;
  }
}

customElements.define("page-solutions", SolutionsPage);
