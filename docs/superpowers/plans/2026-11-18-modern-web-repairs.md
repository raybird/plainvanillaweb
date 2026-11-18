# Modern Web Guidance repair plan

**Goal** Resolve confirmed interaction, accessibility, lifecycle, and offline defects from the audit while retaining the native SDK.

**Architecture** Apply behavior changes where state is owned. Keep DOM form state when template defaults are unchanged, centralize dialog settlement, and restrict offline caches to their registration. Use native controls and progressive enhancement.

- [x] Form and modal regressions in `tests/form-engine.test.js` and `tests/browser.html`. Verify live values, stale async results, submit gating, and native/programmatic dismissal. Update `lib/morph.js`, `lib/form-engine.js`, the login/forms pages, and modal component/service.
- [x] Navigation and accessibility in `app/App.js`, `components/route/`, `index.css`, `index.html`, and notification/chat components. Verify skip links preserve hash, mobile navigation respects tab order, and nonessential transitions respect motion preferences.
- [x] Platform fixes in `sw.js`, `lib/pwa-service.js`, Serial/media pipeline services and their Lab consumers. Verify cache activation ownership and exact request selection, supported registration detection, and resource release on close.
- [x] Telemetry and history. Fix late Navigation Timing initialization, metric labels and missing values, teardown subscriptions/timers, and error causes; keep snapshot input compatibility explicit.
- [x] Re-run guidance scan, refresh cache version, run the complete Node and browser checks, and record any remaining measurement or hosting follow-ups in the audit.
