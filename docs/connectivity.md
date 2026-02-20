# 🌐 原生連線性與網路資訊 (Connectivity API)

網路環境的感知能力是構建高品質 Web 應用的關鍵。現代瀏覽器提供了多種 API 來監控連線狀態並優化數據傳輸。

## 🌟 核心 API

### 1. 連線狀態監控 (Online/Offline)
透過 <code>navigator.onLine</code> 屬性或事件監聽獲取基本連線狀態。
```javascript
window.addEventListener('online', () => console.log('連線恢復'));
window.addEventListener('offline', () => console.log('網路斷開'));
```

### 2. 網路資訊 (Network Information API)
獲取更細緻的連線參數，如頻寬與有效連線類型。
```javascript
const { effectiveType, downlink, rtt } = navigator.connection;
console.log(`目前網速: ${downlink}Mbps (${effectiveType})`);
```

### 3. 可靠數據發送 (Beacon API)
解決頁面卸載時數據丟失的問題。
```javascript
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    navigator.sendBeacon('/log', JSON.stringify(analyticsData));
  }
});
```

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面進入 **「網路資訊」** 單元，觀察即時頻寬變化並測試 Beacon 發送流程。
