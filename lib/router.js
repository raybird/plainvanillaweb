import { BaseService } from "./base-service.js";

const compiled = new Map();

/**
 * 判斷路由樣式是否符合路徑（不含 query string）。
 *
 * 語法：
 *   - `*`        符合所有路徑
 *   - `:name`    符合一個路徑段，值會出現在回傳的參數物件
 *   - 結尾 `/*`  符合該前綴本身與其底下的任何路徑（例如 `/lab/*` 符合 `/lab`、`/lab/x/y`）
 *
 * `exact` 時必須完全相符；否則以路徑段為界做前綴比對：`/lab` 符合 `/lab/x`，但不符合 `/labx`。
 * 比對不分大小寫。
 *
 * 之後 URLPattern 成為 Baseline 廣泛可用時，可改由它實作，呼叫端不需要變動。
 *
 * @param {string} pattern 路由樣式，例如 `/lab/:id`
 * @param {string} path 目前路徑，例如 `/lab/webgpu`
 * @param {{ exact?: boolean }} [options]
 * @returns {Record<string, string> | null} 符合時回傳參數物件（沒有參數時為 `{}`），否則 `null`
 */
export function matchRoute(pattern, path, { exact = false } = {}) {
  if (pattern === "*") return {};

  const key = `${exact ? "=" : "~"}${pattern}`;
  if (!compiled.has(key)) compiled.set(key, compile(pattern, exact));
  const { regex, names } = compiled.get(key);

  const match = regex.exec(path);
  if (!match) return null;
  return Object.fromEntries(names.map((name, i) => [name, safeDecode(match[i + 1])]));
}

function compile(pattern, exact) {
  const wildcard = pattern.endsWith("/*");
  const body = wildcard ? pattern.slice(0, -2) : pattern;
  const names = [];
  const source = body
    .split(/(:[^\s/]+)/)
    .map((part) => {
      if (part.startsWith(":")) {
        names.push(part.slice(1));
        return "([^/]+)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  // 前綴比對以路徑段為界；樣式本身以 / 結尾時（例如 "/"），後面可接任何字元
  const prefixTail = body.endsWith("/") ? ".*" : "(?:/.*)?";
  const tail = wildcard || !exact ? prefixTail : "";
  return { regex: new RegExp(`^${source}${tail}$`, "i"), names };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export class RouterService extends BaseService {
  /**
   * 路由守衛：<x-switch> 遇到帶 auth-required 的路由時呼叫，回傳 false 就導向 loginPath。
   * 預設一律放行；應用程式在啟動時設定，例如 `router.authGuard = () => authService.isAuthenticated`。
   * @type {(route: HTMLElement) => boolean}
   */
  authGuard = () => true;
  loginPath = "/login";

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

  /**
   * 以目前路徑比對路由樣式，規則見 matchRoute
   * @param {string} pattern
   * @param {{ exact?: boolean }} [options]
   */
  match(pattern, options) {
    return matchRoute(pattern, this.currentRoutePath, options);
  }

  push(path) {
    window.location.hash = path;
  }

  handleHashChange() {
    this.emit("route-change", { path: this.currentPath });
  }
}
export const router = new RouterService();
