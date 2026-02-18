# ADR 0049: 原生 Web Share 與 Web Share Target 整合

## 上下文
現代網頁應用（特別是 PWA）不應是孤島。使用者期望能輕鬆地將內容分享至社群媒體或通訊軟體，同時也希望能將其他應用的內容（如圖片、連結）快速導入本應用處理。傳統方案依賴各平台私有的 SDK，而現代標準提供了原生的 Web Share API。

## 決策
1.  **實作 ShareService**: 封裝 `navigator.share` 與 `navigator.canShare`，提供統一的內容分享接口。
2.  **支援 Web Share Target**: 在 `manifest.json` 中宣告 `share_target`，讓應用能接收來自系統分享選單的內容。
3.  **整合至 Playground 與 Lab**: 允許使用者將自己在 Playground 創作的代碼 URL 直接分享，或在 Lab 中接收外部傳入的數據。

## 後果
- **優點**: 實現了與作業系統層級的深度整合，強化了 PWA 的「原生感」。
- **優點**: 零外部庫依賴，完全符合 Vanilla Web 精神。
- **缺點**: `Web Share Target` 需要在 `manifest.json` 配置並配合 Service Worker 處理 POST 請求或查詢參數，開發複雜度較高。
- **缺點**: 瀏覽器支援度在桌面端仍有差異，需實作優雅降級。
