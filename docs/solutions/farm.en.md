# Browser Computing Farm

> **Updated**: 2026-11-25  
> **中文**：[Browser Computing Farm](./farm.md)  
> **Entry**: [#/solutions/farm](#/solutions/farm) · **Issue**: #11 · **Conventions**: [Reference App Conventions](./conventions.en.md)

An example where several tabs on the same machine process a batch of local images together (resize and convert). Tasks live in `DurableTaskQueue`'s persistent IndexedDB queue; each tab can opt in to processing, claim tasks from the queue and process them in a Web Worker with OffscreenCanvas. The point is to show that tasks are reclaimed when a node closes or reloads mid-task, that work resumes after every tab has been closed and reopened, that large binary data stays out of the queue, and that results from an expired lease never overwrite newer ones.

Images stay in this browser and are never uploaded. **More tabs are not necessarily faster**: tabs on the same machine share its CPU, memory and GPU. The page's run history lists the measured time and throughput of every batch so you can compare for yourself.

## 1. How to use it

- Open [Farm](#/solutions/farm) and import local images with "Choose images", or press "Generate 8 test images". Ticking "Add 1 broken image" demonstrates failure and retry.
- Set the maximum width (16–4096, never upscaled), the format (WebP, JPEG, PNG) and the quality, then press "Create batch".
- Press "Join processing" in one or more tabs, with 1–4 lanes (how many images that tab processes at once). Tabs that have not joined only watch progress and claim nothing.
- When the batch finishes you can preview and download each result. "Retry failed tasks" puts failed tasks back in the queue.
- "Reset demo data" clears this namespace's tasks from the queue and deletes the image database.
- Add `?ns=<name>` for a separate data set (for example `#/solutions/farm?ns=bench-2`).

Import limits: at most 40 images, 15 MB per file and 150 MB in total. Where the browser supports `navigator.storage.estimate()`, an import is refused when the remaining space cannot hold the inputs plus the outputs (about twice the size).

## 2. Architecture

```text
  Tab A (joined, 2 lanes)   Tab B (joined, 1 lane)   Tab C (watching only)
   lane1  lane2               lane1
     │      │                   │
     │  DurableTaskQueue (one workerId per lane): claim, renew, complete
     │      │                   │
     ▼      ▼                   ▼
  Web Worker + OffscreenCanvas (one Worker per lane)
     │
     ├─ IndexedDB  vanilla_coordination_tasks        tasks: the payload holds only inputId and params
     └─ IndexedDB  vanilla_solution:<ns>:blobs       inputs / outputs (Blobs) / runs
  MessageBus 'farm:changed': announces that something changed; every tab rereads both databases
  PeerDiscovery: shows the nodes that are processing and their lane counts
```

| File | Purpose |
| --- | --- |
| `components/pages/solutions/farm/farm-model.js` | Parameter validation, import limits, output naming, orphan detection, run statistics (pure functions) |
| `components/pages/solutions/farm/farm-image.js` | Resizing and conversion, test image generation; shared by the Worker and the main thread |
| `workers/image-farm.worker.js` | Module Worker that takes a Blob and returns the processed Blob |
| `components/pages/solutions/farm/farm-processor.js` | Starts the Worker; falls back to the main thread when unsupported |
| `components/pages/solutions/farm/farm-store.js` | Image Blob store (IndexedDB) |
| `components/pages/solutions/farm/farm-session.js` | Per-tab session: lanes, handler, notifications, rereads, orphan cleanup, reset |
| `components/pages/solutions/farm/FarmPage.js` | The page |

## 3. Data flow

1. **Import**: images go into `inputs` (`{ id, name, type, size, blob, createdAt }`).
2. **Create a batch**: each input is enqueued as an `image.process` task (handler version 1) with the payload `{ runId, inputId, name, params }`, the `idempotencyKey` `runId:inputId` and `maxAttempts` 3. The batch itself (parameters, task id list, creation time) goes into `runs`.
3. **Claim and process**: a lane claims a task, reads the Blob from `inputs` and hands it to its Worker; the queue renews the lease while the handler runs.
4. **Write the output**: the output Blob is written to `outputs` under the key `taskId:leaseId`, and the handler's result carries only that key plus the size, dimensions, duration and node. At `completeAtomic` the queue checks that the lease is still valid before it writes the result into the task.
5. **Notify and reread**: queue events (claimed, completed, failed, rescheduled, reclaimed) trigger `farm:changed`; every tab coalesces notifications and rereads tasks, inputs, outputs and runs at most once every 200 ms.

**Why the output key includes `leaseId`**: node A is frozen halfway through a task (say its tab went to the background), its lease expires, and node B reclaims and finishes the task. When A wakes up and writes its output, its `completeAtomic` is refused because the lease is no longer valid. The two outputs have different keys, so A cannot overwrite B's result, and the task's result references only B's. A's output is an **orphan**: no completed task references it and it does not belong to a running lease. After a 30-second grace period the next reread deletes it (`findOrphanOutputs()`).

**Why Blobs stay out of the queue**: `DurableTaskQueue` deliberately refuses Blobs, ArrayBuffers and TypedArrays (`SERIALIZATION_ERROR`); large binary data would slow down the single readwrite transaction a claim runs in. See the binary data pattern in [Coordination](../coordination.md).

**Run statistics**: the elapsed time runs from creating the batch to the last completion; throughput is completed images divided by elapsed time; the history also lists how many images each node completed and how many were retried. To compare one node with several, create one batch per setup with the same images and parameters and read the run history.

## 4. Failure modes

| Situation | Expected behaviour | How it is verified |
| --- | --- | --- |
| A node closes or reloads mid-task | Its Web Lock is released with the tab and another node reclaims early; otherwise the task is reclaimed when the lease (5 s) expires and another node claims it. The interrupted attempt counts toward the limit of 3 | Browser test closes a node mid-batch |
| Every tab is closed | Tasks and images are in IndexedDB; reopening and joining resumes the unfinished tasks | Browser test closes every tab and reopens |
| Leaving processing | Same as closing the tab: tasks are not rewritten, other nodes reclaim the active ones | `FarmSession.leave()` |
| An expired lease finishes its output | `completeAtomic` is refused; the output becomes an orphan and is deleted after the grace period, never overwriting the newer result | `tests/farm-model.test.js`; the browser test checks outputs and task results match one to one |
| An image cannot be decoded | Retried with backoff, marked failed with the error after 3 attempts; "Retry failed tasks" requeues it | Browser test with a broken image |
| A batch is submitted twice | `idempotencyKey` deduplicates, no duplicate tasks | `FarmSession.createRun()` |
| Not enough space | Files over the count, per-file or total limit are skipped with a reason each; the whole import is refused when remaining space is too low | `tests/farm-model.test.js` |
| No OffscreenCanvas or module Worker | Processing runs on the main thread and the page may stutter; the page lists the missing capabilities | `ImageProcessor.init()` |
| The requested output format is unsupported | The canvas outputs PNG instead; the result's extension and MIME type follow the actual format | `outputName()` |
| No IndexedDB, BroadcastChannel or createImageBitmap | Shows an explanation and does not start | `detectFarmFeatures()` |
| Other tabs are open during a reset | Their image database connections close on `versionchange`; if the delete is still blocked, the page asks you to close the other tabs | `resetSolutionData()` reports `blocked` |

## 5. Resources and cleanup

- Each tab opens a MessageBus, a PeerDiscovery (heartbeat timer), a control queue that is never started, an image database connection and a `visibilitychange` listener. After joining, each lane adds a queue instance (poll, renew and reclaim timers) and a Web Worker. Result previews and downloads use object URLs, revoked as soon as they are no longer shown.
- On leaving the route (`disconnectedCallback`) every lane stops, every Worker is terminated, every object URL is revoked, and `createTeardown()` closes the rest.
- Reset clears this namespace's tasks from `vanilla_coordination_tasks` (`clearNamespace()`; other namespaces are untouched) and the IndexedDB `vanilla_solution:<namespace>:blobs`.

## 6. Production gaps

- **Authorization and trust**: any same-origin page can read and write the queue and the images; a namespace is not a security boundary, and results returned by nodes are not verified. A production system needs identity, permissions and result verification.
- **Cross-device**: work is shared only within one browser profile on one machine. Distributed computing across devices needs backend coordination (see [ADR 0107](../decisions/0107-sharedworker-and-cross-device-transport-evaluation.md)).
- **Resource control**: lane counts do not adapt to CPU, battery or temperature; large images should be bounded in how much is decoded at once to avoid running out of memory.
- **Storage**: browsers may evict data when space runs low; production needs `navigator.storage.persist()`, retention and cleanup (the queue's `purge()`).
- **Processing quality**: only proportional downscaling and conversion; EXIF, colour profiles and orientation are not preserved.

## 7. Tests

- `tests/farm-model.test.js`: parameter validation, proportional downscaling, import limits and the remaining-space check, output naming, orphan detection, run statistics.
- `runFarmTests` in `tests/browser-runner.mjs`: in its own namespace, two real tabs process 8 test images and 1 broken image; it checks that both nodes processed images, outputs are 320×240 WebP, the broken image fails after 3 attempts and results can be downloaded; a second batch survives closing every tab mid-way and finishes after reopening; outputs match task results one to one with no orphans; reset clears everything.
