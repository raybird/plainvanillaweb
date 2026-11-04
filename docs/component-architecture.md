# 🏗️ 組件開發指南 (Component Architecture)

`plainvanillaweb` 採用一套基於原生 **Custom Elements (Web Components)** 的輕量級架構。我們透過 `BaseComponent` 封裝了反應式狀態、生命週期管理與插槽處理，讓開發者能以類現代框架的體驗開發純原生組件。

---

## 🌟 1. 核心理念：按需渲染與物理 DOM 保護

我們主張「最少抽象、回歸原生」。透過 Proxy 觀察狀態變更，自動排程重繪。重繪時 `BaseComponent` 不會整塊替換 `innerHTML`，而是以 `lib/morph.js` 把新 HTML 與現有 DOM 逐節點比對、就地更新（[ADR 0100](./decisions/0100-dom-morphing-updates.md)），輸入框焦點、游標、捲動位置與綁定的監聽器都會保留；需要完整保留內部狀態的節點（例如 `<canvas>`、`<video>`）可再以 `data-persistent` 保護。

---

## 🛠️ 2. 組件基礎結構

一個標準的 `BaseComponent` 組件包含四個核心階段：

```javascript
import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

export class MyCounter extends BaseComponent {
    constructor() {
        super();
        // 1. 初始化反應式狀態 (Reactive State)
        this.initReactiveState({
            count: 0
        });
    }

    // 2. 生命週期：組件掛載於 DOM 時觸發
    connectedCallback() {
        super.connectedCallback();
        console.log('組件已就緒');
    }

    // 3. 生命週期：首次渲染完成後執行 (僅執行一次)
    // 常用於執行一次性初始化，如載入第三方畫布或發送 API 請求
    afterFirstRender() {
        console.log('DOM 首次渲染完成');
    }

    // 4. 定義 UI 模板 (建議回傳 html`` 產生的 SafeHTML；也可回傳字串，但字串不會自動轉義)
    render() {
        return html`
            <div class="card">
                <h3>計數器：${this.state.count}</h3>
                <button id="add-btn" class="btn btn-primary">
                    增加
                </button>
            </div>
        `;
    }
}

// 註冊 Custom Element，標籤名必須包含連字號 (-)
customElements.define('my-counter', MyCounter);
```

---

## ⚡ 3. 反應式狀態 (Reactive State)

透過 `this.initReactiveState(obj)` 建立的 `this.state` 是一個 Proxy 物件：
* **深度監聽**：支援多層巢狀屬性的修改追蹤。例如直接修改 `this.state.user.profile.name = 'Raybird'` 即可自動更新 UI。
* **合併渲染 (Batching)**：`BaseComponent` 內建排程緩衝。在同一個 JavaScript 執行期 (Tick) 內修改多個屬性，會透過 `requestAnimationFrame` 合併為單次非同步渲染，極大化效能。

---

## ⚠️ 4. 事件綁定：重繪會保留哪些節點 (Listener Lifetime)

`render()` 重新執行時，`BaseComponent` 以 morph 就地更新 DOM（[ADR 0100](./decisions/0100-dom-morphing-updates.md)）：
* **一般元素**（同位置或同 `id`、同標籤）會保留同一個節點，綁在上面的監聽器繼續有效。
* **條件渲染新出現的元素**是新節點，上面沒有任何監聽器。
* **子元件（自訂元素）**在父元件重繪時一律重建，與它的 `connectedCallback`／`disconnectedCallback` 生命週期一致。

因此請依下列策略綁定事件，**不要在 `update()` 裡重複 `addEventListener`**：節點被保留時，每次重繪都會再疊加一個監聽器，按一下就觸發好幾次。

### 策略 A：事件委派 (Event Delegation) — 最推薦、免綁定
回歸最 Vanilla 的寫法，在模板中直接使用 inline attribute。因為事件會向上冒泡，我們只要在按鈕的 `onclick` 中使用 `this.closest()` 找到對應的組件並執行其方法即可。這種方式**完全不懼重繪，且沒有記憶體洩漏風險**：

```javascript
render() {
    return html`
        <!-- 使用 this.closest() 動態定位到當前的 Custom Element 實例 -->
        <button onclick="this.closest('my-counter').increment()">
            增加
        </button>
    `;
}

increment() {
    this.state.count++;
}
```

### 策略 B：在 `afterFirstRender()` 對元件本身做事件委派
需要 `event` 物件、非同步處理或多個按鈕共用邏輯時，在 `afterFirstRender()` 對元件本身綁**一次**監聽器，再以 `closest()` 判斷點到的是誰。元件本身不會被重繪替換，條件渲染新出現的按鈕也一樣有效（`app/App.js` 即採用此寫法）：

```javascript
afterFirstRender() {
    this.addEventListener('click', (event) => {
        const addButton = event.target.closest('#add-btn');
        if (addButton) this.state.count++;
    });
}
```

只有一定存在、不會被條件渲染移除的元素（例如表單本身），才適合在 `afterFirstRender()` 直接綁在該元素上。

> 需要整塊重繪的特殊元件可設定 `static morphUpdates = false`，此時每次重繪都會建立新節點，綁在子元素上的監聽器也會隨之消失。

---

## 📥 5. 插槽與內容分發 (Slots)

本專案在不啟用 Shadow DOM 的情況下（以便於全域 CSS 樣式穿透），實作了**插槽模擬機制**。
第一次 `connectedCallback` 執行、首次渲染之前，基底會先複製子節點（僅 Light DOM），您可以透過 `this.$slot(slotName)` 動態輸出內容。`$slot()` 回傳的是一般字串，放進 `html` 模板時需以 `unsafe()` 包裝，否則會被轉義成純文字：

```html
<!-- 使用方式 -->
<x-page-layout>
    <h1 slot="header">文章標題</h1>
    <p>這是主要的文章段落內容，將會被分發至預設插槽中。</p>
</x-page-layout>
```

```javascript
// x-page-layout 元件內部定義
import { html, unsafe } from '../../lib/html.js';

render() {
    return html`
        <div class="layout">
            <!-- 渲染具名插槽 header -->
            <header class="page-header">${unsafe(this.$slot('header'))}</header>
            
            <!-- 渲染預設插槽 (無 name) -->
            <main class="page-content">${unsafe(this.$slot())}</main>
        </div>
    `;
}
```
