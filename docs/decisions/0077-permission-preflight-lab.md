# ADR 0077: 權限預檢教學頁與鏡頭啟動策略

## 狀態

Accepted

## 背景

行動裝置的鏡頭流程在不同瀏覽器策略下常出現「瞬間啟動後黑畫面」或被系統回收。為了讓教學內容更穩定，需將權限檢查與裝置啟動流程拆成可觀察、可操作的步驟。

## 決策

建立 `#/lab/permissions` 教學頁，採用 Vanilla-first 的權限預檢模式：

1. 顯示 `Secure Context` 與 `Permissions API` 可用性。
2. 提供 `camera/microphone/geolocation` 權限狀態檢查。
3. 以使用者互動觸發 `getUserMedia()` 啟動鏡頭。
4. 在頁面離開與手動停止時主動 `track.stop()` 清理資源。
5. 文件端新增 `docs/permissions-preflight.md`，並與 Docs/Lab 雙向快參照整合。

## 後果

- **優點**：教學流程更貼近實務，能降低行動裝置黑畫面與權限誤用。
- **優點**：將「權限預檢」與「裝置啟動」責任分離，便於日後擴充更多硬體 API。
- **缺點**：多一個主題頁與映射維護成本，新增硬體主題時需同步更新導覽。
