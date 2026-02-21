# 🏗️ 組件開發指南 (Component Architecture)

`plainvanillaweb` 採用一套基於原生 **Custom Elements (Web Components)** 的輕量級架構。我們透過 `BaseComponent` 封裝了反應式狀態、生命週期管理與插槽處理，讓開發者能以類現代框架的體驗開發純原生組件。

## 🌟 核心理念：最小重繪與穩定節點
我們主張「按需重繪」。透過 Proxy 攔截狀態變更，自動觸發組件更新，同時提供生命週期鉤子讓開發者能進行手動的 DOM 精細操作（例如協作編輯器的持久節點策略）。

---

## 🛠️ 組件基礎結構

一個標準組件繼承自 `BaseComponent`：

```javascript
import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

export class MyComponent extends BaseComponent {
    constructor() {
        super();
        // 1. 初始化反應式狀態
        this.initReactiveState({
            count: 0
        });
    }

    // 2. 生命週期：組件掛載於 DOM
    connectedCallback() {
        super.connectedCallback();
        console.log('組件已就緒');
    }

    // 3. 生命週期：第一次渲染後執行 (常用於綁定第三方庫或手動 DOM 操作)
    afterFirstRender() {
        const btn = this.querySelector('#my-btn');
        // ...
    }

    // 4. 定義 UI 模板
    render() {
        return html`
            <div class="card">
                <h3>計數器：${this.state.count}</h3>
                <button id="my-btn" onclick="this.closest('my-component').state.count++">
                    增加
                </button>
            </div>
        `;
    }
}

customElements.define('my-component', MyComponent);
```

---

## ⚡ 反應式狀態 (Reactive State)

透過 `this.initReactiveState(obj)` 建立的 `this.state` 是一個具備**深度觀察能力**的 Proxy 物件。
- **深度追蹤**: 即使修改巢狀屬性（如 `this.state.user.profile.name = 'Ray'`），組件也會精確偵測並觸發更新。
- **效能緩衝**: `BaseComponent` 內建非同步渲染排程。多個屬性同時變更時，會透過 `requestAnimationFrame` 合併為單次渲染，極大化瀏覽器效能。
- **狀態監控**: 開發者可實作 `onStateChange(key, value)` 鉤子，實現自定義的狀態監聽或日誌記錄。

## 📥 插槽與內容分發 (Slots)

雖然預設未開啟 Shadow DOM (以利全域樣式穿透)，但我們實作了**插槽模擬機制**：

```html
<!-- 使用組件 -->
<my-layout>
    <h1 slot="title">標題內容</h1>
    <p>這是預設內容</p>
</my-layout>
```

```javascript
// 組件內部定義
render() {
    return html`
        <header>${this.$slot('title')}</header>
        <main>${this.$slot()}</main>
    `;
}
```

---

## 💡 最佳實踐

1. **避免在 render 中處理副作用**: `render()` 應該是純函數，僅負責產出字串。
2. **優先使用事件委派**: 在 HTML 模板中使用 `onclick="this.closest('...').method()"` 是最 Vanilla 的做法，能減少記憶體佔用。
3. **複雜節點使用持久化策略**: 如果組件包含 Canvas、Video 或大型輸入框，建議在 `afterFirstRender` 中手動掛載，並避開 `render` 中的動態生成，以保證狀態不遺失。
