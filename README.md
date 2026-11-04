# 🍦 Plain Vanilla Web App Template

**[English](./README.md)** | [繁體中文](./README_zh-TW.md)

> **[📍 View 2026 Evolution Roadmap](./ROADMAP.md)**

A modern, zero-dependency, zero-build web application template built in the spirit of **[Plain Vanilla Web](https://plainvanillaweb.com/)**: no bundler, no transpiler, no `node_modules` — native ES Modules, Custom Elements and standard browser APIs, loaded directly by the browser.

> **💡 Inspired by [jsebrech/plainvanilla](https://github.com/jsebrech/plainvanilla).**

This repository is two things, in two layers:

| Layer | What it is | Entry point | Use it when |
| :--- | :--- | :--- | :--- |
| **① Core** | ~1,100 lines of reusable foundation: safe templates, reactive components with DOM morphing, services, a cross-tab store and a hash router | [`lib/core.js`](./lib/core.js) | You want to build your own app the vanilla way |
| **② Showcase** | A full site built on the core: 37 interactive labs of cutting-edge Web APIs, runtime-rendered docs, a dashboard and a playground | [`index.html`](./index.html) · [`lib/vanilla-sdk.js`](./lib/vanilla-sdk.js) | You want to learn a Web API or borrow a ready-made service |

The core never imports anything from the showcase; a test enforces that boundary ([ADR 0101](./docs/decisions/0101-core-entry-point.md)). Releases follow semantic versioning — see the [CHANGELOG](./CHANGELOG.md) (current: **v3.0.0**).

> 💡 **Why "Standards over Frameworks, Zero Build, Security by Default, and Transparency"?** Read the **[Vanilla Manifesto](./docs/manifesto.md)**.

---

## ① The Core

### What's inside

| Module | Role |
| :--- | :--- |
| `lib/html.js` | `html` tagged template that **auto-escapes** every interpolated value (XSS-safe by default); `unsafe()` for trusted markup |
| `lib/base-component.js` | `BaseComponent` — Custom Element base with deep reactive state, `requestAnimationFrame` batching, Light DOM by default (Shadow DOM opt-in), slot simulation and `$t()` i18n |
| `lib/morph.js` | Re-renders **morph the existing DOM in place**: unchanged elements keep their nodes, listeners, focus, cursor and scroll position; child components are recreated to keep their lifecycle ([ADR 0100](./docs/decisions/0100-dom-morphing-updates.md)) |
| `lib/base-service.js` | `BaseService` — `EventTarget`-based singleton service base with `on` / `off` / `emit` |
| `lib/store.js` | `appStore` — Proxy-backed global state persisted to `localStorage`, synced across tabs via `BroadcastChannel`, with snapshots (`applySnapshot`) and a TTL cache |
| `lib/router.js`, `components/route/` | Hash router: `matchRoute()` (`:params`, `/*` wildcards, `exact`), `<x-switch>` / `<x-route>` with lazy `import()` of pages, View Transitions, an injectable `authGuard`, and SEO meta |
| `lib/i18n-service.js`, `lib/meta-service.js` | Locale loading & translation; `document.title` / description per route |

### Use it in your own page

Copy `lib/` and `components/route/` (keeping the relative paths), or import a pinned release from jsDelivr — the files behind a version tag never change ([CHANGELOG](./CHANGELOG.md)). Serve over HTTP — ES Modules do not load from `file://`.

```javascript
import { BaseComponent, html, router, registerRoute } from './lib/core.js';
// or a pinned release: import { ... } from 'https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v3.0.0/lib/core.js';

class HelloCard extends BaseComponent {
    constructor() { super(); this.initReactiveState({ count: 0 }); }
    render() {
        return html`<button onclick="this.closest('hello-card').state.count++">Clicked ${this.state.count}</button>`;
    }
}
customElements.define('hello-card', HelloCard);

registerRoute();                                      // defines <x-route>; <x-switch> is defined on import
router.authGuard = () => Boolean(localStorage.token); // optional: guard for auth-required routes
```

```html
<x-switch>
    <x-route path="/" exact><hello-card></hello-card></x-route>
    <x-route path="/admin" auth-required module="./pages/Admin.js"><page-admin></page-admin></x-route>
    <x-route path="*"><h1>Not Found</h1></x-route>
</x-switch>
```

### Core guides

- [Component Architecture](./docs/component-architecture.md) — reactive Custom Elements, morphing and how to bind events
- [SafeHTML & XSS Defense](./docs/safe-html-rendering.md) — the escaping rules of `html` / `unsafe`
- [Service Patterns](./docs/service-patterns.md) — singleton services and event-driven architecture
- [State Management](./docs/state-management.md) · [Router](./docs/router.md) · [i18n](./docs/i18n.md)
- [Architecture Overview](./docs/project-architecture-overview.md) — how the pieces fit together

---

## ② The Showcase

### Run it

```bash
python3 -m http.server   # or: npx serve .
```

Open `http://localhost:8000/`. The sidebar is organized into:

- **📚 Docs** — the `docs/*.md` files, fetched and rendered at runtime.
- **🧪 Lab** — 37 self-contained labs of cutting-edge native APIs, most with a matching doc.
- **🎡 Playground** — a WYSIWYG code playground powered by `Blob` and object URLs.
- **📊 Dashboard / 📈 Analytics** — live IndexedDB, network and Store inspection; Web Vitals (LCP, CLS) on a native Canvas chart.
- **⚡ Worker Demo / 🔍 Repo Search** — off-main-thread compute; a GitHub REST search UI with a virtual list.
- **👤 Profile** — a login demo behind an `auth-required` route.

### Web APIs on display

- **WebGPU & WebAssembly** — compute shaders and streaming WASM execution.
- **WebRTC (P2P)** — serverless peer-to-peer data and media.
- **Hardware** — Web Bluetooth, Web Serial, Web MIDI, Web NFC, Barcode Detection, Screen Capture.
- **WebAuthn** — passkeys with FaceID, TouchID and FIDO2 security keys.
- **Media** — WebCodecs, Media Streams with live canvas filters, Web Audio, Web Speech (TTS / STT).
- **Platform** — Payment Request, Compression Streams, File System Access, Web Share & Share Target, Web Locks, Background Fetch, Badging, Screen Wake Lock, EyeDropper, Popover.

### Everything in one import: `lib/vanilla-sdk.js`

The SDK re-exports the core plus 40+ showcase services (crypto, IndexedDB, WebRTC, WebGPU, notifications…), the reactive form engine and `CanvasChart`. See the [SDK guide](./docs/sdk-usage.md).

```javascript
import { BaseComponent, html, cryptoService, FormGroup } from 'https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v3.0.0/lib/vanilla-sdk.js';
```

### App-level features built on the core

- **PWA** — network-first Service Worker with offline fallback and a content-hashed cache version ([ADR 0097](./docs/decisions/0097-network-first-sw-versioning.md)).
- **Offline Action Queue** — mutations queued while offline and replayed on reconnect.
- **Undo / Redo** — snapshot history on top of `appStore.applySnapshot()`.
- **Virtual List** — smooth scrolling through 10,000+ rows.
- **Theming** — CSS variables, light / dark mode with a circular reveal transition.
- **Prefetch** — page modules preloaded when hovering a nav link.
- **Storage Persistence** — proactive quota requests to prevent eviction.

---

## 📂 Project Structure

```text
.
├── lib/                  # ① core modules + ② showcase services
│   ├── core.js           # ① core-only entry point
│   ├── html.js, base-component.js, morph.js, base-service.js,
│   │   store.js, broadcast-service.js, router.js,
│   │   i18n-service.js, meta-service.js        # ① core
│   ├── vanilla-sdk.js    # ② everything-in-one entry point
│   └── *-service.js      # ② WebGPU, WebRTC, Bluetooth, Crypto…
├── components/
│   ├── route/            # ① <x-switch>, <x-route>
│   ├── pages/            # ② route pages (Home, Docs, Dashboard, Login…)
│   │   └── lab/          # ② 37 Web API labs
│   └── ui/               # ② reusable UI (Card, NativeChart…)
├── app/App.js            # ② site shell: sidebar and all routes
├── docs/                 # runtime-loaded docs (Markdown)
│   └── decisions/        # 90+ Architecture Decision Records
├── workers/              # ② Web Worker scripts
├── assets/               # images, locales (zh-TW, en-US)
├── tests/                # unit tests (Node) & browser tests (headless Chrome)
├── scripts/              # scaffolding & maintenance scripts
├── index.html, index.js, index.css   # ② site entry, bootstrap, global styles
├── sw.js                 # ② Service Worker
└── manifest.json         # ② PWA manifest & Web Share Target
```

---

## 🧪 Testing & Code Quality

No test frameworks or linters need to be installed. We utilize Node.js built-in tooling:

```bash
# Run all unit tests (Node.js built-in test runner)
node --test tests/*.test.js

# Run DOM & lifecycle tests plus a whole-site smoke test in headless Chrome (Node 22+, no dependencies)
node tests/browser-runner.mjs

# Run syntax check across all JavaScript files
find . \( -name "*.js" -o -name "*.mjs" \) -not -path "./node_modules/*" -not -path "./.git/*" | xargs -n 1 node -c

# Or run every CI check locally in one go (check-only; --quick skips the browser tests)
scripts/check.sh
```

### Bump the cache version before release

When served files change, run the command below before committing and commit the updated `sw.js` and `index.html` with it; otherwise returning visitors keep getting the old Service Worker cache. CI checks that the version matches the file contents.

```bash
node scripts/update-sw-version.js
```

---

## 📄 Architecture Decision Records (ADR)

Significant architectural choices are strictly documented under [`docs/decisions/`](./docs/decisions/).
Run `node scripts/update-adr-index.js` to regenerate the ADR index after adding a new decision.

---

## License

MIT License
