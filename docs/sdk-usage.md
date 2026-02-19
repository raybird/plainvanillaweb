# 🍦 Vanilla SDK: 工業級原生 Web API 快速上手

`VanillaSDK` 是本專案的核心成果，它將分散的瀏覽器 API 聚合為一組強大、一致且型別安全的工業級服務。

## 🚀 快速開始 (Quick Start)

無需任何建置工具，直接引用 ESM 模組即可開始使用。

```javascript
import { VanillaSDK } from 'https://raybird.github.io/plainvanillaweb/lib/vanilla-sdk.js';

// 1. 初始化 SDK (自動配置 WebRTC 與 國際化)
const sdk = await VanillaSDK.init();

// 2. 立即使用：原生通知
sdk.notification.success('Vanilla SDK 已就緒！');

// 3. 立即使用：原生語音 (TTS)
sdk.speech.speak('歡迎使用 Vanilla 原生開發模式。');
```

## 💎 核心服務範例 (Core Services)

### 📡 1. P2P 通訊 (WebRTC)
支援無伺服器數據交換，內建穩定 STUN Server。

```javascript
// A 方：發起者
const offer = await sdk.webrtc.createOffer();
console.log('請將此 SDP 傳給 B 方:', JSON.stringify(offer));

// B 方：接收者
const answer = await sdk.webrtc.createAnswer(offerSdp);
console.log('請將此 Answer 傳回 A 方:', JSON.stringify(answer));

// 雙方：傳送訊息
sdk.webrtc.send('Hello from Vanilla SDK!');
sdk.webrtc.on('message', (data) => console.log('收到訊息:', data));
```

### 🔐 2. 資料安全性 (Crypto)
高強度 AES-GCM 加解密與雜湊。

```javascript
const pass = 'my-secret-key';
const encrypted = await sdk.crypto.encrypt('機密資料', pass);
const decrypted = await sdk.crypto.decrypt(encrypted, pass);
console.log('還原資料:', decrypted);
```

### 🗜️ 3. 數據壓縮 (Compression)
利用瀏覽器原生 Gzip 串流進行高效壓縮。

```javascript
const longText = '...'.repeat(100);
const compressed = await sdk.compression.compress(longText);
console.log(`壓縮率: ${Math.round((compressed.length / longText.length) * 100)}%`);
```

## 🛠️ 開發建議
- **型別提示**：在支援 JSDoc 的編輯器（如 VS Code）中，您將能看到完整的 API 自動補全。
- **環境要求**：大多數功能（如 Crypto, WebRTC, Bluetooth）要求在 **HTTPS** 或 **localhost** 安全上下文下執行。

---
*文件版本：v1.0.0 (2026-02-19)*
