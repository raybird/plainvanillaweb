# ADR 0016: 漸進式網頁應用支援 (Progressive Web App Support)

## 上下文
為了提供更接近原生應用的體驗（如可安裝到主畫面、離線啟動能力），並進一步展現 Vanilla JS 在現代 Web 標準中的應用能力。

## 決策
引入 PWA 標準支援：
1.  **Web App Manifest**: 透過 `manifest.json` 定義應用程式的中繼資料（名稱、圖示、啟動模式），使其滿足「可安裝 (Installable)」條件。
2.  **Service Worker**: 實作 `sw.js`，採用 **Stale-While-Revalidate** 策略快取核心資產（HTML/CSS/JS）。這確保了應用在無網路環境下仍能啟動，並在背景自動更新至最新版本。

## 後果
- **優點**: 大幅提升載入速度（二次訪問直接讀取快取）。
- **優點**: 支援離線瀏覽與主畫面安裝，增加使用者留存率。
- **缺點**: Service Worker 的快取機制可能導致使用者在短時間內看到舊版內容（需等待下次重新整理或 Cache 更新）。
