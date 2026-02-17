# ADR 0015: 使用者個人資料與靜態資源管理 (User Profile & Asset Management)

## 上下文
為了增強專案的實用性與個人化體驗，需要引入使用者個人資料（Profile）功能。這涉及到如何管理靜態資源（如預設頭像）以及如何處理使用者上傳的圖片。

## 決策
1.  **混合式資源管理**：
    *   **預設資源**：將預設頭像存放於 `assets/images/`，並透過相對路徑引用。
    *   **動態資源**：使用者上傳的圖片透過 `FileReader` 轉為 `DataURL` (Base64)，暫存於 Store 中。
2.  **Store 擴充**：
    *   在 `appStore` 中新增 `userProfile` 物件，包含 `name`, `bio`, `avatar`。
    *   利用現有的 LocalStorage 同步機制，自動保存使用者的個人資料修改。

## 後果
- **優點**: 無需後端儲存服務即可實現「更換頭像」的互動體驗。
- **優點**: 資料持久化於 LocalStorage，重新整理頁面後設定依然存在。
- **缺點**: Base64 圖片會佔用較多 LocalStorage 空間（上限約 5MB），僅適合小型圖片。若需處理大圖，未來應考慮遷移至 IndexedDB。
