# ADR 0104: 基於 Web Locks 的領導者選舉與跨分頁 RPC 機制

## 狀態
已接受 (Accepted)，2026-11-24。

## 背景
[ADR 0103](./0103-browser-coordination-foundation.md) 建立了跨執行環境訊息信封、`BroadcastService`、`MessageBus` 與 `Store` 同步隔離（Phase 1）。在此基礎上，許多跨分頁情境仍需要互斥控制與可預測的雙向請求／回應（Epic #2 / Issue #4）：

1. **單一協調者互斥**：多個同源分頁或 Worker 同時間只能有一個角色（例如後續 Phase 3 的共享連線持有者）對同一資源擁有領導權；單靠 `BroadcastChannel` 訊息或 `heartbeat` 無法提供互斥保證，容易在啟動競態或分頁假死時產生雙重主節點（split-brain）。
2. **可預測的跨分頁 RPC**：`MessageBus` 屬於單向 fire-and-forget 廣播，缺乏請求白名單、唯一／指定提供者路由、`correlationId` 關聯、逾時清理、`AbortSignal` 取消與錯誤序列化。

## 決策

### 1. 模組分層與無副作用邊界（延續 ADR 0101）
- **`lib/leader-election.js`**：僅依賴 `lib/base-service.js` 與 `lib/broadcast-channel.js`，匯出 `LeaderElection` 與 `createLeaderElection()`。
- **`lib/rpc-channel.js`**：僅依賴 `lib/base-service.js`、`lib/broadcast-channel.js` 與 `lib/message-bus.js`，匯出 `RpcChannel`、`createRpcChannel()`、`RpcError`、`RPC_ERROR_CODES`、`serializeRpcError()`、`deserializeRpcError()`。
- **`lib/coordination.js`** 與 **`lib/vanilla-sdk.js`**：重新匯出上述類別與工廠函式；**匯入時絕不主動請求鎖、開啟通道或建立計時器**。
- **`lib/core.js`**：維持既有輕量核心邊界與 `CORE_EXPORTS` 不變。

### 2. Leader Election：Web Locks 互斥與背景凍結策略
- **唯一互斥依據**：僅使用具 `namespace` 與 `scope` 隔離的原生 `navigator.locks.request(lockName, { mode: 'exclusive', ... })`（鎖名格式 `${lockPrefix}:${encodeURIComponent(namespace)}:${encodeURIComponent(scope)}`，避免段內冒號造成碰撞）。
  - **禁止使用 `{ steal: true }`**，避免無意搶走他頁仍持有的互斥鎖。
  - **禁止不具互斥保證的假降級**：不支援 Web Locks API 時，`supported` 為 `false`、角色維持 `'unsupported'`、`start()` 明確回傳 `{ acquired: false, role: 'unsupported', supported: false }`，絕不以 `localStorage` 輪詢或 heartbeat 宣稱互斥。
- **兩段式取得與非阻塞 `start()`**：
  1. 先以 `{ mode: 'exclusive', ifAvailable: true }` 立即探測（遵守 W3C Web Locks 規格，不與 `signal` 同時傳入）：若無人持鎖即取得鎖並切為 `'leader'`，透過受控的 deferred Promise 維持持鎖直到 `release()`、`stop()`、`dispose()` 或分頁關閉／重載。
  2. 若鎖已被其他分頁持有，立即將角色切為 `'follower'` 並於背景以 `{ mode: 'exclusive', signal }` 排隊等待接管，使 `await election.start()` 對 follower 不會永久阻塞。原 leader 釋放鎖、重載或關閉分頁後，瀏覽器自動喚醒排隊中的下一個上下文，推進 `epoch` 並發出 `elected`（`takeover: true`）與 `role-change` 事件。
- **Heartbeat 僅作可觀測性**：注入選用 `MessageBus` 且設定 `heartbeatIntervalMs > 0` 時，leader 會定期廣播 `__coord:leader:heartbeat`（含 `nodeId`、`epoch`、`scope`）；followers 僅據此更新 `observedLeader` 並發出 `leader-heartbeat` 事件，**永遠不以 heartbeat 逾時作為奪鎖或判斷互斥的依據**。
- **背景凍結（Page Lifecycle `freeze` / `resume`）限制與對策**：
  - 瀏覽器凍結背景分頁時會暫停計時器與 JS 執行，但該分頁**仍可能持續持有 Web Lock**；此時雖然觀測 heartbeat 停止，其他分頁仍受鎖保護而不會產生雙重 leader，代價是可能短暫影響接管可用性。
  - 預設 `releaseOnFreeze: false` 保守維持互斥；對可容忍主動交接的場景提供顯式 opt-in `releaseOnFreeze: true`，於 `document` 觸發 `freeze` 時主動釋放持鎖並於 `resume` 時重新參與競選。

### 3. Cross-Tab RPC：白名單、生命週期與副作用邊界
- **建立於 Phase 1 `MessageBus`**：使用內部主題 `__rpc:req`、`__rpc:res`、`__rpc:cancel`（限 `receive: 'remote'`），可共用外部注入的 `bus` 或自建專屬實例。
- **方法白名單與路由**：
  - 僅允許呼叫透過 `register(method, handler)` 顯式註冊的方法，阻擋 `__proto__`、`constructor`、`prototype`；未註冊方法於明確 `target` 時立即回傳 `METHOD_NOT_FOUND`，於唯一提供者模式（`target: null`）時由非提供者靜默忽略。
  - 支援明確指定 `target` 節點或 `target: null`（同 `namespace` 唯一提供者；同實例已註冊時預設優先走本地非同步執行路徑，除非指定 `allowLocal: false`）。
- **請求追蹤、逾時、取消與清理**：
  - 每個請求配發唯一 `correlationId`，並支援 `timeoutMs` 與外部 `AbortSignal`。
  - 逾時（`TIMEOUT`）、主動取消（`ABORTED`）或通道關閉（`CHANNEL_CLOSED`）時立刻移除 `_pending`、清除計時器與 `signal` 監聽，確保 `pendingCount` 歸零且不洩漏資源。
  - 若底層不支援傳輸層（`!supported`），遠端呼叫立即以 `TRANSPORT_UNAVAILABLE` 失敗，不空等 timeout。
  - 逾時或遲到的重複回應會被安全忽略並發出 `duplicate-response` 事件；錯誤經 `serializeRpcError` / `deserializeRpcError` 保留 `code`、`message`、`remoteName` 與可結構化複製的 `data`。
- **明確不承諾事項（非目標）**：
  - **絕不自動重試**任何 RPC 呼叫，避免具副作用的方法被重複執行。
  - **取消不等同回滾**：逾時或 `AbortSignal` 會送出 best-effort 取消通知觸發遠端 `context.signal.abort()`，但不會自動復原遠端已經產生的副作用。
  - **同源不等同授權**：`scope` 與 `namespace` 不是安全邊界，禁止透過 RPC 參數或回應傳遞憑證，亦禁止註冊任意可執行指令派發器（如 eval／動態函式查找）。

## 後果
- **優點**：同 origin 同 scope 互斥性由瀏覽器原生 Web Locks 保證，支援分頁關閉與重載自動接管；跨分頁 RPC 具備嚴格清理、確定性錯誤碼與不重試副作用的安全語意。
- **代價**：背景凍結分頁若採預設 `releaseOnFreeze: false` 會延後接管至喚醒或關閉；`unique provider` 模式（`target: null`）依賴呼叫方確保該方法於同 namespace 僅有一個活躍註冊者，若同時有多個提供者並存會產生重複回應（由 `duplicate-response` 事件協助觀測）。
- **相關文件**：見 [跨執行環境協作指南](../coordination.md)、[ADR 0071](./0071-web-locks-integration.md) 與 [ADR 0103](./0103-browser-coordination-foundation.md)。
