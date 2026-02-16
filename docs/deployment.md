# 部署指南 (Deployment Guide)

由於本專案為純靜態應用，您可以輕鬆部署至任何託管平台。

## 推薦方案：GitHub Pages (免費)
1. 前往 GitHub Repo 的 **Settings > Pages**。
2. 在 **Build and deployment** 下，選擇 **Deploy from a branch**。
3. 選取 `master` 分支與 `/ (root)` 目錄。
4. 儲存後，您的應用程式將在數分鐘內上線。

## 自動化部署 (CI/CD)
本專案已內建 `.github/workflows/deploy.yml` 範本，每次 Push 都會自動執行測試。
