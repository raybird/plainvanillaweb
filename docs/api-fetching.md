# 原生非同步請求 (Async API Fetching)
原生 Web Components 在使用者觸發搜尋時執行 fetch，並同步呈現 Loading、錯誤與結果狀態的實作方式。
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
    try {
        const data = await apiService.fetchWithCancel(
            'github_search',
            `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=100`
        );
        if (!data) return; // 被新的請求取消
        this.repos = data.items || [];
    } catch (err) {
        notificationService.error('搜尋失敗，請稍後再試。');
    } finally {
        this.loading = false;
        this.update(); // 渲染結果
    }
}
```
透過將 `fetch` 邏輯與 `update()` 方法結合，我們能在不使用框架 Reactivity 系統的情況下，實現流暢的 UI 更新。

實際程式另有兩項處理：`apiService.fetchWithCancel()` 以 AbortController 取消同一類別的過期請求（被取消時回傳 `null`），搜尋結果也會以 IndexedDB 快取 30 分鐘，命中快取時不再發出請求。
