# POS v2 協定規格（草案）

- Issue：#16 · 決策：[ADR 0109](../../decisions/0109-pos-v2-webrtc-host-authority.md) · 計畫：[執行計畫](./2026-11-26-pos-v2-cross-device.md)
- 建立日期：2026-11-26
- 狀態：草案，隨 P1–P7 實作修訂；P8 併入 `docs/solutions/pos-v2.md`／`pos-v2.en.md`

本文件定義兩層協定：裝置與信令伺服器之間的**信令協定**，以及遠端裝置與主機之間的 **DataChannel 協定**。協定版本皆為 `1`。

---

## 1. 名詞

| 名詞 | 說明 |
| --- | --- |
| 主機（host） | 開著管理頁、持有房間的那一個瀏覽器分頁。每個 namespace 以 Web Lock `vanilla_solution:<ns>:host` 保證只有一個 |
| 房間 | 主機第一次啟用時產生的 `roomId`（128 bit 隨機值，base64url，22 字元）與 `hostSecret`（256 bit 隨機值），存在主機的 IndexedDB `vanilla_solution:<ns>:room` |
| 遠端裝置（peer） | 店員裝置與顧客手機。第二代除了管理頁以外的角色都是遠端裝置，即使和主機在同一台電腦上，也一樣經由信令與 DataChannel 連線 |
| `peerId` | 信令伺服器替每條 peer WebSocket 指定的隨機 id（128 bit，base64url）。只在該條 WebSocket 存活期間有效 |
| 授權（credential） | 主機簽發給遠端裝置的憑證，分成裝置、入桌、訂單查詢三種（第 5 節） |
| principal | 一條 DataChannel 驗證後代表的身分，例如 `device:<id>`、`table:<credentialId>` |

## 2. 網址

所有入口都在 `#/solutions/pos-v2/*`，hash query 共用以下參數：

| 參數 | 說明 |
| --- | --- |
| `room` | `roomId` |
| `sig` | 信令網址（`wss://…`），經 `encodeURIComponent` |
| `ns` | namespace，選填，預設 `solution-pos-v2` |

| 路由 | 用途 | 額外參數 |
| --- | --- | --- |
| `/solutions/pos-v2/admin` | 管理主機 | 無 |
| `/solutions/pos-v2/home` | 店家入口：列出已開放的桌號；有「店員加入」入口可輸入連線碼 | 無 |
| `/solutions/pos-v2/table` | 桌牌入口 | `t`：桌號 |
| `/solutions/pos-v2/join` | 店員配對（掃配對 QR Code） | `pair`：配對 token |
| `/solutions/pos-v2/track` | 訂單查詢（櫃檯交接） | `o`：訂單 id，`k`：查詢 token |
| `/solutions/pos-v2/order`、`/kitchen`、`/display` | 已配對店員裝置的角色畫面 | 無 |

- **連線碼的前提**：輸入連線碼的裝置要先開啟店家入口（`home`），才知道 `room` 與 `sig`。只有連線碼、沒有店家入口網址時無法加入。連線碼只在 DataChannel 內驗證，不經過信令伺服器。
- 主機頁從網址參數拿到 `sig` 時，要使用者確認才儲存。遠端裝置直接使用 QR Code 帶來的 `sig`：QR Code 由主機產生，信令伺服器由測試者自架，在信任範圍內（ADR 0109 決策 5）。

## 3. 信令協定

### 3.1 連線

- 端點：`<sig>/v1/rooms/<roomId>?role=host|peer`，WebSocket，文字訊框，每則 JSON 物件最大 16 KiB。
- 伺服器在 upgrade 時檢查 `Origin`，不在白名單就回 403。白名單由啟動參數或環境變數設定，預設 `https://raybird.github.io`、`http://localhost:*`、`http://127.0.0.1:*`。
- `roomId` 不是 22 字元的 base64url，或 `role` 不是 `host`／`peer` 時回 400。
- 只接受文字訊框；超過 16 KiB 的訊息以 close code 1009 關閉，二進位訊框以 1003 關閉。
- 訊息不是含字串 `t` 的 JSON 物件、或型別不認得時回 `{"t":"error","code":"BAD_MESSAGE"}`，不關閉連線（解析時丟棄 `__proto__`、`constructor`、`prototype`）。
- 每條連線限速：10 秒內最多 50 則訊息，超過就以 close code 4008 關閉。Worker 版的 `{"t":"ping"}` 由平台自動回應，不經過程式，也不計入限速。
- 每個房間最多 64 條 peer 連線，超過就以 4009 關閉。
- keepalive：用戶端可隨時送 `{"t":"ping"}`，伺服器回 `{"t":"pong"}`（Worker 版由平台自動回應，不喚醒 Durable Object）。Node 版另外每 30 秒送 WebSocket ping，60 秒沒有收到任何資料就以 1001 關閉。
- `GET /healthz` 回 `{"ok":true,"protocol":1,…}`；`GET /` 顯示已帶好信令位址的主機頁連結。

### 3.2 主機席位

1. 主機連線後送出 `{"t":"host-auth","secret":"<hostSecret>"}`。第一則訊息不是 `host-auth`、secret 不是 22–128 字元的 base64url，或連線 10 秒內沒有送出時，以 4001 關閉。
2. **第一個連上的主機綁定房間**：房間還沒有綁定時，伺服器記下 `SHA-256(secret)`，回 `{"t":"host-ready","peers":["<peerId>", …]}`。已經綁定時，雜湊相同才回 `host-ready`，不同就以 4001 關閉（主機頁顯示「這個房間已被其他主機使用」，並提供「重新產生房間」）。
3. 同一房間已有主機連線時，**新通過驗證的主機取代舊的**：舊連線收到 `{"t":"host-replaced"}` 後以 4002 關閉。這是主機分頁重新整理時的正常情況。
4. 綁定的保存：Node 伺服器存在記憶體，重啟後清空；Worker 存在 Durable Object storage。房間連續 24 小時沒有主機連線時清除綁定（Node 版每 30 秒檢查一次；Worker 版在主機離線時設 alarm，時間可用 `BINDING_TTL_MS` 調整）。
5. 綁定清空後到主機重新連上之前，任何知道 `roomId` 的人（`roomId` 印在公開的桌牌 QR Code 上）都能搶先綁定。這是 demo 接受的風險：主機會自動重連，空窗很短；真的被搶走時，在管理頁「重新產生房間」並重啟信令伺服器即可恢復（ADR 0109 決策 5）。

### 3.3 peer

1. peer 連線後收到 `{"t":"welcome","peerId":"…","hostOnline":true|false,"iceServers":[…]}`。`iceServers` 來自伺服器設定，預設是公共 STUN；架設者要用 TURN 時在伺服器設定，主機與 peer 都使用這份清單（主機在 `host-ready` 後也會收到 `{"t":"config","iceServers":[…]}`）。
2. 主機上線或離線時，伺服器通知所有 peer：`{"t":"host-online"}`、`{"t":"host-offline"}`。
3. peer 斷線時，伺服器通知主機：`{"t":"peer-left","peerId":"…"}`；新 peer 連線時通知主機：`{"t":"peer-joined","peerId":"…"}`。

### 3.4 轉送

| 方向 | 送出 | 伺服器轉送為 |
| --- | --- | --- |
| peer → 主機 | `{"t":"signal","data":{…}}` | 給主機：`{"t":"signal","from":"<peerId>","data":{…}}` |
| 主機 → peer | `{"t":"signal","to":"<peerId>","data":{…}}` | 給該 peer：`{"t":"signal","from":"host","data":{…}}` |

- `from` 一律由伺服器填入，用戶端送來的 `from` 會被覆寫。peer 不能指定 `to`，只能送給主機。
- 主機不在線時，peer 的 `signal` 會收到 `{"t":"error","code":"HOST_OFFLINE"}`，不排隊。
- 主機送給不存在的 peer 時收到 `{"t":"error","code":"PEER_NOT_FOUND","peerId":"…"}`。
- 信令只轉送 `data`，不解讀內容。授權、連線碼、訂單資料都不經過信令。

## 4. WebRTC 握手

### 4.1 誰發起

一律由 peer 發起：建立 `RTCPeerConnection`（`iceServers` 用 `welcome` 給的清單），建立 DataChannel `pos-v2`（ordered、reliable），送出 offer。主機只回應。

### 4.2 `signal.data` 的內容

| `kind` | 方向 | 欄位 |
| --- | --- | --- |
| `offer` | peer → 主機 | `sdp` |
| `answer` | 主機 → peer | `sdp` |
| `candidate` | 雙向 | `candidate`（`RTCIceCandidateInit`；`null` 表示收集完成） |
| `restart` | peer → 主機 | 無；表示 peer 要放棄目前的 PeerConnection，之後會送新的 offer |

採用 trickle ICE，不像 Lab 那樣等 2 秒收集完再一次送出。

### 4.3 主機真偽

不另外驗證主機真偽：信令伺服器由測試者自架，在信任範圍內，DTLS 指紋經由它交換。遠端裝置只要確認 DataChannel 是用 QR Code 上的 `room` 與 `sig` 建立的即可。正式上線需要的端到端驗證列在 ADR 0109 的正式上線差距。

### 4.4 逾時與失敗

- peer 送出 offer 後 15 秒內 DataChannel 沒有開啟，或 `iceConnectionState` 變成 `failed`：顯示「無法直連，所在網路可能需要 TURN」，並提供重試。不自動無限重試。
- DataChannel 關閉或心跳逾時（第 6.4 節）：peer 依退避策略重連，間隔 1、2、4、8、16、30 秒，之後固定 30 秒；收到 `host-online` 時立即重試。

## 5. 授權

主機只保存每種授權 secret 的 `SHA-256`，比對時用固定時間比較。所有 secret 都是 128 bit 以上的 `crypto.getRandomValues` 隨機值，以 base64url 表示。

### 5.1 裝置授權（店員）

1. 管理頁建立**配對票**：`pairToken`（放進配對 QR Code）與 6 位數 `pairingCode`（畫面顯示），有效 5 分鐘，期限內可以重複使用，每次申請都要管理端核准。
2. 裝置送 `pair.request`（帶 `pairToken` 或 `pairingCode`，加上裝置名稱），主機回 `{status:'pending', pairRequestId}`，管理頁出現待核准清單。
3. 管理端核准並指定角色（`order`／`kitchen`／`display`，廚房還要指定站台名稱，同一 namespace 內唯一）或拒絕。主機推送 `pair.approved`（帶 `credential`、`role`、`station`）或 `pair.rejected`。
4. 裝置把 `credential` 存在 localStorage `vanilla_solution:<ns>:credential:<roomId>`，之後每次連線都以 `auth` 帶上。
5. 管理端可以撤銷裝置；撤銷後該裝置的 DataChannel 收到 `grant.revoked`，之後的請求一律回 `UNAUTHORIZED`。

### 5.2 入桌授權（顧客）

1. 開桌時建立用餐場次 `{ id, tableId, openedAt, codeHash }` 與 6 位數入桌碼；同一桌同時只有一個開啟中的場次。管理端可以輪換入桌碼，舊碼立即失效，已取得的入桌授權不受影響。
2. 顧客送 `table.join {tableId, code}`。成功時主機簽發入桌授權（綁定 `diningSessionId`），每支手機各自一份，principal 為 `table:<credentialId>`。
3. 關桌時把場次標成已關閉。之後該場次的入桌授權不能送單（`SESSION_CLOSED`），但仍可查看自己已送出的訂單。再開桌會產生新場次與新入桌碼，舊授權不會自動轉移到新場次。
4. 嘗試次數：每條 DataChannel 連續錯 5 次後冷卻 60 秒；每張桌每分鐘最多 30 次錯誤，超過後該桌 60 秒內一律回 `RATE_LIMITED`，管理頁顯示該桌的錯誤次數。冷卻期間連正確的碼也拒絕。
5. 連線碼（5.1）套用相同的嘗試限制，以配對票為單位計算。

### 5.3 訂單查詢授權

- 顧客以入桌授權送出的訂單，自動屬於該 principal，可以直接查看。
- 店員點餐裝置送出的訂單，回應中帶回 `viewToken`，用來組成訂單 QR Code（`track?o=<orderId>&k=<viewToken>`）。`viewToken = base64url(HMAC-SHA-256(hostSecret, "pos-v2/view/v1|<orderId>"))`：主機不保存它，驗證時重新推導再比對；重送取回原訂單時也算得出同一個值。「重新產生房間」後舊的訂單 QR Code 全部失效。
- 任何連線送 `order.watch {orderId, token}`，成功後這條 DataChannel 取得該筆訂單的唯讀權限，並存進 localStorage 供重連使用。查詢授權只能看那一筆訂單。

### 5.4 送單去重

- 去重鍵是 `[principal, requestId]`（複合唯一索引），不是全域的 `requestId`。
- 處理順序：先以去重鍵查詢，**已存在就直接回傳原訂單**，不再檢查場次；不存在才檢查授權、場次是否開啟，然後建立。這樣「主機已寫入、回覆遺失、期間又關桌」的重送仍能取回原訂單（A7）。
- 桌位與場次一律取自入桌授權，忽略請求參數中的 `tableId`。

## 6. DataChannel 協定

### 6.1 訊息信封

每則訊息是一個 JSON 物件，文字訊框，最大 64 KiB：

```text
請求  { "v": 1, "type": "req",  "id": "<uuid>", "method": "<名稱>", "params": { … } }
成功  { "v": 1, "type": "res",  "id": "<uuid>", "ok": true,  "result": { … } }
失敗  { "v": 1, "type": "res",  "id": "<uuid>", "ok": false, "error": { "code": "…", "message": "…" } }
推送  { "v": 1, "type": "push", "topic": "<名稱>", "rev": <整數>, "data": { … } }
心跳  { "v": 1, "type": "ping", "ts": <ms> } / { "v": 1, "type": "pong", "ts": <ms> }
```

- 解析時丟棄 `__proto__`、`constructor`、`prototype` 鍵；不是物件、`v` 不是 1、缺必要欄位或超過大小，都算不合格訊息。有 `id` 的回 `BAD_MESSAGE`，沒有的直接丟棄。同一條連線累計 20 則不合格訊息後，主機關閉它。主機統計每條連線的不合格訊息數，顯示在管理頁。
- `bufferedAmount` 超過 1 MiB 時，主機暫停對該連線推送，等 `bufferedamountlow` 後改送一份最新快照，不補送中間的推送。

### 6.2 方法與權限

| 方法 | 誰能呼叫 | 說明 |
| --- | --- | --- |
| `auth` | 任何連線 | `{credentials: [授權], watches: [{orderId, token}]}`：裝置授權或入桌授權最多一份，查詢授權最多 50 筆。回傳 `{device, table, watches, rejected, rev, topics}`；驗證失敗的列在 `rejected`（`{kind, id, code}`），用戶端據此刪掉本機失效的授權 |
| `pair.request` | 任何連線 | 5.1 |
| `table.listOpen` | 任何連線 | 已開桌的桌號與名稱，不含入桌碼 |
| `table.join` | 任何連線 | 5.2 |
| `order.watch` | 任何連線 | 5.3 |
| `menu.get` | 點餐裝置、入桌授權 | 菜單 |
| `order.place` | 點餐裝置、入桌授權（場次開啟中） | `{items, requestId}`；點餐裝置可另帶 `tableId` |
| `order.act` | 廚房：`claim`／`ready`／`takeover`；叫號：`pickup` | 沿用第一代的 `decideTransition`；`actor` 由主機依授權填入，不採用參數（廚房為站台名稱，叫號為 `display:<裝置名稱或 id>`）。所有 `order.act` 在主機依序執行 |
| `sync` | 任何已驗證的連線 | 重新取得自己角色的完整快照 `{rev, topics}`（`topics` 的鍵與內容同 6.3 的推送）。`auth`、`table.join`、`order.watch` 的結果也附上同樣的快照 |

取消訂單（`cancel`）只在主機的管理頁操作，不開放給遠端裝置。

### 6.3 推送

主機每次寫入成功後，在 100 ms 內合併變更，依角色推送**完整快照**（資料量小，不做差異）。`rev` 是主機遞增的版本號，peer 發現跳號或重連時呼叫 `sync`。

| topic | 對象 | 內容 |
| --- | --- | --- |
| `kitchen` | 廚房 | 待處理與備餐中的訂單（含桌號、場次、品項、站台），加上各站台在線狀態 |
| `display` | 叫號 | 備餐中與請取餐的號碼 |
| `order` | 點餐裝置 | 最近送出的訂單與取餐號 |
| `myOrders` | 入桌授權、查詢授權 | 自己可見的訂單：取餐號、狀態、`aheadCount`（只有待處理時才有）、桌號 |
| `session` | 入桌授權 | 場次狀態（開啟中、已關閉） |
| `pair.approved`／`pair.rejected`／`grant.revoked` | 相關連線 | 5.1 |

`aheadCount` 的定義：全店狀態為待處理、且取餐序號比這筆小的訂單數；備餐中的不算。

### 6.4 心跳與在線

- 主機每 5 秒對每條連線送 `ping`；peer 回 `pong`。
- 對方直接消失（例如主機分頁被關閉）時，DataChannel 的 `close` 可能很久才觸發：peer 以心跳判定主機失聯後，主動丟掉目前的 PeerConnection 並依 4.4 的退避重連。
- 主機 15 秒沒收到某條連線的任何訊息，就視為離線並關閉它；peer 15 秒沒收到主機的任何訊息，就視為主機失聯，開始重連。
- **遠端站台接手**：站台的 DataChannel 已關閉，且最後一則訊息距今超過 15 秒，其他廚房才能 `takeover`。主機把「判斷站台離線」與寫入排在同一個佇列裡依序執行，不會同時讓兩個站台都接手成功。

### 6.5 錯誤碼

沿用第一代：`INVALID_ORDER`、`NOT_FOUND`、`INVALID_TRANSITION`、`CONFLICT`、`UNSUPPORTED`。新增：

| 錯誤碼 | 說明 |
| --- | --- |
| `UNAUTHORIZED` | 沒有授權、授權無效或已撤銷 |
| `FORBIDDEN` | 授權有效，但角色不能呼叫這個方法 |
| `SESSION_CLOSED` | 入桌授權所屬的場次已關閉 |
| `CODE_INVALID` | 入桌碼或連線碼錯誤 |
| `RATE_LIMITED` | 嘗試次數超過上限，冷卻中 |
| `PAIRING_EXPIRED` | 配對票已過期 |
| `BAD_MESSAGE` | 不合格訊息 |

peer 端另有兩個只在本機產生、不經過網路的狀態：`HOST_UNAVAILABLE`（主機失聯）、`PENDING`（已送出但尚未收到回覆）。

## 7. 中斷恢復

- peer 送出 `order.place` 前，先把 `{requestId, items, createdAt}` 存進 localStorage `vanilla_solution:<ns>:pending:<roomId>`，收到成功或明確失敗的回覆後才刪除。
- 重連後依序：`auth` → 對每筆待確認的請求以原 `requestId` 重送 `order.place` → `sync`。畫面在這段期間顯示「待確認」，不顯示送出失敗。
- 主機重新整理：從 IndexedDB 讀回房間、授權雜湊、桌位與場次，重新取得 Web Lock 與主機席位。peer 收到 `host-online` 後重新握手並 `auth`，不需要重新配對或輸入入桌碼。

## 8. 主機端資料

資料庫 `vanilla_solution:<ns>:orders`（`POS_V2_SCHEMA_VERSION = 1`）：

| store | 內容 |
| --- | --- |
| `products`、`meta` | 同第一代 |
| `orders` | 第一代欄位，加上 `principal`、`source`（`device`／`table`）、`tableId`、`diningSessionId`；`[principal, requestId]` 複合唯一索引 |
| `tables` | 桌號、名稱 |
| `sessions` | 用餐場次；`tableId` 索引 |
| `credentials` | 各種授權的 secret 雜湊、種類、角色、站台、場次、撤銷狀態 |
| `pairing` | 配對票與待核准的申請 |

房間（`roomId`、`hostSecret`）存在另一個資料庫 `vanilla_solution:<ns>:room`。「重設 demo 資料」只刪除 `orders` 資料庫，**保留房間**，`roomId` 不變，已印出的桌牌 QR Code 仍然可用。管理頁另外提供「重新產生房間」：會產生新的 `roomId` 與 `hostSecret`，所有 QR Code 與已配對的裝置都要重新設定，執行前要使用者確認。主機席位被搶走時，也用它恢復。
