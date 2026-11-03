import { router } from "../../lib/router.js";
import { metaService } from "../../lib/meta-service.js";

/**
 * x-route 組件
 * 路徑比對規則見 lib/router.js 的 matchRoute。
 * 放在 x-switch 內時由 x-switch 決定是否啟用（設定 active 屬性）；單獨使用時自行比對目前路徑。
 * 比對到的路徑參數（例如 `:id`）可由 `route.params` 取得。
 */
export class RouteComponent extends HTMLElement {
  constructor() {
    super();
    this.style.display = "none";
    this.params = {};
    this.update = this.update.bind(this);
  }

  connectedCallback() {
    router.addEventListener("route-change", this.update);
    this.update();
  }

  disconnectedCallback() {
    router.removeEventListener("route-change", this.update);
  }

  async update() {
    // 在 x-switch 內時不自行判斷顯示邏輯，等待 x-switch 設置 active 屬性
    if (this.closest("x-switch")) return;

    const params = router.match(this.getAttribute("path") || "", {
      exact: this.hasAttribute("exact"),
    });
    if (!params) {
      this.style.display = "none";
      return;
    }

    this.params = params;
    await this._activate();
    this.dispatchEvent(new CustomEvent("match", { detail: { match: true, params } }));
  }

  static get observedAttributes() {
    return ["active"];
  }

  async attributeChangedCallback(name) {
    if (name !== "active") return;
    if (this.hasAttribute("active")) {
      await this._activate();
    } else {
      this.style.display = "none";
    }
  }

  /** 載入延遲模組、顯示路由內容並更新 Meta 資訊 */
  async _activate() {
    const modulePath = this.getAttribute("module");
    if (modulePath) {
      try {
        // 使用 document.baseURI 確保路徑相對於應用根目錄
        await import(new URL(modulePath, document.baseURI).href);
      } catch (err) {
        console.error(`[Route] Failed to load module: ${modulePath}`, err);
      }
    }

    this.style.display = "contents";

    // 更新 Meta 資訊 (SEO & A11y)
    const metaTitle = this.getAttribute("meta-title");
    const metaDesc = this.getAttribute("meta-desc");
    if (metaTitle || metaDesc) {
      metaService.update(metaTitle, metaDesc);
    }
  }
}
export const registerRoute = () =>
  customElements.define("x-route", RouteComponent);
