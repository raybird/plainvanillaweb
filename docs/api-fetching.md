# 原生非同步請求 (Async API Fetching)
原生 Web Components 在 connectedCallback 中執行 fetch 的最佳實踐。
## 核心要點
- 顯示 Loading 狀態
- Error 處理與 UI 回饋
- 渲染安全轉義後的資料

## 實戰範例：GitHub 專案搜尋
本專案在 `components/pages/RepoSearch.js` 中實作了完整的 GitHub API 串接範例。

### 關鍵程式碼解析
```javascript
async search(query) {
    this.loading = true;
    this.update(); // 觸發渲染 Loading 狀態
    const res = await fetch(\`https://api.github.com/search/repositories?q=\${query}\`);
    this.repos = (await res.json()).items;
    this.loading = false;
    this.update(); // 渲染結果
}
```
透過將 `fetch` 邏輯與 `update()` 方法結合，我們能在不使用框架 Reactivity 系統的情況下，實現流暢的 UI 更新。
