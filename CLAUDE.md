# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ 最重要規則

**Git commit 訊息絕對不可包含 `Co-Authored-By: Claude` 或任何 AI 署名資訊。** 只寫功能描述，不附加任何尾行。


## What this is

A **zero-build, zero-dependency** Plain Vanilla web app template. No `package.json`, no bundler, no transpiler, no `node_modules`. Everything is native ES Modules, native Custom Elements, and standard browser APIs loaded directly by the browser. The project doubles as an interactive showcase/lab for cutting-edge web platform APIs (WebGPU, WebRTC, WebAuthn, Web Bluetooth, WebCodecs, etc.).

Treat "use the platform, avoid abstractions" as a hard constraint: do not introduce build steps, npm dependencies, or framework runtimes. See `docs/MANIFESTO.md` and `docs/decisions/` (ADRs) for the reasoning behind architectural choices.

## Commands

Because it uses ES Modules + Service Worker, it **must be served over HTTP** (opening `index.html` via `file://` will not work):

```bash
python3 -m http.server      # then open http://localhost:8000/
# or
npx serve .
```

Tests (Node's built-in test runner — no test framework installed):

```bash
node --test tests/*.test.js          # run all tests
node --test tests/store.test.js      # run a single test file
```

Tests run in Node, not a browser, so they **mock browser globals** they depend on (`localStorage`, `BroadcastChannel`, etc. — see `tests/store.test.js`). When testing browser-coupled code, add the globals the module touches.

Lint / syntax check (also what CI runs):

```bash
find . -name "*.js" -not -path "./node_modules/*" | xargs -n 1 node -c
```

Scaffolding & maintenance scripts:

```bash
node scripts/new-page.js ProductInfo   # generates components/pages/ProductInfo.js (see its output for follow-up wiring)
node scripts/update-adr-index.js        # regenerates the ADR index in docs/decisions/
```

CI (`.github/workflows/deploy.yml`) runs the unit tests and the syntax check on push/PR to `master`. `scripts/sync.sh` runs tests + syntax check then **auto-commits and pushes to master** (and references an external cleanup script that may not exist) — do not run it casually.

## Architecture

Two base classes underpin everything; learn them first.

### `BaseComponent` (`lib/base-component.js`) — all UI
- Extends `HTMLElement`. **Light DOM by default** (`static useShadow = false`); set `useShadow = true` per-component to opt into Shadow DOM.
- Reactive state: call `this.initReactiveState({...})` in the constructor. State is a **deep Proxy** — any mutation schedules a re-render batched via `requestAnimationFrame` (`scheduleUpdate`).
- `update()` does a **full `innerHTML` re-render** of the component, then re-applies focus + cursor selection and preserves any element marked `data-persistent` (matched to a `data-persistent-placeholder`). There is no virtual DOM / diffing.
- `render()` must return an `html\`\`` result (a `SafeHTML` object) or a string. Override `afterFirstRender()` to attach event listeners; re-attach them in an overridden `update()` since the DOM is replaced (see `app/App.js`).
- Slots are simulated in Light DOM: `$slot(name)` returns captured original child markup (captured once before first render). `$t(key, params)` is the i18n helper.

### `BaseService` (`lib/base-service.js`) — all logic/state
- Extends `EventTarget`. Use `.on(type, cb)` (returns an unsubscribe fn), `.off(type, cb)`, and `.emit(type, detail)`. `on` auto-unwraps `CustomEvent.detail`.
- Everything in `lib/*-service.js` follows this pattern and is exported as a **singleton instance** (e.g. `appStore`, `router`, `i18n`, `docService`, `authService`). Import the singleton; don't `new` it.

### Rendering & XSS — `lib/html.js`
- `html\`...\`` tagged template **auto-escapes** all interpolated values and concatenates arrays. This is the safe default — always build markup with it.
- `unsafe(str)` wraps a string as trusted `SafeHTML` to bypass escaping. Only use for content you control (e.g. already-rendered child component markup, `$slot` output). Never wrap user/remote input in `unsafe()`.

### State — `lib/store.js`
- `appStore` is the global Proxy-backed store. Setting `appStore.state.x = v` persists to `localStorage`, emits `change`, and **broadcasts to other tabs** via `broadcastService` (BroadcastChannel). `applySnapshot()` powers undo/redo; `setCache`/`getCache` provide TTL caching.

### Routing — hash-based
- `lib/router.js` (`router` singleton) emits `route-change` on `hashchange`.
- `<x-switch>` (`components/route/switch.js`) renders only the first matching `<x-route>`, wrapped in a View Transition when supported. `<x-route>` (`components/route/route.js`) supports `path`, `exact`, `module` (lazy `import()` of the page component), `auth-required` (auth guard → redirects to `/login` via `authService`), and `meta-title`/`meta-desc` (drives `metaService` for SEO/a11y).
- **All routes and nav links are declared in `app/App.js`'s `render()`** — the `navSections` array (sidebar) and the `<x-switch>` block must be kept in sync.

### Adding a page (the wiring)
1. Create `components/pages/MyPage.js` extending `BaseComponent`, `customElements.define('page-my', MyPage)` at the bottom (or use `scripts/new-page.js`).
2. Add an `<x-route ... module="./components/pages/MyPage.js"><page-my></page-my></x-route>` in `app/App.js`.
3. Add a matching entry to `navSections` in `app/App.js`.
4. Core/always-needed pages are **statically imported in `index.js`**; everything else loads lazily via the route's `module` attribute. (Static import of core pages is deliberate — it avoids dynamic-path resolution issues under GitHub Pages.)

### Deployment constraints (GitHub Pages)
- The app is served from a subpath; `index.html` sets `<base href="/plainvanillaweb/">`. **Use relative paths** (`./...`) and resolve module/asset URLs against `document.baseURI` (see `route.js`, `doc-service.js`). Hardcoded absolute paths will break the deployed site.

## Conventions
- **Naming:** custom element tags use prefixes — `x-*` (app/framework), `page-*` (route pages), `ui-*` (reusable UI), `app-*` (app chrome). Service files are `lib/<name>-service.js` exporting a singleton.
- **Styling:** one global stylesheet `index.css` drives theming via CSS variables (`--primary-color`, `--surface-color`, `--bg-color`, …) and `[data-theme="dark"]` selectors managed by `themeService`. Component-scoped styles live in inline `<style>` within `render()`. When touching colors, verify **both** light and dark mode (a recurring source of bugs in git history).
- **Docs:** the `docs/*.md` files are real runtime content — `doc-service.js` fetches and parses them with a minimal Markdown parser at runtime for the `/docs` page. Significant architectural decisions are recorded as ADRs in `docs/decisions/` (run `scripts/update-adr-index.js` after adding one).
- Lab demo pages live in `components/pages/lab/`; Web Worker scripts in `workers/`.
