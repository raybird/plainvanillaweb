# ADR 0083: 原生網路資訊與連線性實驗室整合

## 狀態
已接受 (Accepted)

## 背景
現代 Web 應用需要對網路狀況（如帶寬、連線類型、離線狀態）具備高度感知能力，以提供更好的用戶體驗。此外，當使用者關閉頁面時，如何保證關鍵日誌或分析數據能可靠傳送至伺服器也是一個常見挑戰。

## 決策
建立專屬的連線性實驗室頁面，整合網路資訊與可靠傳輸技術。
1. **連線性監控**：整合 `navigator.onLine` 與事件監聽。
2. **Network Information API**：讀取 `navigator.connection` 的有效頻寬 (downlink)、延遲 (rtt) 與連線類型 (effectiveType)。
3. **Beacon API 實作**：示範利用 `navigator.sendBeacon` 在不阻塞頁面卸載的情況下傳送非同步數據。
4. **三位一體同步**：建立 `NetworkPage.js`，更新 `connectivity-service.js`，並撰寫 `connectivity.md` 文檔。

## 後果
- **優點**：提供工業級的網路狀態處理方案，展現 PWA 離線優先架構的基礎能力。
- **缺點**：Network Information API 目前在 Firefox 與 Safari 上支援有限，需實作 Feature Detection。
