# 部署指南 (Deployment Guide)

由於本專案為純靜態應用，您可以輕鬆部署至任何託管平台 (GitHub Pages, Vercel, Netlify)。

## GitHub Pages 部署

GitHub Pages 是本專案的首選部署目標。

### 路由問題與解法
GitHub Pages 是靜態伺服器，不支援 SPA 的 `History API` (例如 `/search` 這種路徑)。
我們採用 **Hash Router** (`/#/search`) 配合 **404 Redirect Hack** 來解決此問題。

1.  **Hash Router**: 預設使用 `/#/`，伺服器始終只回傳 `index.html`。
2.  **404.html**: 如果使用者手動輸入 `/search` (無 Hash)，GitHub Pages 會回傳自訂的 `404.html`。
3.  **自動修復**: `404.html` 中的腳本會將路徑轉回 Hash 格式並重導至首頁。

### 設定步驟
1.  前往 GitHub Repo 的 **Settings > Pages**。
2.  在 **Build and deployment** 下，選擇 **Deploy from a branch**。
3.  選取 `master` 分支與 `/ (root)` 目錄。
4.  儲存。

## 本地開發
由於使用了 ES Modules (`import/export`) 和 Service Worker，您不能直接用瀏覽器打開 `index.html`。必須透過 HTTP 伺服器運行：

```bash
# Python 3
python3 -m http.server

# Node.js (npx)
npx serve .
```
