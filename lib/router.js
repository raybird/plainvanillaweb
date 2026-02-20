import { BaseService } from "./base-service.js";

export class RouterService extends BaseService {
  constructor() {
    super();
    window.addEventListener("hashchange", () => this.handleHashChange());
  }

  get currentPath() {
    return window.location.hash.slice(1) || "/";
  }

  get currentRoutePath() {
    const path = this.currentPath;
    const queryIndex = path.indexOf("?");
    return queryIndex === -1 ? path : path.slice(0, queryIndex);
  }

  push(path) {
    window.location.hash = path;
  }

  handleHashChange() {
    this.emit("route-change", { path: this.currentPath });
  }
}
export const router = new RouterService();
