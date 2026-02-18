# 原生 Web 分享與接收 (Web Share & Target)

現代 Web 標準讓 PWA 能夠與作業系統深度整合，像原生應用程式一樣分享內容與接收分享。

## 1. 內容分享 (Web Share API)

透過 `navigator.share()`，您可以呼叫系統原生的分享選單，將文字、網址甚至檔案發送至其他應用程式。

```javascript
async function shareContent() {
    try {
        await navigator.share({
            title: '範例標題',
            text: '這是一段要分享的內容',
            url: window.location.href
        });
        console.log('分享成功！');
    } catch (err) {
        console.error('分享失敗或已取消:', err);
    }
}
```

## 2. 接收分享 (Web Share Target)

透過在 `manifest.json` 中宣告 `share_target`，您的 PWA 就能出現在系統的分享選單中。

### manifest.json 配置
```json
"share_target": {
  "action": "/#/lab",
  "method": "GET",
  "params": {
    "title": "title",
    "text": "text",
    "url": "url"
  }
}
```

## 3. 本專案的實踐

在「實驗室 (Lab)」中，我們展示了：
1.  **一鍵分享**：讓使用者能快速將當前專案或實驗結果分發至系統其他角落。
2.  **可用性偵測**：當瀏覽器不支援時，會優雅地降級或隱藏功能。
3.  **系統級整合**：展示了如何讓網頁應用程式不再是孤立的頁面，而是系統生態的一部分。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
