# Solutions 文件範本

> **更新日期**：2026-11-25  
> **English**：[Reference App Doc Template](./reference-app-template.en.md)  
> **相關**：[Reference App 慣例](./conventions.md)

新增 reference app 時，複製下方「範本」到 `docs/solutions/<slug>.md`，英文版寫在 `docs/solutions/<slug>.en.md`，兩份章節一致、開頭互相連結。每一節都要有內容；不適用的寫「不適用」並說明原因，不要刪掉。

---

## 範本

```markdown
# <範例名稱>

> **更新日期**：YYYY-MM-DD  
> **English**：[<English title>](./<slug>.en.md)  
> **入口**：[#/solutions/<slug>](#/solutions/<slug>) · **Issue**：#<編號>

一段話說明這個範例解決什麼問題、展示哪些原生能力的組合。

## 1. 操作方式
- 開啟方式（需要幾個視窗、各自的路由）
- 一次完整流程的步驟
- 如何重設 demo 資料

## 2. 架構
- 元件與模組清單（檔案路徑）
- 使用的 coordination API 與用途
- 架構圖（ASCII 或文字說明：誰持有權威狀態、誰只是讀取）

## 3. 資料流
- 資料模型與 `SCHEMA_VERSION`
- 狀態轉移（列出所有合法轉移；不合法的轉移如何被拒絕）
- 寫入路徑：哪個 transaction 或鎖保證原子性
- 通知路徑：發出哪些 MessageBus 主題，收到後如何重讀權威狀態

## 4. 故障模式
| 情境 | 預期行為 | 如何驗證 |
| --- | --- | --- |
| 重新整理 | | |
| 視窗關閉後重開 | | |
| 晚加入的視窗 | | |
| 並行操作同一筆資料 | | |
| 離線 | | |
| 儲存空間不足 | | |
| 瀏覽器不支援必要能力 | | |

## 5. 資源與清理
- 開啟的資源與釋放時機
- 重設時清除哪些資料（資料庫名稱、key、佇列 namespace）

## 6. 正式上線差距
- 授權與身分
- 交易與付款
- 跨裝置同步與後端
- 個資與稽核
- 其他（效能、規模、合規）

## 7. 測試
- 單元測試檔案與涵蓋內容
- 多分頁瀏覽器測試涵蓋的流程
```
