# 🍦 Vanilla SDK: 工業級原生 Web API 快速上手

> **版本**：v1.1.0  
> **更新日期**：2026-10-26  
> **定位**：零依賴、零建置、涵蓋「UI 元件基類 + 事件服務 + 表單引擎 + 前沿 Web API」的完整原生前端開發套件。

`VanillaSDK` 是本專案的核心成果，它將分散的瀏覽器標準 API 與現代開發架構聚合為一組強大、一致且型別安全的工業級工具箱。支援直接作為 CDN 模組在外部獨立專案中無縫引用。

---

## 🚀 快速開始 (Quick Start)

無需任何 Webpack、Vite 或 npm 建置工具，只要在任何 HTML 中以原生 ES Modules 方式引入即可：

```javascript
// 一站式全量引入
import { VanillaSDK } from 'https://raybird.github.io/plainvanillaweb/lib/vanilla-sdk.js';

// 或按需解構具名匯出
import { 
    BaseComponent, 
    html, 
    cryptoService, 
    notificationService, 
    FormGroup, 
    FormControl, 
    Validators 
} from 'https://raybird.github.io/plainvanillaweb/lib/vanilla-sdk.js';

// 1. 初始化 SDK (自動配置 WebRTC 與 國際化)
const sdk = await VanillaSDK.init();

// 2. 原生通知提示
sdk.notification.success('Vanilla SDK v1.1.0 已就緒！');

// 3. 原生語音合成 (TTS)
sdk.speech.speak('歡迎體驗現代原生網頁開發。');
```

---

## 🏗️ 核心架構基底 (Core Base Classes)

### 1. `BaseComponent`：反應式 Web Components 基類
所有介面元件的母類別，具備 Proxy 深層反應式狀態、游標/焦點保持、`data-persistent` 節點保護與 `$slot` 模擬。

```javascript
import { BaseComponent, html } from './lib/vanilla-sdk.js';

class CounterCard extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({ count: 0 });
    }

    render() {
        return html`
            <div class="card">
                <h3>計數器: ${this.state.count}</h3>
                <button onclick="this.closest('counter-card').state.count++">點擊 +1</button>
            </div>
        `;
    }
}
customElements.define('counter-card', CounterCard);
```

### 2. `BaseService` 與 `Store`
* **`BaseService`**：原生 `EventTarget` 事件驅動基類，提供 `on(type, callback)`（自動解包 detail 並回傳取消監聽函式）、`off` 與 `emit`。
* **`Store`**：Proxy 狀態管理類別，支援 `localStorage` 自動持久化、`BroadcastChannel` 跨分頁狀態廣播與 Undo/Redo 快照。

```javascript
import { Store } from './lib/vanilla-sdk.js';

// 建立自訂的多分頁同步狀態庫
const userStore = new Store({ name: 'Raybird', score: 100 }, 'my_user_state');
userStore.state.score += 10; // 自動持久化並廣播給其他分頁
```

---

## 🛡️ SafeHTML：預設安全渲染

Vanilla SDK 匯出了 `html`、`unsafe` 與 `escapeHTML`，徹底杜絕 DOM-based XSS 漏洞：

```javascript
import { html } from './lib/vanilla-sdk.js';

const userInput = "<script>alert('xss')</script>";

// 自動轉義危險標籤為純文字實體
document.getElementById('app').innerHTML = html`
    <div class="user-content">
        ${userInput}
    </div>
`;
```

---

## 📝 響應式表單引擎 (Form Engine)

復刻 Angular Reactive Forms 的精準驗證體系，支援 `valid`、`dirty`、`touched` 與 `pending` 狀態旗標：

```javascript
import { FormGroup, FormControl, Validators } from './lib/vanilla-sdk.js';

const loginForm = new FormGroup({
    username: new FormControl('', [Validators.required, Validators.minLen(3)]),
    email: new FormControl('', [Validators.required, Validators.email])
});

loginForm.controls.email.value = 'invalid-email';
console.log(loginForm.controls.email.state.valid); // false
console.log(loginForm.controls.email.state.errors); // { email: true }
```

---

## 📊 離線資料庫與圖表 (DB & Canvas Chart)

### 1. `dbService` / `DBService`：結構化 IndexedDB 服務
具備筆記資料 CRUD、`change` 事件廣播與 Web Worker 離線加密備份整合能力。

```javascript
import { dbService } from './lib/vanilla-sdk.js';

const notes = await dbService.getAll();
await dbService.save({ id: 'note-1', title: '原生開發日記', content: '零依賴萬歲！' });
```

### 2. `CanvasChart`：純原生 Canvas 高效能時間序列圖表
專為高頻數據（如效能監控、物聯網感測數值）設計的無依賴畫布圖表。

```javascript
import { CanvasChart } from './lib/vanilla-sdk.js';

const chart = new CanvasChart(document.getElementById('monitorCanvas'), {
    color: '#007bff',
    maxDataPoints: 50
});

// 即時動態推入新數值並自動重繪
setInterval(() => {
    chart.addData(Math.random() * 100);
}, 1000);
```

---

## 💎 前沿 Web API 服務 (Cutting-Edge Services)

SDK 聚合了 38+ 項現代瀏覽器原生硬體與通訊標準：

| 服務模組 | 說明 | 典型用途 |
| :--- | :--- | :--- |
| `webrtcService` (`sdk.webrtc`) | 原生 WebRTC 點對點連線 | 無伺服器 P2P 數據傳輸與聊天 |
| `cryptoService` (`sdk.crypto`) | 原生 Web Crypto API | 高強度 AES-GCM 加解密與 SHA-256 雜湊 |
| `compressionService` (`sdk.compression`) | 原生 Compression Streams | Gzip / Deflate 即時串流壓縮 |
| `bluetoothService` (`sdk.bluetooth`) | 原生 Web Bluetooth (BLE) | 藍牙心率帶、硬體裝置直連 |
| `serialService` (`sdk.serial`) | 原生 Web Serial API | Arduino、微控制器串口通訊 |
| `webauthnService` (`sdk.webauthn`) | 原生 WebAuthn API | FaceID / 指紋與 FIDO2 安全金鑰登入 |
| `fileSystemService` (`sdk.fileSystem`) | 原生 File System Access | 本地目錄與檔案讀寫編輯 |
| `speechService` (`sdk.speech`) | 原生 Web Speech API | TTS 語音朗讀與 STT 語音辨識 |
| `crdtService` (`sdk.crdt`) | 原生 CRDT 協同演算法 | 去中心化即時無衝突協作 |

---

## 🛠️ 開發與環境建議

1. **JSDoc 型別提示**：在支援 TypeScript / JSDoc 的編輯器（如 VS Code）中，引用 `VanillaSDK` 時能享有完整的方法補全與參數提示。
2. **安全上下文要求 (Secure Context)**：許多前沿硬體與網路功能（如 Crypto、WebRTC、WebAuthn、Bluetooth、NFC）強制要求在 **HTTPS** 或 **`http://localhost`** 環境下運行。

---

*文件最後修訂：2026-10-26 (v1.1.0)*
