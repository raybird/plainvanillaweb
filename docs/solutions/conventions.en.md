# Solutions Reference App Conventions

> **Updated**: 2026-11-25  
> **中文**：[Reference App 慣例](./conventions.md)  
> **Decisions**: [ADR 0108](../decisions/0108-solutions-reference-app-conventions.md) · [ADR 0101](../decisions/0101-core-entry-point.md) · [ADR 0102](../decisions/0102-route-owned-page-lifecycle.md)  
> **Shared helpers**: `components/pages/solutions/solution-kit.js`, `app/kiosk.js`

Labs explain one API at a time; Solutions combine several native capabilities into complete applications and workflows. Every reference app must open, reset and be removed on its own, without affecting the other apps, and the core must never depend on it.

Entry point: [Solutions](#/solutions).

---

## 1. Catalogue and boundaries

| App | Route | Delivered by | Status |
| --- | --- | --- | --- |
| Multi-Window POS | `#/solutions/pos/*` | #10 | Planned |
| Browser Computing Farm | `#/solutions/farm` | #11 | Planned |
| Browser Cluster | `#/lab/browser-cluster` | #6 (Lab) | Done; Solutions only links to it |

- App code lives in `components/pages/solutions/<slug>/` and is lazily loaded through `module` by the nested `<x-switch>` in `components/pages/Solutions.js`.
- The core (`lib/core.js` and its import graph) must not import Solutions; the allowlist in `tests/core.test.js` enforces this.
- Coordination goes through the public API of `lib/coordination.js` only. When the SDK lacks something an app needs, discuss adding it to the SDK in an issue first instead of copying infrastructure into the app.
- An app's own business data (orders, for example) lives in the app's own IndexedDB store. That is application data, not duplicated infrastructure.

## 2. Routes

- Always under `/solutions/<slug>`, where `<slug>` is lowercase letters, digits and hyphens (`pos`, `farm`).
- Multi-role apps get one route per role: `/solutions/<slug>/<role>`, e.g. `/solutions/pos/kitchen`.
- Route content goes inside `<template>` (ADR 0102): created on enter, removed on leave.
- Build links inside an app with `buildSolutionHash(path, { ns, kiosk })` so the namespace and kiosk setting survive navigation.

## 3. Kiosk layout

When the hash query carries `kiosk=1` (e.g. `#/solutions/pos/kitchen?kiosk=1`), `<x-app>` renders no sidebar, hamburger button or footer, the Solutions header is hidden too, and the main content fills the window. A fixed "Exit kiosk layout" link in the top-right corner returns to the normal layout.

Open role windows with `openSolutionWindow(path, { name, ns })`:

```javascript
import { openSolutionWindow } from './solution-kit.js';

const { url, window: opened } = openSolutionWindow('/solutions/pos/kitchen', { name: 'pos-kitchen', ns });
if (!opened) {
    // The popup was blocked: show the url so the user can open it themselves
}
```

- Window names are fixed, so clicking again reuses the same window.
- A blocked popup returns `window: null`; the page must offer a clickable link as a fallback instead of relying on `window.open` alone.

## 4. Namespace and storage

| Item | Rule | Helper |
| --- | --- | --- |
| namespace | Defaults to `solution-<slug>`; the hash query's `ns` overrides it (for tests and side-by-side demos) | `resolveNamespace(slug)` |
| IndexedDB database, localStorage key | `vanilla_solution:<namespace>:<purpose>` | `solutionStorageName(namespace, purpose)` |
| MessageBus / LeaderElection / DurableTaskQueue | Pass the same namespace | the `namespace` option of the coordination API |

- A namespace only separates data; it is **not a security boundary**. Any same-origin page can read and write it.
- Do not keep app data in the global `appStore`: it writes to `localStorage` and broadcasts to every tab.
- Each app declares its own `SCHEMA_VERSION`. Migrate in `onupgradeneeded` when it changes; demo data that cannot be migrated is reset, with an explanation on screen.
- Every IndexedDB connection sets `db.onversionchange = () => db.close()`, otherwise a reset from another window gets stuck.
- Binary data (images, media) goes in the app's own Blob store; `DurableTaskQueue` payloads and results only carry references (the queue rejects `Blob` and `ArrayBuffer`, see [Coordination](../coordination.md)).
- Apps that write a lot of data check free space with `navigator.storage.estimate()` first, limit file size and count, and report a clear error when the limit is exceeded.

## 5. Feature detection and fallbacks

Detect the capabilities an app needs when it opens, and show an understandable explanation when something is missing instead of letting the page throw:

```javascript
import { detectFeatures } from './solution-kit.js';

const { supported, missing } = detectFeatures({
    indexedDB: () => 'indexedDB' in globalThis,
    webLocks: () => 'locks' in navigator,
    offscreenCanvas: () => typeof OffscreenCanvas === 'function',
});
```

- Split them into required and optional: a missing required capability stops at the explanation screen; a missing optional one (Wake Lock, barcode) turns that feature off and the rest keeps working.
- A check that throws counts as unsupported.
- Hardware missing in headless Chrome must not trigger `console.error` on page load; the smoke test treats that as a failure.

## 6. Teardown

Register a dispose function at the moment you open a resource, and release everything in `disconnectedCallback`:

```javascript
import { createTeardown } from './solution-kit.js';

connectedCallback() {
    super.connectedCallback();
    this._teardown = createTeardown();
    const bus = createMessageBus({ namespace });
    this._teardown.add(() => bus.dispose());
    const url = URL.createObjectURL(blob);
    this._teardown.add(() => URL.revokeObjectURL(url));
}

disconnectedCallback() {
    super.disconnectedCallback();
    this._teardown.run();
}
```

- Resources are released in reverse order; one failure does not stop the others, and `run()` returns the list of errors.
- Must be released: BroadcastChannel / MessageBus, Web Locks and leadership, Workers, object URLs, timers, IndexedDB connections, Wake Lock, media streams.
- The smoke test visits and leaves every route; unreleased resources break later pages or slow the test down.

## 7. Reset

Every app offers an on-screen "Reset demo data" that can reload the seed data:

```javascript
import { resetSolutionData, solutionStorageName } from './solution-kit.js';

await this._teardown.run(); // close our own connections first
bus.publish('solution:reset', {}); // tell other windows to close their connections or reload
const report = await resetSolutionData({
    databases: [solutionStorageName(namespace, 'orders')],
    storageKeys: [solutionStorageName(namespace, 'settings')],
    cleanups: [() => queue.clearNamespace()],
});
```

- `report.databases[name]` is `deleted`, `blocked` (a connection stayed open until the timeout) or `unsupported`. On `blocked`, ask the user to close the other windows and try again.
- Clear only your own namespace; for the shared `vanilla_coordination_tasks` database use `clearNamespace()`, never delete the whole database.

## 8. Docs and tests

- Every app has a Chinese and an English doc, `docs/solutions/<slug>.md` and `docs/solutions/<slug>.en.md`, linking to each other at the top. Follow the [doc template](./reference-app-template.en.md) for architecture, data flow, failure modes and the gap to production.
- Add the new doc to the list in `components/pages/Docs.js` (Chinese version only; the English one is reached through its link).
- Tests:
  - Pure logic (state transitions, storage naming) gets Node unit tests.
  - Multi-window flows go in `tests/browser-runner.mjs`, using several real tabs (CDP `Target.createTarget`) and a dedicated `ns` to isolate test data.
  - Routes are visited by the smoke test automatically and must produce no exceptions, no `console.error` and no 4xx/5xx.
- Authorization, payments, cross-device sync and backends required for real commercial use are listed explicitly under "Gap to production" in the doc; the demo never pretends to handle them.
