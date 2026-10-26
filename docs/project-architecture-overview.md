# 🍦 Plain Vanilla Web App 架構與核心技術全貌深度解析

> **日期**：2026-10-26  
> **整理者**：Antigravity (for Raybird)  
> **專案版本**：v2.6.1+  
> **核心定位**：基於 W3C/WHATWG 現代瀏覽器原生標準所構建的零依賴、零建置現代 Web 應用架構範本與前沿 Web API 實驗平台。

---

## 目錄 (Table of Contents)

1. [專案背景與 Vanilla 開發哲學](#1-專案背景與-vanilla-開發哲學)
2. [核心架構與三大技術基石](#2-核心架構與三大技術基石)
   - 2.1 [UI 元件層：BaseComponent](#21-ui-元件層basecomponent)
   - 2.2 [安全渲染機制：SafeHTML 與標籤模板](#22-安全渲染機制safehtml-與標籤模板)
   - 2.3 [服務與狀態層：BaseService、Store 與廣播機制](#23-服務與狀態層baseservicestore-與廣播機制)
3. [單頁應用 (SPA) 路由系統](#3-單頁應用-spa-路由系統)
   - 3.1 [原生 Hash 路由核心 (RouterService)](#31-原生-hash-路由核心-routerservice)
   - 3.2 [路由組件與動態載入 (<x-switch> 與 <x-route>)](#32-路由組件與動態載入-x-switch-與-x-route)
   - 3.3 [原生 View Transitions 動態換頁動效](#33-原生-view-transitions-動態換頁動效)
   - 3.4 [路由守衛 (Auth Guard) 與 SEO Meta 動態更新](#34-路由守衛-auth-guard-與-seo-meta-動態更新)
4. [專案目錄結構與模組職責](#4-專案目錄結構與模組職責)
5. [前沿 Web API 實驗室生態 (38+ Native Labs)](#5-前沿-web-api-實驗室生態-38-native-labs)
6. [工業級聚合入口：Vanilla SDK (v1.0.0)](#6-工業級聚合入口vanilla-sdk-v100)
7. [軟體工程化與品質保證](#7-軟體工程化與品質保證)
8. [架構結論與價值評估](#8-架構結論與價值評估)

---

## 1. 專案背景與 Vanilla 開發哲學

在現代前端開發中，工具鏈（Webpack, Vite, Babel, npm）與框架（React, Vue, Angular）不斷演進，同時也帶來了版本升級斷層、依賴膨脹（dependency hell）、建置等待時間以及架構鎖定等問題。

`plainvanillaweb` 發想自 [jsebrech/plainvanilla](https://github.com/jsebrech/plainvanilla)，並在 2026 年進一步演化為一個成熟的現代網頁架構體系。專案在 [manifesto.md](./manifesto.md) 中確立了六項核心精神：

1. **標準優於框架 (Standards over Frameworks)**：優先採用 Custom Elements、ES Modules、CSS Variables 與最新 Native Web APIs，確保代碼具備長青（Evergreen）的生命週期。
2. **零建置成本 (Zero Build)**：無需任何編譯或打包，存檔後瀏覽器重新整理即可運行，消除繁重的開發環境設定。
3. **最小抽象 (Minimal Abstraction)**：基底類別只提供必要的生命週期與狀態輔助，不遮蔽瀏覽器原始 API。
4. **透明性與可觀測性 (Transparency)**：狀態流轉、DOM 渲染機制與事件委派完全清晰透明，沒有黑盒魔法。
5. **安全的預設值 (Secure by Default)**：透過自製標籤模板 `SafeHTML` 實作預設自動轉義，提供與主流現代框架相當的 XSS 防護力。
6. **教育重於封裝 (Education as a Feature)**：將前沿硬體與網路標準剝離複雜包裝，提供乾淨純粹的參考實現。

---

## 2. 核心架構與三大技術基石

專案的架構由以下三個最底層的設計構成，形成了「UI 元件 - 渲染安全 - 狀態服務」的穩固三角。

### 2.1 UI 元件層：`BaseComponent` (`lib/base-component.js`)

所有介面與頁面皆繼承自原生 `HTMLElement`，封裝了聲明式元件必備的反應式生命週期：

* **預設 Light DOM**：設定 `static useShadow = false`，讓全域 CSS 變數與通用樣式能夠直接穿透與套用；特定需要嚴格樣式隔離的組件可手動覆寫開啟 Shadow DOM。
* **深層反應式代理 (`initReactiveState`)**：
  * 使用深度 `Proxy` 遞迴監控狀態物件的各層屬性變更。
  * 攔截到屬性賦值時，透過 `scheduleUpdate()` 使用 `requestAnimationFrame` 進行非同步緩衝合批，避免同一幀內多次渲染引發介面卡頓。
* **全量 InnerHTML 重繪與狀態保持**：
  * **焦點與選取範圍保護**：更新前自動記錄使用者的 `activeElement.id` 與文字游標選取範圍（`selectionStart`/`selectionEnd`），重繪後自動恢復，確保輸入體驗流暢不跳動。
  * **持久化節點保持 (`data-persistent`)**：針對 `<canvas>`、`<video>` 或內部複雜 DOM，在 `innerHTML` 覆蓋前將標有 `data-persistent` 的節點提取暫存，渲染後替換回佔位符，避免真實 DOM 重建導致內部狀態丟失。
  * **Light DOM 插槽模擬 (`$slot`)**：在首次掛載前呼叫 `_captureSlots()` 暫存原始標籤內的子節點，透過 `$slot(name)` 模擬原生 Web Component 的插槽功能。
  * **圖示自動渲染**：每次 `update()` 完畢後自動觸發 `lucide.createIcons()` 渲染向量圖示。

### 2.2 安全渲染機制：`SafeHTML` 與標籤模板 (`lib/html.js`)

在無框架的原生開發中，直接使用 `innerHTML` 最容易引發 XSS（跨站腳本攻擊）。專案實作了嚴謹的安全渲染層：

* **`html\`...\`` 標籤模板**：
  * 對所有內插的變數預設使用 `escapeHTML()` 轉義危險字元（`& < > " '`）。
  * 支援陣列拼接與自動逐項轉義。
  * 自動識別帶有 `__isSafe = true` 的物件，避免重複轉義。
* **`unsafe(str)` 逃生機制**：
  * 明確將字串標記為受信任的 `SafeHTML`，僅供受信任的內部標籤（如子元件已渲染 HTML 或 `$slot` 輸出）使用。

### 2.3 服務與狀態層：`BaseService`、`Store` 與廣播機制

* **`BaseService` (`lib/base-service.js`)**：
  * 繼承原生 `EventTarget`。
  * 提供 `on(type, callback)`（自動解包 `CustomEvent.detail` 並回傳取消監聽函式）、`off` 與 `emit`。
  * 全域服務（API、Auth、Theme、i18n 等）皆繼承此類別，並以單例模式（Singleton）匯出。
* **`Store` (`lib/store.js`) 與跨分頁即時同步**：
  * `appStore` 為全域集中狀態管理實例。
  * 狀態透過 Proxy 攔截，異動時自動持久化至 `localStorage`。
  * 整合原生 `BroadcastChannel`（`broadcastService`），任一分頁修改狀態會即時廣播至其他開啟的分頁，實現多分頁無縫同步。
  * 內建快照機制（`applySnapshot`）支援 Undo / Redo 操作歷史，並具備帶有過期時間（TTL）的快取支援。

---

## 3. 單頁應用 (SPA) 路由系統

專案採用標準原生 Hash 路由架構，具備宣告式配置、延遲載入與換頁動畫。

### 3.1 原生 Hash 路由核心 (`lib/router.js`)
* 封裝於 `RouterService` 單例，監聽瀏覽器 `hashchange` 事件。
* 具備查詢字串感知能力（`currentRoutePath`），能準確分離路徑與 Query 參數，確保帶有參數的網址能正確命中對應路由。

### 3.2 路由組件與動態載入 (`<x-switch>` 與 `<x-route>`)
* **`<x-switch>` (`components/route/switch.js`)**：
  * 類似 React Router 的 `<Switch>`，同一時間只啟用第一個與當前路徑匹配的子 `<x-route>`，其餘節點設為 `display: none`。
* **`<x-route>` (`components/route/route.js`)**：
  * 支援精確比對（`exact`）、正則動態參數（`:param`）與萬用路徑（`*`）。
  * **動態代碼分割 (Dynamic Code Splitting)**：支援 `module="..."` 屬性，在路由匹配時才透過原生動態 `import()` 載入目標組件檔案，顯著降低首頁加載負擔。

### 3.3 原生 View Transitions 動態換頁動效
* 在 `<x-switch>` 執行路由切換時，自動檢測並調用 `document.startViewTransition()`，享受現代瀏覽器原生的單頁過渡轉場動畫。
* 完備的異常處理機制：主動捕捉並過濾 `AbortError`，防止使用者快速切換頁面時瀏覽器拋出未捕獲的 Promise 異常。

### 3.4 路由守衛 (Auth Guard) 與 SEO Meta 動態更新
* **身份驗證守衛**：`<x-route>` 帶有 `auth-required` 屬性時，會透過 `authService.isAuthenticated` 檢查；未登入者會被自動導向 `#/login`。
* **動態 Meta**：支援 `meta-title` 與 `meta-desc` 屬性，透過 `metaService` 自動更新瀏覽器分頁標題與 Meta Description 標籤。

---

## 4. 專案目錄結構與模組職責

```text
plainvanillaweb/
├── app/                  # 應用程式進入點 (App.js 負責佈局、側邊欄導覽與全域按鈕監聽)
├── components/           # UI 與視圖組件庫
│   ├── pages/            # 一級功能頁面 (HomePage, Docs, Dashboard, Analytics, Login 等)
│   │   └── lab/          # 38+ 個獨立前沿 Web API 實驗室
│   ├── route/            # 原生路由模組 (<x-switch>, <x-route>)
│   └── ui/               # 共用輕量 UI 元件 (Card, NativeChart, VirtualList, Modal 等)
├── lib/                  # 核心服務層 (BaseComponent, BaseService, Store, 各類 Web API 服務)
├── docs/                 # 即時解析與展示的技術文件 (Markdown)
│   └── decisions/        # 90+ 篇架構決策紀錄 (ADRs, 追蹤重大技術選型與演進)
├── workers/              # 獨立 Web Worker 腳本 (計算任務解耦、IndexedDB 備份)
├── tests/                # 測試集 (Node 內建測試 tests/*.test.js 與 browser.html DOM 測試)
├── scripts/              # 維護與腳手架工具 (new-page.js、update-adr-index.js)
├── index.html            # SPA 單一入口 (<x-app> 掛載點、CSS 與字體引入)
├── index.css             # 全域 CSS 變數主題系統與自適應排版樣式
├── index.js              # 應用程式啟動引導 (Bootstrap、i18n、網路監控、SW 註冊)
├── sw.js                 # PWA Service Worker (快取管理、離線策略與更新防抖)
└── manifest.json         # PWA 配置與 Share Target 定義
```

---

## 5. 前沿 Web API 實驗室生態 (38+ Native Labs)

專案在 `components/pages/lab/` 中收納了豐富的原生 API 示範，全部以無第三方套件的極致純粹方式實作：

| 領域分類 | 涵蓋技術與展示頁面 |
| :--- | :--- |
| **硬體連線與通訊** | **WebGPU** (Compute Shader 平行運算)、**WebRTC** (無伺服器 P2P 數據傳輸)、**Web Bluetooth** (BLE 裝置通訊)、**Web Serial** (硬體串列埠通訊)、**Web NFC** (實體 NDEF 標籤感應讀寫)、**Web MIDI** (MIDI 設備通訊)。 |
| **音訊、影像與串流** | **Web Audio** (物理音訊振盪合成器)、**WebCodecs** (硬體加速視訊解碼/編碼)、**MediaStream / Insertable Streams** (即時串流影像濾鏡與錄影)、**Native Image Studio** (Canvas 濾鏡、縮放與 WebP 轉換)、**Barcode Detection** (原生條碼與 QR 碼辨識)、**EyeDropper** (螢幕精準取色)。 |
| **系統安全與現代特性** | **WebAuthn** (FaceID/指紋與 FIDO2 安全金鑰)、**Web Crypto** (原生 SHA-256 雜湊與 AES 加解密)、**Permissions Preflight** (權限狀態預檢)、**Web Locks** (跨分頁競爭鎖)、**Screen Wake Lock** (防止螢幕睡眠)、**Payment Request** (瀏覽器原生支付介面)。 |
| **資料儲存、離線與同步** | **IndexedDB & Worker Backup** (離線資料庫與背景線程備份)、**Compression Streams** (原生 Gzip/Deflate 流式壓縮)、**File System Access** (本地目錄讀取與檔案編輯)、**CRDT** (LWW-Register 無衝突協作筆記)、**History API** (Undo/Redo 狀態快照管理)。 |
| **現代 PWA 與佈局** | **PWA Advanced** (安裝導覽與背景同步)、**Web Share & Share Target** (系統分享收發)、**Badging API** (圖示通知角標)、**Popover API** (原生彈出層)、**Native Modal** (`<dialog>` 實作)、**Native Canvas Chart** (純手寫高效圖表)、**Virtual List** (萬筆數據虛擬捲動)。 |

---

## 6. 工業級聚合入口：Vanilla SDK (v1.0.0)

在 `lib/vanilla-sdk.js` 中，專案將 40 多項服務進行了統一聚合與模組化匯出：
* 支援由外部環境或 CDN 直接單一引入：`import { VanillaSDK } from './lib/vanilla-sdk.js'`。
* 具備完整的 JSDoc 型別註釋與單例引用，讓本專案不僅是一個展示站點，也能作為獨立的 SDK 提供給其他原生或外部專案使用。

---

## 7. 軟體工程化與品質保證

在堅持「零依賴、零建置」的同時，專案實作了高效且完整的自動化工程規範：

1. **極速單元測試**：
   * 採用 Node 20+ 內建的測試運行器（`node --test tests/*.test.js`），不依賴 Jest 或 Vitest。
   * 測試涵蓋 API 生命週期、SafeHTML 防禦、表單驗證引擎、歷史快照、Crypto 加解密、Store 狀態流等，68 個測試均在 3 秒內通過。
2. **真實瀏覽器 DOM 測試**：
   * 提供 `tests/browser.html`，直接在瀏覽器環境驗證 `BaseComponent` 的自訂標籤渲染、Light/Shadow DOM 切換、反應式更新與節點持久化。
3. **靜態語法檢查**：
   * 透過 `node -c` 逐一檢查所有 JavaScript 檔案的語法正確性，杜絕基本語法錯誤。
4. **架構決策紀錄 (ADR, Architecture Decision Records)**：
   * 在 `docs/decisions/` 中記錄了超過 90 篇 ADR，詳載每個設計方案的背景、考量、決策與替代方案，是專案架構穩定演進的基石。
5. **部署相容性考量**：
   * 特別針對 GitHub Pages 等子路徑環境設置了 `<base href="...">`、`document.baseURI` 動態解析與 `.nojekyll`，防止靜態主機路由與 Markdown 請求失效。

---

## 8. 架構結論與價值評估

`plainvanillaweb` 成功驗證了現代瀏覽器原生能力的強大與成熟：
* 它打破了「不用框架就無法構建現代 SPA」的迷思，用極其精巧的架構證明了原生代碼可以同時擁有**高響應性、元件化、高安全性和卓越的維護性**。
* 它不僅是純前端開發者的實戰範本，也是研究瀏覽器底層 API、探索前沿硬體介面的絕佳教學庫。
