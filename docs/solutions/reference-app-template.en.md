# Solutions Doc Template

> **Updated**: 2026-11-25  
> **中文**：[Solutions 文件範本](./reference-app-template.md)  
> **Related**: [Reference App Conventions](./conventions.en.md)

When adding a reference app, copy the template below to `docs/solutions/<slug>.en.md`, with the Chinese version in `docs/solutions/<slug>.md`. Both docs keep the same sections and link to each other at the top. Every section needs content; when one does not apply, write "Not applicable" and say why instead of deleting it.

---

## Template

```markdown
# <App name>

> **Updated**: YYYY-MM-DD  
> **中文**：[<Chinese title>](./<slug>.md)  
> **Entry**: [#/solutions/<slug>](#/solutions/<slug>) · **Issue**: #<number>

One paragraph on the problem this app solves and which combination of native capabilities it shows.

## 1. How to use it
- How to open it (how many windows, the route of each)
- The steps of one complete flow
- How to reset the demo data

## 2. Architecture
- Components and modules (file paths)
- Coordination APIs used and what for
- Architecture diagram (ASCII or prose: who owns the authoritative state, who only reads it)

## 3. Data flow
- Data model and `SCHEMA_VERSION`
- State transitions (list every legal transition; how illegal ones are rejected)
- Write path: which transaction or lock makes it atomic
- Notification path: which MessageBus topics are published, and how receivers re-read the authoritative state

## 4. Failure modes
| Situation | Expected behaviour | How it is verified |
| --- | --- | --- |
| Reload | | |
| Window closed and reopened | | |
| Window joining late | | |
| Concurrent operations on the same record | | |
| Offline | | |
| Storage full | | |
| Required capability unsupported | | |

## 5. Resources and cleanup
- Resources opened and when they are released
- What a reset clears (database names, keys, queue namespaces)

## 6. Gap to production
- Authorization and identity
- Transactions and payments
- Cross-device sync and backend
- Personal data and auditing
- Other (performance, scale, compliance)

## 7. Tests
- Unit test files and what they cover
- Flows covered by the multi-tab browser tests
```
