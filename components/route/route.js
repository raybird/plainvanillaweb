import { router } from "../../lib/router.js";
import { metaService } from "../../lib/meta-service.js";

/** 已載入完成的延遲模組（解析後的絕對網址），用來在模組已就緒時同步顯示內容 */
const loadedModules = new Set();

/**
 * x-route 組件
 * 路徑比對規則見 lib/router.js 的 matchRoute。
 * 放在 x-switch 內時由 x-switch 決定是否啟用（設定 active 屬性）；單獨使用時自行比對目前路徑。
 * 比對到的路徑參數（例如 `:id`）可由 `route.params` 取得。
 *
 * 內容有兩種寫法（ADR 0102）：
 * - `<x-route path="/a"><template><page-a></page-a></template></x-route>`：內容只在路由啟用時建立，
 *   停用時移除。頁面在進入時收到 connectedCallback、離開時收到 disconnectedCallback，
 *   停留在同一個路由內換網址（例如 /docs/a → /docs/b）時不會重建。
 * - `<x-route path="/a"><page-a></page-a></x-route>`：內容一直留在 DOM 中，停用時只隱藏（3.0.0 以前的行為）。
 */
export class RouteComponent extends HTMLElement {
  constructor() {
    super();
    this.style.display = "none";
    this.params = {};
    this.update = this.update.bind(this);
    /** @type {Node[]} 由 <template> 建立、目前顯示中的節點 */
    this._stamped = [];
    /** 每次啟用／停用遞增，讓等待模組載入的舊啟用作廢 */
    this._generation = 0;
  }

  connectedCallback() {
    router.addEventListener("route-change", this.update);
    this.update();
  }

  disconnectedCallback() {
    router.removeEventListener("route-change", this.update);
  }

  /** 第一個直接子元素 <template>；沒有時為舊寫法 */
  get template() {
    return this.querySelector(":scope > template");
  }

  async update() {
    // 在 x-switch 內時不自行判斷顯示邏輯，等待 x-switch 設置 active 屬性
    if (this.closest("x-switch")) return;

    const params = router.match(this.getAttribute("path") || "", {
      exact: this.hasAttribute("exact"),
    });
    if (!params) {
      this._deactivate();
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
      this._deactivate();
    }
  }

  /**
   * 載入延遲模組、顯示路由內容並更新 Meta 資訊。
   * 已啟用時再次呼叫不會重建內容（x-switch 每次換頁都會重設 active）。
   */
  async _activate() {
    const generation = ++this._generation;
    const modulePath = this.getAttribute("module");
    if (modulePath) {
      // 使用 document.baseURI 確保路徑相對於應用根目錄
      const url = new URL(modulePath, document.baseURI).href;
      // 模組已載入時不 await，讓內容在 View Transition 的更新回呼內同步出現
      if (!loadedModules.has(url)) {
        try {
          await import(url);
          loadedModules.add(url);
        } catch (err) {
          console.error(`[Route] Failed to load module: ${modulePath}`, err);
        }
        // 等待期間路由已被停用或重新啟用，由較新的那次處理
        if (generation !== this._generation) return;
      }
    }

    this._stamp();
    this.style.display = "contents";

    // 更新 Meta 資訊 (SEO & A11y)
    const metaTitle = this.getAttribute("meta-title");
    const metaDesc = this.getAttribute("meta-desc");
    if (metaTitle || metaDesc) {
      metaService.update(metaTitle, metaDesc);
    }
  }

  _deactivate() {
    this._generation++;
    this.style.display = "none";
    // 移除內容，頁面因此收到 disconnectedCallback（釋放相機、計時器等）
    for (const node of this._stamped) node.remove();
    this._stamped = [];
  }

  /** 以 <template> 建立內容；已建立或舊寫法時不做事 */
  _stamp() {
    const template = this.template;
    if (!template || this._stamped.length) return;
    const fragment = document.importNode(template.content, true);
    this._stamped = [...fragment.childNodes];
    this.append(fragment);
  }
}
export const registerRoute = () =>
  customElements.define("x-route", RouteComponent);
