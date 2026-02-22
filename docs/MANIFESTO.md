# 🍦 Vanilla Manifesto (原生網頁開發宣言)

> 追求長青代碼 (Evergreen Code) 與極致效能的 Web 開發哲學

在各種前端框架與建置工具百家爭鳴的年代，**Plain Vanilla Web** 選擇了一條回歸本質的道路。我們拒絕過度封裝，擁抱瀏覽器逐漸成熟的原生能力。

本宣言定義了本專案的核心哲學。我們相信，這些原則能確保你的代碼在十年後，依然能無需任何編譯地在瀏覽器中流暢運行。

---

## 1. 標準優於框架 (Standards over Frameworks)
框架的生命週期會凋零，但 Web 標準永存。我們優先使用 **Custom Elements (Web Components)**、**CSS Variables** 與最新的 **Native Web APIs**，藉此打造具備最高跨平台相容性的應用。

## 2. 零建置成本 (Zero Build)
最好的建置步驟，就是沒有建置步驟。利用原生的 **ES Modules (ESM)**，我們讓開發回歸「存檔即重新整理 (Save & Refresh)」的最直覺體驗，徹底消滅複雜工具鏈帶來的維護負擔與等待時間。

## 3. 最小抽象 (Minimal Abstraction)
每一層抽象都是一種未來必須償還的債務。我們僅在絕對必要時建立輕量級的基底類別（如 `BaseComponent`），其目的在於**輔助**管理生命週期與宣告式渲染，而非**遮蔽**原生 API 的原始運作方式。

## 4. 透明性與可觀測性 (Transparency)
代碼應當易於理解與除錯。我們不使用黑盒魔法 (Black-box magic)。所有的狀態流向、DOM 更新機制與事件委派，都應清晰可見。這不僅是為了除錯，更是真正的生產力來源。

## 5. 安全的預設值 (Secure by Default)
在捨棄框架保護的同時，我們不向安全性妥協。透過實作自帶 XSS 防禦的 **SafeHTML 模板標籤**機制，我們證明了原生開發也能擁有與現代化框架同等嚴謹的自動轉義與安全渲染防護網。

## 6. 教育重於封裝 (Education as a Feature)
本專案不只是一個樣板 (Template)，更是一個開放的**互動式實驗室 (Hub)**。我們將前沿的 Web 技術（如 WebGPU、WebRTC、Web Bluetooth、PWA）剝離出艱澀的框架外殼，以最純粹的 Vanilla 型態展示，讓每一位開發者都能直接觸摸到瀏覽器強大能力的基石。

---

> *"Frameworks come and go, but the platform is forever."*
> —— 獻給所有熱愛原生平台能力的 Web 開發者。
