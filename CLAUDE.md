# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ 最重要規則

**Git commit 訊息絕對不可包含 `Co-Authored-By: Claude` 或任何 AI 署名資訊。** 只寫功能描述，不附加任何尾行。


## What this is

A **zero-build, zero-dependency** Plain Vanilla web app template. No `package.json`, no bundler, no transpiler, no `node_modules`. Everything is native ES Modules, native Custom Elements, and standard browser APIs loaded directly by the browser. The project doubles as an interactive showcase/lab for cutting-edge web platform APIs (WebGPU, WebRTC, WebAuthn, Web Bluetooth, WebCodecs, etc.).

Treat "use the platform, avoid abstractions" as a hard constraint: do not introduce build steps, npm dependencies, or framework runtimes. See `docs/manifesto.md` and `docs/decisions/` (ADRs) for the reasoning behind architectural choices.

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

Browser tests (real DOM, headless Chrome via DevTools Protocol — no dependencies; needs Node 22+ and a local Chrome, override with `CHROME_PATH`; also what CI runs, ~1.5 min):

```bash
node tests/browser-runner.mjs   # DEBUG=1 prints per-page timing
```

The runner serves the repo twice — at `/` and at `/plainvanillaweb/` (subpath only, so wrong relative paths 404 instead of silently hitting the root) — and in each:
1. runs `tests/browser.html` (BaseComponent rendering lifecycle, Light/Shadow DOM, reactive state, `data-persistent` preservation) and reads `window.__TEST_RESULTS__`;
2. smoke-tests the whole site: visits every `<x-route>` it discovers (including lazily loaded lab sub-routes) and every doc linked from the pages, failing on uncaught exceptions, `console.error`, 4xx/5xx responses, when the visited route is not the active `<x-route>` (unless it redirected), or when an `<i data-lucide>` icon is left unrendered. A new page that logs `console.error` in headless Chrome (e.g. missing hardware) needs a matching pattern in `IGNORED_ERRORS`.

To debug `tests/browser.html` by hand: `python3 -m http.server`, then open `http://localhost:8000/tests/browser.html`.

Lint / syntax check (also what CI runs):

```bash
find . \( -name "*.js" -o -name "*.mjs" \) -not -path "./node_modules/*" | xargs -n 1 node -c
```

All of the above in one go (same as CI; check-only):

```bash
scripts/check.sh           # add --quick to skip the browser tests
```

Scaffolding & maintenance scripts:

```bash
node scripts/new-page.js ProductInfo   # generates components/pages/ProductInfo.js (see its output for follow-up wiring)
node scripts/update-adr-index.js        # regenerates the ADR index in docs/decisions/ (--check: fail on duplicate ids or stale index)
node scripts/update-sw-version.js       # rewrites sw.js CACHE_NAME and index.html index.js?v= from a hash of served files
```

**Before committing any change to served files** (anything outside `tests/`, `scripts/`, `.github/`, `.agent/` and root `*.md`), run `node scripts/update-sw-version.js` and commit the updated `sw.js` / `index.html` with it; otherwise returning visitors keep getting the old Service Worker cache. The hash covers git-tracked files only, so `git add` new files first.

CI (`.github/workflows/deploy.yml`) runs the unit tests, the syntax check, `update-sw-version.js --check`, `update-adr-index.js --check` and the browser tests on push/PR to `master`. Run the same checks locally with `scripts/check.sh` (`--quick` skips the browser tests); it only checks — it never modifies, commits or pushes.

## Architecture

Two base classes underpin everything; learn them first.

`lib/core.js` is the core-only entry point (html, BaseComponent/morph, BaseService, Store, router, `<x-route>`/`<x-switch>`, i18n); `lib/vanilla-sdk.js` re-exports everything. `tests/core.test.js` walks core.js's static import graph against an allowlist (ADR 0101) — core modules must not import showcase services; when you add a core module, add it to that allowlist.

### `BaseComponent` (`lib/base-component.js`) — all UI
- Extends `HTMLElement`. **Light DOM by default** (`static useShadow = false`); set `useShadow = true` per-component to opt into Shadow DOM.
- Reactive state: call `this.initReactiveState({...})` in the constructor. State is a **deep Proxy** — any mutation schedules a re-render batched via `requestAnimationFrame` (`scheduleUpdate`).
- `update()` renders via `innerHTML` the first time, then **morphs** the existing DOM to the new HTML (`lib/morph.js`, ADR 0100): plain elements matched by position or `id` are kept and only their attributes/text/form values change; **custom elements are always recreated** (so child components keep their old connect/disconnect lifecycle — pages release cameras on navigation, `Docs` re-reads the URL); `data-persistent` nodes and Lucide `<svg>`s with unchanged source are kept as-is. `static morphUpdates = false` opts a component back into full re-render.
- Listeners: because nodes survive re-renders, **never `addEventListener` inside `update()`** — it stacks a new listener on the kept node every render. Bind once in `afterFirstRender()`, preferably delegated on the component itself with `event.target.closest(...)` (see `app/App.js`), or use inline `onclick="this.closest('my-el').method()"`.
- `render()` must return an `html\`\`` result (a `SafeHTML` object) or a string. Override `afterFirstRender()` to attach event listeners (see the listener note above).
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
- Path matching lives in one place, `matchRoute()` in `lib/router.js` (`*`, `:name` params, trailing `/*` prefix wildcard, `exact`, otherwise segment-boundary prefix match, case-insensitive); see `docs/router.md`. Matched params are on `route.params`.
- `<x-switch>` (`components/route/switch.js`) renders only the first matching `<x-route>`, wrapped in a View Transition when supported. `<x-route>` (`components/route/route.js`) supports `path`, `exact`, `module` (lazy `import()` of the page component), `auth-required` (calls `router.authGuard(route)`, redirects to `router.loginPath` when it returns false; the guard defaults to allow and `index.js` wires it to `authService` — the router itself must not import `authService`), and `meta-title`/`meta-desc` (drives `metaService` for SEO/a11y).
- **All routes and nav links are declared in `app/App.js`'s `render()`** — the `navSections` array (sidebar) and the `<x-switch>` block must be kept in sync.

### Adding a page (the wiring)
1. Create `components/pages/MyPage.js` extending `BaseComponent`, `customElements.define('page-my', MyPage)` at the bottom (or use `scripts/new-page.js`).
2. Add an `<x-route ... module="./components/pages/MyPage.js"><page-my></page-my></x-route>` in `app/App.js`.
3. Add a matching entry to `navSections` in `app/App.js`.
4. Core/always-needed pages are **statically imported in `index.js`**; everything else loads lazily via the route's `module` attribute. (Static import of core pages is deliberate — it avoids dynamic-path resolution issues under GitHub Pages.)

### Deployment constraints (GitHub Pages)
- The app is served from a subpath; `index.html` sets `<base href="/plainvanillaweb/">`. **Use relative paths** (`./...`) and resolve module/asset URLs against `document.baseURI` (see `route.js`, `doc-service.js`). Hardcoded absolute paths will break the deployed site.

### Bootstrap & startup (`index.js`)
1. `networkMonitor.enable()` — starts offline/online monitoring
2. Core pages (`HomePage.js`, `Lab.js`) are **statically imported** (needed immediately; avoids dynamic-path issues on GitHub Pages)
3. `registerRoute()` — defines `<x-route>` custom element
4. `i18n.init()` — loads locale JSON before first render
5. `registerApp()` — defines `<x-app>` and mounts the app
6. Service Worker registration at the bottom — `sw.js` with versioned cache (`CACHE_NAME`). When adding/removing core assets, **bump the cache version** in `sw.js` (`CORE_ASSETS` array) so the new `install` handler precaches correctly.

### `index.html` debug hooks
- `window.__LAB_DEBUG__ = { errors: [], logs: [] }` — catches `console.error`, `error` events, and `unhandledrejection`. Lab pages use this for displaying errors inline.

## Conventions
- **Naming:** custom element tags use prefixes — `x-*` (app/framework), `page-*` (route pages), `ui-*` (reusable UI), `app-*` (app chrome). Service files are `lib/<name>-service.js` exporting a singleton.
- **Styling:** one global stylesheet `index.css` drives theming via CSS variables (`--primary-color`, `--surface-color`, `--bg-color`, …) and `[data-theme="dark"]` selectors managed by `themeService`. Component-scoped styles live in inline `<style>` within `render()`. When touching colors, verify **both** light and dark mode (a recurring source of bugs in git history).
- **Docs:** the `docs/*.md` files are real runtime content — `doc-service.js` fetches and parses them with a minimal Markdown parser at runtime for the `/docs` page. Significant architectural decisions are recorded as ADRs in `docs/decisions/` (run `scripts/update-adr-index.js` after adding one). ADR numbers never change and are never reused; take the next number shown at the bottom of `docs/decisions/README.md`, and leave gaps unfilled.
- Lab demo pages live in `components/pages/lab/`; Web Worker scripts in `workers/`.
