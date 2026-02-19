# 🧩 原生元件封裝 (Shadow DOM Encapsulation)

Shadow DOM 是網頁元件 (Web Components) 標準中最核心的隔離機制。它允許開發者將 CSS 樣式、JavaScript 行為與 HTML 結構封裝在一個獨立的「陰影樹 (Shadow Tree)」中，不與主文檔互相干擾。

## 🌟 為什麼需要 Shadow DOM？

1.  **真正的樣式隔離**：在 Shadow DOM 中定義的 CSS 不會洩漏到外部，全域 CSS 也不會輕易滲透進來。這解決了惱人的 CSS 名稱衝突問題。
2.  **DOM 結構保護**：外部腳本（如 `document.querySelectorAll`）無法輕易訪問組件內部的私人元素。
3.  **封裝性與重用性**：非常適合開發第三方 Widget 或工業級 UI 庫。

## 🛠️ 在 Plain Vanilla 中的實作

我們的 `BaseComponent` 現在支援透過靜態屬性 `static useShadow = true` 來啟用隔離模式。

### 範例：建立隔離組件

```javascript
import { BaseComponent } from '../lib/base-component.js';

export class MyIsolatedWidget extends BaseComponent {
    static useShadow = true;

    render() {
        return `
            <style>
                :host { display: block; padding: 1rem; border: 1px solid #ccc; }
                .private-tag { color: red; font-weight: bold; }
            </style>
            <div class="private-tag">
                這是一個受 Shadow DOM 保護的組件。
            </div>
            ${this.$slot()}
        `;
    }
}
customElements.define('my-isolated-widget', MyIsolatedWidget);
```

## 🎨 樣式穿透 (Style Piercing)

雖然 Shadow DOM 提供了隔離，但我們仍需要一種方式讓外部環境對組件進行主題化。

1.  **CSS Variables**：組件內部可以使用 `--theme-color`，外部透過定義變數來傳遞樣式。
2.  **::part 偽類**：組件可以標記特定的元素（如 `<button part="action-btn">`），外部則使用 `my-component::part(action-btn)` 來選取並設定樣式。

## 🎓 結論

透過 Shadow DOM，您可以開發出真正「長青 (Evergreen)」且「原子化」的網頁組件，無論將其部署在哪種框架或老舊網站中，其視覺表現都能始終如一。
