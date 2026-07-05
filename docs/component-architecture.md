# 🏗️ 組件開發指南 (Component Architecture)

`plainvanillaweb` 採用一套基於原生 **Custom Elements (Web Components)** 的輕量級架構。我們透過 `BaseComponent` 封裝了反應式狀態、生命週期管理與插槽處理，讓開發者能以類現代框架的體驗開發純原生組件。

---

## 🌟 1. 核心理念：按需渲染與物理 DOM 保護

我們主張「最少抽象、回歸原生」。透過 Proxy 觀察狀態變更，自動排程重繪。為了避免每次重繪都擦除真實 DOM state（例如輸入框焦點、選取游標等），`BaseComponent` 內建了 DOM 焦點重建與 `data-persistent` 持久節點保護，使原生 Web 開發同時具備超高渲染效能與良好的 UI 穩定性。

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

    // 4. 定義 UI 模板 (必須返回 SafeHTML 物件)
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

## ⚠️ 4. 關鍵陷阱：重新重繪時的事件監聽器丟失 (Listener Detachment)

在無 Virtual DOM 的原生網頁開發中，這是一個最常遇到的 Bug：
> **「當 this.state 改變，render() 重新執行，組件的 innerHTML 被全量替換，原本綁定在 DOM 上的 addEventListener 事件監聽器會全部消失！」**

為了解決這個問題，`BaseComponent` 支援以下兩種優雅的事件綁定策略：

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

### 策略 B：手動綁定與 `update()` 重複綁定
如果您需要綁定非同步事件、自定義事件或複雜的監聽，可以在組件中宣告 `addEventListeners()`，並同時在 `afterFirstRender()` 與 `update()` 中呼叫它。重繪前會自動把舊的 listeners 清理：

```javascript
afterFirstRender() {
    this.addEventListeners();
}

// 覆寫 update 鉤子，在 DOM 被替換後重新綁定事件
update() {
    super.update(); // 1. 執行 DOM 替換與焦點恢復
    this.addEventListeners(); // 2. 重新綁定事件監聽器
}

addEventListeners() {
    // ⚠️ 記得使用可選鏈 ?. 防止 DOM 尚未渲染完成時出錯
    this.querySelector('#add-btn')?.addEventListener('click', () => {
        this.state.count++;
    });
}
```

---

## 📥 5. 插槽與內容分發 (Slots)

本專案在不啟用 Shadow DOM 的情況下（以便於全域 CSS 樣式穿透），實作了**插槽模擬機制**。
在 `connectedCallback` 之前，基底會先複製子節點，您可以透過 `this.$slot(slotName)` 動態輸出內容：

```html
<!-- 使用方式 -->
<x-page-layout>
    <h1 slot="header">文章標題</h1>
    <p>這是主要的文章段落內容，將會被分發至預設插槽中。</p>
</x-page-layout>
```

```javascript
// x-page-layout 元件內部定義
render() {
    return html`
        <div class="layout">
            <!-- 渲染具名插槽 header -->
            <header class="page-header">${this.$slot('header')}</header>
            
            <!-- 渲染預設插槽 (無 name) -->
            <main class="page-content">${this.$slot()}</main>
        </div>
    `;
}
```
