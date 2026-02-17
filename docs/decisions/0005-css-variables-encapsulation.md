# ADR 0005: CSS 變數封裝規範 (CSS Variables Encapsulation)

## 上下文
為了避免全域 CSS 污染，同時維持 Plain Vanilla 的簡單性，我們需要一種不依賴 Shadow DOM 但具備封裝感的樣式方案。

## 決策
採用 **「組件前綴變數」** 規範。每個組件在其宿主元素上定義局部變數。

## 範例
```css
page-home {
  --home-bg: #eee;
  background: var(--home-bg);
}
```

## 後果
- **優點**: 樣式作用域清晰，且能輕鬆透過全域 CSS 覆寫（Theming）。
- **優點**: 維持 100% 原生 Light DOM，對 SEO 與 A11y 友善。
