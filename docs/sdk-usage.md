# 🍦 Vanilla SDK 使用指南

本專案不僅是一個應用範本，更是一套**工業級的原生 Web 功能 SDK**。您可以直接在任何網頁中引用我們的核心模組，無需下載整個專案，也無需任何建置工具。

## 1. 快速接入

在您的 HTML 中透過 `<script type="module">` 引入統一入口：

```javascript
import { cryptoService, compressionService } from 'https://raybird.github.io/plainvanillaweb/lib/vanilla-sdk.js';

// 立即使用強大的原生功能
const hash = await cryptoService.sha256("Hello World");
```

## 2. 核心服務概覽

| 模組名稱 | 功能說明 |
|---------|----------|
| `cryptoService` | AES-GCM 加解密、SHA-256 雜湊。 |
| `compressionService` | 原生 Gzip / Deflate 數據壓縮。 |
| `webrtcService` | 無伺服器 P2P 通訊（DataChannel）。 |
| `wasmService` | WebAssembly 模組流式加載。 |
| `fileSystemService` | 本地檔案系統讀寫存取。 |
| `shareService` | 原生 Web Share 與接收。 |

## 3. 為什麼選擇 SDK 模式？

1.  **零打包體積**：只引用您需要的模組，利用瀏覽器原生 ESM 緩存。
2.  **極速開發**：不需要 `npm install` 或 `webpack` 配置，打開編輯器就能寫。
3.  **長期穩定**：基於 Web 標準封裝，程式碼具備極強的向下相容性。

---
*詳細範例請參考專案根目錄下的 [sdk-demo.html](../sdk-demo.html)。*
