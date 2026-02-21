# 🍦 Vanilla Manifesto: 長青代碼準則

這是 `plainvanillaweb` 專案的核心靈魂，旨在定義一套能夠抵抗技術週期、保持極致效能與開發純粹性的原生開發方法論。

## 🌟 核心哲學

### 1. 永不過時 (Future-Proof)
基於 W3C/WHATWG 標準開發。代碼不依賴特定的商業公司維護的框架版本，減少因框架斷更或重大破壞性更新 (Breaking Changes) 導致的重構壓力。

### 2. 極致效能 (Performance First)
消滅 VDOM Diffing、編譯開銷與龐大的 Runtime 體積。原生 Custom Elements 的渲染效率始終處於瀏覽器第一梯隊。

### 3. 可遷移性 (Portability)
Vanilla 組件可以輕鬆嵌入任何現有專案（無論是 React, Vue 還是傳統後端模板），因為它們本質上就是標準的 HTML 標籤。

## 🛠️ 開發準則 (The Rules)

1.  **優先使用原生替代方案**：在引入 `npm` 套件前，先檢查 `MDN` 是否已有原生 API 支援。
2.  **擁抱 ESM**：堅持使用瀏覽器原生的模組化語法，不進行 Bundle。
3.  **顯式大於隱式**：寧可多寫幾行標準代碼，也不使用難以追蹤的隱式黑盒。
4.  **組件自治**：每個 Custom Element 應負責自身的狀態與樣式，實現真正意義上的模組化。

---

**Vanilla 不代表原始，而代表對 Web 平台的極致信任。**
