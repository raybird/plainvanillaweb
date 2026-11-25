# Multi-Window POS

> **Updated**: 2026-11-25  
> **中文**：[Multi-Window POS](./pos.md)  
> **Entry**: [#/solutions/pos](#/solutions/pos) · **Issue**: #10 · **Conventions**: [Reference App Conventions](./conventions.en.md)

A local-first example where four windows on the same machine (ordering, kitchen, customer display and admin) work through orders together. Orders live in the browser's IndexedDB and no server sits between the windows, so the whole flow works offline. The point is to show how state transitions stay legal, atomic and idempotent when several windows act on the same record, and how reloaded, late-opened or closed windows get back to a consistent state.

This is a demo: **it handles no real payments and collects no personal data**.

## 1. How to use it

- Open the [POS entry](#/solutions/pos) and press "Open all four windows". If the browser blocks popups, use the "open in a new tab" link under each role instead.
- Role routes:

| Role | Route | What it does |
| --- | --- | --- |
| Ordering | `#/solutions/pos/order` | Pick items, submit the order, show the pickup number |
| Kitchen | `#/solutions/pos/kitchen` | Claim pending orders, mark them ready, take over orders from a closed station; open several for several stations |
| Customer display | `#/solutions/pos/display` | Large numbers for orders being prepared and ready for pickup; "Picked up" closes an order; can keep the screen awake |
| Admin | `#/solutions/pos/admin` | Status counts, revenue, average prep time, best sellers, windows online, cancelling pending orders |

- Role windows open in the kiosk layout (`?kiosk=1`); the bottom-right link leaves it.
- One complete flow: submit an order → kitchen "Claim" → "Ready" → display "Picked up".
- Reset: "Reset demo data" on the entry or admin page deletes the whole POS database; the menu is restored the next time it opens. "Create 3 demo orders" prepares data for a demo.
- Add `?ns=<name>` for a separate set of data (e.g. `#/solutions/pos?ns=demo-2`); windows opened from the entry keep that namespace.

## 2. Architecture

```text
 Ordering      Kitchen ×N       Display        Admin
    │              │              │             │
    └──── PosSession (one per window) ──────────┘
           │ write:  PosRepository (one readwrite transaction)
           │ notify: MessageBus 'pos:changed' (only says "something changed")
           │ read:   re-read IndexedDB on notification, open, return to foreground, reconnect
           ▼
  IndexedDB  vanilla_solution:<namespace>:orders   ← the only authoritative state
```

| File | Purpose |
| --- | --- |
| `components/pages/solutions/pos/pos-model.js` | Menu, order creation, transition rules, statistics (pure functions) |
| `components/pages/solutions/pos/pos-repository.js` | IndexedDB access; every write reads, decides and writes back in one transaction |
| `components/pages/solutions/pos/pos-session.js` | Per-window session: notifications, re-reads, station lock, peer discovery, reset |
| `components/pages/solutions/pos/pos-page.js` | Shared frame, notices and event delegation for the windows |
| `components/pages/solutions/pos/Pos*Page.js` | The entry page and the four role screens |

Coordination APIs used:

- `MessageBus`: publishes `pos:changed` after a successful write. The message content is not trusted; receivers always re-read the authoritative state.
- `PeerDiscovery`: the admin window lists the windows online and their roles; joins and leaves trigger a re-read.
- Web Locks (platform API): each kitchen station holds `vanilla_solution:<namespace>:station:<station>` so others can tell whether it has closed.

## 3. Data flow

Data model (`POS_SCHEMA_VERSION = 1`):

- `products`: the menu, seeded with the demo menu when the database is created.
- `orders`: `{ id, requestId, number, sequence, items, total, status, station, version, createdAt, updatedAt, history }`; `requestId` has a unique index.
- `meta`: the `sequence` counter for pickup numbers.

Transitions (everything else is rejected with `INVALID_TRANSITION`):

| Action | Transition | Actor | Rule |
| --- | --- | --- | --- |
| `claim` | pending → preparing | kitchen station | Records the station; `CONFLICT` if another station claimed it |
| `ready` | preparing → ready | the claiming station | Other stations cannot complete it |
| `takeover` | preparing → preparing | kitchen station | Must name the previous station; `CONFLICT` if the station is no longer that one |
| `pickup` | ready → picked up | display | |
| `cancel` | pending → cancelled | admin | |

- **Atomicity**: `PosRepository.transition()` reads the order, lets `decideTransition()` decide and writes it back inside one `readwrite` transaction. IndexedDB runs readwrite transactions with overlapping scopes one after another, across tabs too, so when two stations claim at once the later one always sees the earlier result.
- **Idempotency**: the same actor repeating an action that already took effect gets `noop`; orders are deduplicated by `requestId`, so a double click or a retry after a failure never creates a second order. The pickup counter is incremented in the same transaction that writes the order.
- **Notification**: the writing window publishes `pos:changed` and re-reads its own view; other windows re-read on receipt. A notification arriving during a read triggers one more read, so the last change is never missed.

## 4. Failure modes

| Situation | Expected behaviour | How it is verified |
| --- | --- | --- |
| Reload | Restored from IndexedDB; the kitchen station id is kept in sessionStorage, so a reloaded station keeps the orders it claimed | Browser test reloads a kitchen window |
| Window closed and reopened | Reopening re-reads the authoritative state; a closed kitchen station releases its Web Lock and other stations show "Take over" | Browser test takes over after closing a station |
| Window joining late | Reads the current state on open, consistent with the others | Browser test opens the admin window afterwards |
| Concurrent operations on the same record | Exactly one succeeds; the other shows "handled by another station" | Browser test: two kitchens claim at once; two tabs each claim 6 orders at once |
| Duplicate submit | One order per `requestId` | Browser test submits the same `requestId` twice at once |
| Offline | Keeps working; the header shows the offline state. Coordination only spans same-origin windows on one machine | Visited pages are served from the Service Worker cache |
| Background tab misses a notification | Re-reads on returning to the foreground (`visibilitychange`) and on reconnect | `PosSession.start()` |
| Reset while other windows are open | Their connections close on `versionchange`; the next read reopens the database and restores the menu | Browser test checks every window after a reset |
| Duplicated tab | sessionStorage is copied too; the second tab cannot get the same station lock and picks a new station id | `PosSession._claimStation()` |
| No IndexedDB or BroadcastChannel | Shows an explanation and does not start | `detectPosFeatures()` |
| No Web Locks | Cannot tell whether a station has closed: "Take over" is always shown and a person decides | The kitchen screen says the station state cannot be detected |

## 5. Resources and cleanup

- Each window opens an IndexedDB connection, a MessageBus, PeerDiscovery (heartbeat timer) and `visibilitychange` / `online` / `offline` listeners; kitchens also hold the station Web Lock, and the display optionally a Wake Lock. `createTeardown()` releases all of them when the route is left (`disconnectedCallback`).
- A reset clears the IndexedDB database `vanilla_solution:<namespace>:orders`. The kitchen station id lives in sessionStorage (`vanilla_solution:<namespace>:station`) and disappears with the window.

## 6. Gap to production

- **Authorization and identity**: any same-origin page can read and write this data; a namespace is not a security boundary. A real system needs sign-in, role permissions and an audit trail.
- **Transactions and payments**: no payment, receipts, refunds or reconciliation; revenue is just the sum of order totals.
- **Cross-device sync and backend**: coordination only spans one browser profile on one machine. Several tills and kitchen tablets need a backend (see the cross-device evaluation in [ADR 0107](../decisions/0107-sharedworker-and-cross-device-transport-evaluation.md)) and conflict handling.
- **Personal data and auditing**: no customer data is collected; a real system must handle retention periods and access logs.
- **Other**: menu management, stock, peak load, printers and pager hardware are out of scope; browsers may evict data when storage runs low, so a real system needs `navigator.storage.persist()` and backups.

## 7. Tests

- `tests/pos-model.test.js`: order creation and totals, the full flow, idempotency, station conflicts, the takeover compare-and-set, illegal transitions, statistics.
- `runPosTests` in `tests/browser-runner.mjs`: in a dedicated namespace, several real windows go through submit → claim → ready → pickup; a repeated `requestId`; two kitchens claiming at once; two tabs each claiming 6 orders at once with one success per order; a late admin window; a reload keeping the station; taking over after a station closes; consistency after a reset.
