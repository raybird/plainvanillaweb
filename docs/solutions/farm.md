# Browser Computing Farm

> **更新日期**：2026-11-25  
> **English**：[Browser Computing Farm](./farm.en.md)  
> **入口**：[#/solutions/farm](#/solutions/farm) · **Issue**：#11 · **慣例**：[Reference App 慣例](./conventions.md)

同一台機器上的多個分頁一起處理一批本機圖片（縮放與轉換格式）的範例。任務放在 `DurableTaskQueue` 的 IndexedDB 持久佇列，每個分頁可以選擇加入處理，從佇列認領任務，在 Web Worker 內用 OffscreenCanvas 處理。重點在示範：節點中途關閉或重新整理時任務會被重新認領，所有分頁都關閉後重新開啟也能繼續；大型二進位資料不進佇列；過期租約留下的結果不會蓋掉新結果。

圖片只存在這台瀏覽器，不會上傳。**多分頁不一定比較快**：同一台機器的 CPU、記憶體與 GPU 是共用的，頁面的批次紀錄會列出每一批的實測耗時與吞吐量，讓你自己比較。

## 1. 操作方式

- 開啟 [Farm](#/solutions/farm)，用「選擇圖片」匯入本機圖片，或按「產生 8 張測試圖片」。勾選「加入 1 張損壞圖片」可以展示失敗與重試。
- 設定最大寬度（16–4096，不放大）、格式（WebP、JPEG、PNG）與品質，按「建立批次」。
- 在一個或多個分頁按「加入處理」，可以選 1–4 條 lane（同一個分頁同時處理幾張）。沒有加入的分頁只觀察進度、不認領任務。
- 批次完成後可以預覽與個別下載結果。「重試失敗任務」把失敗的任務重新排入佇列。
- 「重設 demo 資料」清除佇列中這個 namespace 的任務，並刪除圖片資料庫。
- 加上 `?ns=<名稱>` 可以開一份獨立的資料（例如 `#/solutions/farm?ns=bench-2`）。

匯入限制：最多 40 張、單檔 15 MB、總共 150 MB；瀏覽器支援 `navigator.storage.estimate()` 時，剩餘空間不足以存放輸入加輸出（約兩倍）就拒絕匯入。

## 2. 架構

```text
  分頁 A（加入，2 lane）    分頁 B（加入，1 lane）    分頁 C（只觀察）
   lane1  lane2               lane1
     │      │                   │
     │  DurableTaskQueue（每條 lane 一個 workerId）認領、續租、完成
     │      │                   │
     ▼      ▼                   ▼
  Web Worker + OffscreenCanvas（每條 lane 一個 Worker）
     │
     ├─ IndexedDB  vanilla_coordination_tasks        任務：payload 只有 inputId 與參數
     └─ IndexedDB  vanilla_solution:<ns>:blobs       inputs／outputs（Blob）／runs
  MessageBus 'farm:changed'：有變動就通知；各分頁重讀上面兩個資料庫
  PeerDiscovery：顯示正在處理的節點與 lane 數
```

| 檔案 | 用途 |
| --- | --- |
| `components/pages/solutions/farm/farm-model.js` | 參數驗證、匯入限制、輸出命名、孤兒輸出判定、批次統計（純函式） |
| `components/pages/solutions/farm/farm-image.js` | 縮放與轉檔、測試圖片產生；Worker 與主執行緒共用 |
| `workers/image-farm.worker.js` | module Worker，收 Blob、回傳處理後的 Blob |
| `components/pages/solutions/farm/farm-processor.js` | 啟動 Worker；不支援時降級到主執行緒 |
| `components/pages/solutions/farm/farm-store.js` | 圖片 Blob store（IndexedDB） |
| `components/pages/solutions/farm/farm-session.js` | 每個分頁的工作階段：lane、handler、通知、重讀、孤兒清理、重設 |
| `components/pages/solutions/farm/FarmPage.js` | 畫面 |

## 3. 資料流

1. **匯入**：圖片存進 `inputs`（`{ id, name, type, size, blob, createdAt }`）。張數與容量檢查和寫入在同一個 `readwrite` transaction 內，兩個分頁同時匯入也不會一起突破上限。
2. **建立批次**：先把批次清單寫進 `runs`（`status: 'creating'`、固定的 `runId`、輸入 id 與名稱、參數），再為每張輸入 `enqueue` 一個 `image.process`（handler 版本 1）任務，payload 是 `{ runId, inputId, name, params }`，`idempotencyKey` 為 `runId:inputId`（`runTaskKey()`），`maxAttempts` 為 3；全部排入後把任務 id 寫回批次並改成 `ready`。建立者在這段期間持有批次的 Web Lock `vanilla_solution:<ns>:run:<runId>`。
3. **認領與處理**：lane 認領任務後從 `inputs` 讀出 Blob，交給 Worker 處理；佇列在處理期間自動續租。
4. **寫入輸出**：輸出 Blob 以 `taskId:leaseId` 為 key 寫進 `outputs`，handler 的 result 只回傳這個 key 與尺寸、大小、耗時、節點。佇列在 `completeAtomic` 時確認租約仍然有效，才把 result 寫進任務。
5. **通知與重讀**：佇列事件（認領、完成、失敗、重新排程、回收）觸發 `farm:changed`；各分頁合併通知，最多每 200 ms 重讀一次任務、輸入、輸出與批次。

**為什麼輸出 key 要帶 `leaseId`**：節點 A 處理到一半被凍結（例如分頁進入背景），租約到期，節點 B 重新認領並完成。之後 A 醒來寫完輸出，但它的 `completeAtomic` 會因為租約已失效被拒絕。兩份輸出的 key 不同，A 不會蓋掉 B 的結果；任務 result 只引用 B 的那份。A 留下的那份是**孤兒輸出**：沒有被任何已完成任務引用、也不屬於執行中的租約，超過 30 秒寬限時間後在下一次重讀時刪除（`findOrphanOutputs()`）。

**建立中途中斷**：建立者在排入一半時關閉，批次停在 `creating`。任何分頁重讀時看到 `creating` 的批次，就以 `ifAvailable` 嘗試批次鎖：取得到代表建立者已不在，依清單用同一組冪等鍵補齊（已排入的得到同一個任務，不會重複）並標記 `ready`；取不到代表建立者還在，2 秒後再檢查。補齊時批次已被重設刪除的話，`updateRun()` 不會把批次寫回，這次排入的任務會被取消。沒有 Web Locks 時，`creating` 批次放置 15 秒後才補齊。

**為什麼不把 Blob 放進佇列**：`DurableTaskQueue` 刻意拒收 Blob、ArrayBuffer 與 TypedArray（`SERIALIZATION_ERROR`），大型二進位資料會拖慢認領時的單一 readwrite transaction。見 [Coordination](../coordination.md) 的二進位資料整合模式。

**批次統計**：耗時從建立批次算到最後一張完成；吞吐量是完成張數除以耗時；也列出每個節點完成幾張、幾張重試過。比較單節點與多節點時，用同一組圖片與參數各建一個批次，對照批次紀錄。

## 4. 故障模式

| 情境 | 預期行為 | 如何驗證 |
| --- | --- | --- |
| 節點處理中關閉或重新整理 | Web Lock 隨分頁釋放，其他節點提早回收；否則等租約（5 秒）到期後回收，由其他節點重新認領。被中斷的那次也計入 3 次上限 | 瀏覽器測試處理中關閉節點 |
| 所有分頁都關閉 | 任務與圖片都在 IndexedDB；重新開啟、加入處理後繼續未完成的任務 | 瀏覽器測試關閉全部分頁後重新開啟 |
| 停止處理 | 與關閉分頁相同：不改寫任務，執行中的任務由其他節點回收 | `FarmSession.leave()` |
| 過期租約寫完結果 | `completeAtomic` 拒絕；輸出成為孤兒，寬限後刪除，不覆蓋新結果 | `tests/farm-model.test.js`；瀏覽器測試核對輸出與任務一一對應 |
| 圖片無法解碼 | 依退避重試，3 次後標為失敗並顯示錯誤；可按「重試失敗任務」 | 瀏覽器測試損壞圖片 |
| 同一批次重送 | `idempotencyKey` 去重，不會重複建立任務 | `FarmSession.createRun()` |
| 建立批次途中關閉分頁 | 其他分頁或下次開啟時依批次清單補齊同一個批次，沒有重複任務或沒有批次的任務 | 瀏覽器測試只排入一半任務後關閉建立者 |
| 初始化中途離開路由 | 加入處理還在啟動 Worker 或佇列時離開，已建立的 lane 撤回，不留下 Worker 或認領任務的佇列 | 瀏覽器測試在加入處理的不同階段釋放工作階段 |
| 容量不足 | 超過張數、單檔或總容量上限的檔案逐一列出原因並略過；剩餘空間不足時整批拒絕；兩個分頁同時匯入也不會突破上限 | `tests/farm-model.test.js`；瀏覽器測試兩個分頁同時各匯入 30 張 |
| 不支援 OffscreenCanvas 或 module Worker | 改在主執行緒處理，畫面可能短暫卡頓；頁面標示缺少的能力 | `ImageProcessor.init()` |
| 不支援要求的輸出格式 | canvas 改輸出 PNG；結果的副檔名與 MIME type 依實際格式 | `outputName()` |
| 不支援 IndexedDB、BroadcastChannel 或 createImageBitmap | 顯示說明，不啟動 | `detectFarmFeatures()` |
| 重設時其他分頁開著 | 其他分頁的圖片資料庫連線收到 `versionchange` 後關閉；仍被擋住時提示關閉其他分頁 | `resetSolutionData()` 回報 `blocked` |

## 5. 資源與清理

- 每個分頁開啟：MessageBus、PeerDiscovery（心跳計時器）、一個不啟動的控制用佇列、圖片資料庫連線、`visibilitychange` 監聽；加入處理後每條 lane 另有一個佇列實例（輪詢、續租、回收計時器）與一個 Web Worker。結果預覽與下載使用 object URL，不再顯示時立即 `revokeObjectURL`。
- 離開路由時（`disconnectedCallback`）停止所有 lane、終止 Worker、釋放全部 object URL，再由 `createTeardown()` 關閉其餘資源。加入處理、停止處理與釋放依序執行；加入處理全部建立成功才生效，中途已釋放就撤回已建立的 Worker 與佇列。
- 重設清除：`vanilla_coordination_tasks` 中這個 namespace 的任務（`clearNamespace()`，其他 namespace 不受影響），以及 IndexedDB `vanilla_solution:<namespace>:blobs`。

## 6. 正式上線差距

- **授權與信任**：任何同源頁面都能讀寫佇列與圖片，namespace 不是安全邊界；節點回傳的結果也沒有驗證。正式系統需要身分、權限與結果驗證。
- **跨裝置**：只在同一台機器的同一個瀏覽器設定檔內分工。跨裝置分散運算需要後端協調（見 [ADR 0107](../decisions/0107-sharedworker-and-cross-device-transport-evaluation.md)）。
- **資源控制**：沒有依 CPU、電量或溫度調整 lane 數；大量圖片時應限制同時解碼的大小，避免記憶體不足。
- **儲存**：瀏覽器可能在空間不足時清除資料；正式系統需要 `navigator.storage.persist()`、保存期限與清理策略（佇列的 `purge()`）。
- **處理品質**：只做等比例縮小與轉檔；沒有保留 EXIF、色彩描述檔或方向資訊。

## 7. 測試

- `tests/farm-model.test.js`：參數驗證、等比例縮小、匯入限制與剩餘空間檢查、輸出命名、孤兒輸出判定、批次統計。
- `tests/browser-runner.mjs` 的 `runFarmTests`：在獨立 namespace 下以兩個真實分頁處理 8 張測試圖片與 1 張損壞圖片，核對兩個節點都有處理、輸出為 320×240 WebP、損壞圖片重試 3 次後失敗、結果可下載；第二批處理中關閉全部分頁，重新開啟後完成；輸出與任務結果一一對應、沒有孤兒；重設後清空；在加入處理的不同階段釋放工作階段，不留下 lane、Worker 或佇列；批次清單寫入、只排入一半任務時建立者關閉，另外兩個分頁補齊同一個批次且沒有重複任務；兩個分頁同時匯入不突破 40 張上限。
