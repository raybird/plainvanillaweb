# ADR 0078: Web Share 教學頁與 Query-Aware Hash Routing

## 狀態

Accepted

## 背景

專案既有 `web-share` 技術文件，但缺少可互動的 Lab 範例。另在 hash router 下，當路徑帶 query（例如 `#/lab/web-share?share_title=...`）時，`exact` 比對會失敗，導致 Share Target 進站頁無法穩定命中。

## 決策

新增 `#/lab/web-share` 教學頁，並同步強化路由匹配策略：

1. 實作 `WebSharePage`，示範 `navigator.share()`、取消分享處理、剪貼簿降級。
2. 在 `manifest.json` 將 `share_target.action` 指向 `#/lab/web-share`。
3. 於 hash router 新增 `currentRoutePath`（忽略 query）供 `x-route` 與 `x-switch` 比對。
4. 教學頁支援解析 `share_title/share_text/share_url`，展示 Share Target 接收結果。
5. 更新 `docs/web-share.md`、`LabIndex`、`Docs` 導覽與映射。

## 後果

- **優點**：Web Share 主題有可操作教學，手機端可直接驗證系統分享流程。
- **優點**：Hash 路由對 query 更穩定，可支援更多深連結與外部導入場景。
- **缺點**：需維護新的 Lab 頁與路由映射，後續新增 query 型路由時仍需一致性測試。
