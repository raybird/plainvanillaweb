# 🪟 Popover API 原生彈出層

`Popover API` 讓網頁可以用瀏覽器原生能力建立彈出內容，不必額外引入大型 UI 套件。

## 🌟 為什麼用 Popover API

- **更輕量**：直接使用 HTML 屬性，減少 JavaScript 控制碼。
- **更一致**：由瀏覽器處理關閉行為（點外部、按 ESC），降低互動瑕疵。
- **更易維護**：宣告式與程式式都可用，能依場景切換。

## 🧩 基本用法

### 1) 宣告式觸發

```html
<button popovertarget="quick-help">開啟說明</button>

<div id="quick-help" popover>這是一個原生 popover。</div>
```

### 2) 程式式控制

```javascript
const panel = document.querySelector("#theme-panel");
panel.showPopover();
panel.hidePopover();
```

## 🛡️ 相容性與降級策略

- 先檢查：`'showPopover' in HTMLElement.prototype`
- 不支援時提供替代 UI（例如常駐區塊或 `<dialog>`）
- 避免把核心流程綁死在單一 API，維持功能可用

## 🎓 教學對應

在 `Lab` 的 `#/lab/popover` 可以看到兩種模式：

1. 宣告式 `popovertarget` 範例
2. 程式式 `showPopover()/hidePopover()` 範例
