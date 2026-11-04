# 🍦 Plain Vanilla Web App Template

[English](./README.md) | **[繁體中文](./README_zh-TW.md)**

> **[📍 檢視 2026 演進路線圖 (Roadmap)](./ROADMAP.md)**

這是一個遵循 **[Plain Vanilla Web](https://plainvanillaweb.com/)** 精神所構建的現代原生網頁應用範本：沒有打包工具、沒有轉譯器、沒有 `node_modules`，全部是瀏覽器直接載入的原生 ES Modules、Custom Elements 與標準 Web API。

> **💡 發想靈感源自 [jsebrech/plainvanilla](https://github.com/jsebrech/plainvanilla)。**

這個 repo 分成兩層：

| 層級 | 是什麼 | 入口 | 適合什麼時候用 |
| :--- | :--- | :--- | :--- |
| **① 核心** | 約 1,100 行可重用的基礎建設：安全模板、具 DOM morphing 的反應式元件、服務基底、跨分頁 Store 與 hash 路由 | [`lib/core.js`](./lib/core.js) | 想用原生方式打造自己的應用 |
| **② 展示站** | 以核心打造的完整網站：37 個前沿 Web API 互動實驗室、執行期渲染的文件、儀表板與遊樂場 | [`index.html`](./index.html) · [`lib/vanilla-sdk.js`](./lib/vanilla-sdk.js) | 想學某個 Web API，或直接借用寫好的 service |

核心不會 import 任何展示站的程式，並由測試守住這條邊界（[ADR 0101](./docs/decisions/0101-core-entry-point.md)）。版本依語意化版本編號，見 [CHANGELOG](./CHANGELOG.md)（目前為 **v3.1.0**）。

> 💡 **為何堅持「標準優於框架、零建置成本、安全且透明」？** 閱讀 **[Vanilla Manifesto (原生網頁開發宣言)](./docs/manifesto.md)**。

---

## ① 核心

### 包含哪些模組

| 模組 | 用途 |
| :--- | :--- |
| `lib/html.js` | `html` 標籤模板，**自動跳脫**所有插入的值（預設防 XSS）；受信任的標記用 `unsafe()` |
| `lib/base-component.js` | `BaseComponent`：Custom Element 基底，具深度反應式狀態、`requestAnimationFrame` 合併更新、預設 Light DOM（可選用 Shadow DOM）、插槽模擬與 `$t()` 國際化 |
| `lib/morph.js` | 重繪時**就地更新現有 DOM**：沒變的元素保留原節點、監聽器、焦點、游標與捲動位置；子元件重建以維持生命週期（[ADR 0100](./docs/decisions/0100-dom-morphing-updates.md)） |
| `lib/base-service.js` | `BaseService`：以 `EventTarget` 為基礎的單例服務基底，提供 `on`／`off`／`emit` |
| `lib/store.js` | `appStore`：Proxy 全域狀態，自動存入 `localStorage`、透過 `BroadcastChannel` 跨分頁同步，支援快照（`applySnapshot`）與 TTL 快取 |
| `lib/router.js`、`components/route/` | hash 路由：`matchRoute()`（`:參數`、`/*` 萬用字元、`exact`），`<x-switch>`／`<x-route>` 支援頁面延遲 `import()`、View Transition、可注入的 `authGuard` 與 SEO meta |
| `lib/i18n-service.js`、`lib/meta-service.js` | 語系載入與翻譯；依路由更新 `document.title` 與描述 |

### 在自己的頁面使用

複製 `lib/` 與 `components/route/`（保持相對路徑），或從 jsDelivr 引用固定版本，版本 tag 底下的檔案不會再變（見 [CHANGELOG](./CHANGELOG.md)）。需透過 HTTP 開啟，ES Modules 無法從 `file://` 載入。

```javascript
import { BaseComponent, html, router, registerRoute } from './lib/core.js';
// 或引用固定版本：import { ... } from 'https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v3.1.0/lib/core.js';

class HelloCard extends BaseComponent {
    constructor() { super(); this.initReactiveState({ count: 0 }); }
    render() {
        return html`<button onclick="this.closest('hello-card').state.count++">已點擊 ${this.state.count} 次</button>`;
    }
}
customElements.define('hello-card', HelloCard);

registerRoute();                                      // 定義 <x-route>；<x-switch> 在 import 時就已定義
router.authGuard = () => Boolean(localStorage.token); // 選用：auth-required 路由的登入判斷
```

```html
<x-switch>
    <x-route path="/" exact><template><hello-card></hello-card></template></x-route>
    <x-route path="/admin" auth-required module="./pages/Admin.js"><template><page-admin></page-admin></template></x-route>
    <x-route path="*"><template><h1>Not Found</h1></template></x-route>
</x-switch>
```

`<template>` 裡的內容在路由啟用時才建立、停用時移除，頁面進入時收到 `connectedCallback`、離開時收到 `disconnectedCallback`；放在元件的 `render()` 裡時，替 `<x-switch>` 加上 `data-persistent="<id>"`，重繪時才會保留（[ADR 0102](./docs/decisions/0102-route-owned-page-lifecycle.md)）。

### 核心文件

- [這不是框架！組件開發指南](./docs/component-architecture.md)：反應式 Custom Elements、morphing 與事件綁定方式
- [SafeHTML：防護 XSS 的安全渲染機制](./docs/safe-html-rendering.md)：`html`／`unsafe` 的跳脫規則
- [服務模式規範](./docs/service-patterns.md)：單例服務與事件驅動架構
- [狀態管理](./docs/state-management.md) · [路由](./docs/router.md) · [國際化](./docs/i18n.md)
- [專案架構全貌深度解析](./docs/project-architecture-overview.md)：各部分如何組合

---

## ② 展示站

### 啟動

```bash
python3 -m http.server   # 或：npx serve .
```

開啟 `http://localhost:8000/`，側邊欄分為：

- **📚 技術手冊 (Docs)**：`docs/*.md` 文件，於執行期載入並渲染。
- **🧪 互動式實驗室 (Lab)**：37 個獨立的前沿原生 API 實驗室，多數附對應文件。
- **🎡 Vanilla 遊樂場 (Playground)**：以 `Blob` 與 object URL 實作的所見即所得程式碼編輯器。
- **📊 開發者儀表板／📈 效能分析中心**：即時檢視 IndexedDB、網路請求與 Store 狀態；以原生 Canvas 圖表呈現 Web Vitals（LCP、CLS）。
- **⚡ Web Worker 展示／🔍 開源碼搜尋**：主執行緒外的運算；串接 GitHub REST API、搭配虛擬清單的搜尋介面。
- **👤 個人檔案 (Profile)**：位於 `auth-required` 路由後方的登入示範。

### 展示的 Web API

- **WebGPU 與 WebAssembly**：Compute Shader 並行運算與串流 WASM 執行。
- **WebRTC (P2P)**：無伺服器的點對點資料與影音傳輸。
- **硬體存取**：Web Bluetooth、Web Serial、Web MIDI、Web NFC、Barcode Detection、螢幕錄製。
- **WebAuthn**：以 FaceID、指紋與 FIDO2 安全金鑰登入的 Passkey。
- **媒體**：WebCodecs、即時 Canvas 濾鏡的 Media Streams、Web Audio、Web Speech（語音合成與辨識）。
- **平台能力**：Payment Request、Compression Streams、File System Access、Web Share 與 Share Target、Web Locks、Background Fetch、Badging、Screen Wake Lock、EyeDropper、Popover。

### 一次全部引入：`lib/vanilla-sdk.js`

SDK 匯出核心，以及 40 多個展示用 service（加密、IndexedDB、WebRTC、WebGPU、通知…）、響應式表單引擎與 `CanvasChart`。詳見 [SDK 使用指南](./docs/sdk-usage.md)。

```javascript
import { BaseComponent, html, cryptoService, FormGroup } from 'https://cdn.jsdelivr.net/gh/raybird/plainvanillaweb@v3.1.0/lib/vanilla-sdk.js';
```

### 建立在核心之上的應用層功能

- **PWA**：網路優先的 Service Worker，離線時回退快取，快取版本依檔案內容自動產生（[ADR 0097](./docs/decisions/0097-network-first-sw-versioning.md)）。
- **Offline Action Queue**：斷網時操作自動排隊，恢復連線後重送。
- **Undo／Redo**：以 `appStore.applySnapshot()` 實作的快照歷史。
- **Virtual List**：萬筆資料也能流暢捲動。
- **主題**：CSS 變數、亮色／暗色模式與圓形擴散的切換動畫。
- **Prefetch**：滑鼠移到導覽連結上時預先載入頁面模組。
- **Storage Persistence**：主動申請持久化儲存，避免被系統清除。

---

## 📂 專案目錄結構

```text
.
├── lib/                  # ① 核心模組 + ② 展示用 service
│   ├── core.js           # ① 只含核心的入口
│   ├── html.js, base-component.js, morph.js, base-service.js,
│   │   store.js, broadcast-service.js, router.js,
│   │   i18n-service.js, meta-service.js        # ① 核心
│   ├── vanilla-sdk.js    # ② 一次全部引入的入口
│   └── *-service.js      # ② WebGPU、WebRTC、Bluetooth、Crypto…
├── components/
│   ├── route/            # ① <x-switch>、<x-route>
│   ├── pages/            # ② 路由頁面（Home、Docs、Dashboard、Login…）
│   │   └── lab/          # ② 37 個 Web API 實驗室
│   └── ui/               # ② 可重用 UI（Card、NativeChart…）
├── app/App.js            # ② 網站外框：側邊欄與所有路由
├── docs/                 # 執行期載入的文件（Markdown）
│   └── decisions/        # 90+ 篇架構決策紀錄 (ADR)
├── workers/              # ② Web Worker 腳本
├── assets/               # 圖片、語系檔（zh-TW、en-US）
├── tests/                # 單元測試（Node）與瀏覽器測試（headless Chrome）
├── scripts/              # 產生頁面與維護用腳本
├── index.html, index.js, index.css   # ② 網站入口、啟動程式、全域樣式
├── sw.js                 # ② Service Worker
└── manifest.json         # ② PWA 設定與 Web Share Target
```

---

## 🧪 測試與代碼檢查

不需安裝任何測試框架或 linter，全部使用 Node.js 內建工具：

```bash
# 執行所有單元測試 (Node 內建 test runner)
node --test tests/*.test.js

# 以 headless Chrome 執行 DOM 與生命週期測試，並對全站路由與文件做冒煙測試 (Node 22+，零依賴)
node tests/browser-runner.mjs

# 語法檢查
find . \( -name "*.js" -o -name "*.mjs" \) -not -path "./node_modules/*" -not -path "./.git/*" | xargs -n 1 node -c

# 或一次在本機執行 CI 的所有檢查（只檢查不提交；--quick 略過瀏覽器測試）
scripts/check.sh
```

### 發版前更新快取版本

網站檔案有變動時，提交前請執行下列指令，並把更新後的 `sw.js` 與 `index.html` 一起提交；否則回訪的使用者會一直拿到 Service Worker 裡的舊快取。CI 會檢查版本號與檔案內容是否一致。

```bash
node scripts/update-sw-version.js
```

---

## 📄 架構決策紀錄 (ADR)

重要的架構選擇都記錄在 [`docs/decisions/`](./docs/decisions/)。新增決策後請執行 `node scripts/update-adr-index.js` 重新產生索引。

---

## 授權

MIT License
