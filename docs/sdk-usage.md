# 🍦 Vanilla SDK 實戰指南

本 SDK 旨在將瀏覽器原生的強大能力（如加密、P2P、檔案系統）封裝為零相依、即插即用的模組。您無需安裝 Node.js，無需 Webpack，只需一個 URL 即可賦予您的網頁工業級能力。

## 🚀 1. 極速上手 (CDN 模式)

您可以選擇兩種方式引入 SDK：

### A. 按需引入 (Named Import) - 推薦
只引入您需要的模組，清楚且高效。

```html
<script type="module">
    import { cryptoService, notificationService } from 'https://raybird.github.io/plainvanillaweb/lib/vanilla-sdk.js';

    // 注意：cryptoService 是一個物件實例，請呼叫其方法
    const text = "Hello Vanilla SDK";
    const hash = await cryptoService.sha256(text);
    
    notificationService.success(`SHA-256: ${hash.slice(0, 8)}...`);
</script>
```

### B. 完整引入 (Default Import)
一次獲取所有功能，適合快速原型開發。

```html
<script type="module">
    import VanillaSDK from 'https://raybird.github.io/plainvanillaweb/lib/vanilla-sdk.js';

    // 所有服務都掛載在 VanillaSDK 物件下
    await VanillaSDK.webrtc.createOffer();
</script>
```

## 🛠 2. 實戰場景範例

### 場景 A：安全資料傳輸 (Crypto + Compression)
將敏感數據先壓縮、再加密，最後轉為 Base64 方便傳輸。

```javascript
import { cryptoService, compressionService } from '.../vanilla-sdk.js';

async function securePackage(dataString, password) {
    // 1. 壓縮數據 (String -> Gzip Stream -> Blob)
    const stream = new Blob([dataString]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(compressedStream).blob();
    
    // 2. 加密數據 (Blob -> ArrayBuffer -> Encrypted)
    const buffer = await compressedBlob.arrayBuffer();
    // 注意：cryptoService 目前接受字串，若需處理二進位需使用底層 encryptBuffer (若有實作)
    // 這裡示範字串加密流程：
    const encrypted = await cryptoService.encrypt(dataString, password);
    
    return encrypted; // { ciphertext, iv, salt }
}
```

### 場景 B：無伺服器 P2P 聊天 (WebRTC)
兩瀏覽器間直接連線，不經過後端資料庫。

```javascript
import { webrtcService } from '.../vanilla-sdk.js';

// 發起端 (Alice)
const offer = await webrtcService.createOffer();
console.log("請將此 SDP 傳給 Bob:", JSON.stringify(offer));

// 接收端 (Bob)
await webrtcService.createAnswer(offer);

// 雙方連線後
webrtcService.on('message', msg => console.log("收到:", msg));
webrtcService.send("嗨！這是 P2P 訊息");
```

### 場景 C：本地檔案編輯器 (File System)
直接讀寫使用者硬碟中的檔案，像原生 App 一樣。

```javascript
import { fileSystemService } from '.../vanilla-sdk.js';

document.querySelector('#openBtn').onclick = async () => {
    // 1. 選擇目錄
    const handle = await fileSystemService.showDirectoryPicker();
    
    // 2. 讀取檔案列表
    const files = await fileSystemService.readDirectory(handle);
    console.log("檔案清單:", files);
    
    // 3. 讀取特定檔案
    const content = await fileSystemService.readFile(handle, 'README.md');
    document.querySelector('textarea').value = content;
};
```

## 📚 3. 核心 API 速查

| 服務 | 方法 | 參數 | 回傳 |
|------|------|------|------|
| **Crypto** | `encrypt` | `(text, password)` | `{ ciphertext, iv, salt }` |
| | `decrypt` | `(ciphertext, iv, password)` | `string` (明文) |
| **WebRTC** | `createOffer` | - | `RTCSessionDescription` |
| | `send` | `(data)` | - |
| **PWA** | `install` | - | `Promise<'accepted'|'dismissed'>` |
| **Share** | `share` | `{ title, text, url }` | `boolean` (成功與否) |

---
*更多詳細實作請參考專案源碼 `lib/` 目錄。*
