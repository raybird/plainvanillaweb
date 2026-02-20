# 🔗 技術手冊與 Lab 雙向快參照

為了降低查找成本，專案新增「技術手冊 ↔ 實驗室」雙向導覽機制，讓使用者可在學習與操作之間快速來回。

## 🌟 目標

- **快速切換情境**：閱讀概念後可立即跳到操作頁。
- **減少導航成本**：不用再手動回首頁找對應項目。
- **維持 Vanilla-first**：僅用原生 hash 路由與既有組件完成導覽。

## 🧩 目前實作

1. **Docs 端導向 Lab**：當文件有對應實驗時，文件頁標頭顯示「🧪 對應實驗室」按鈕。
2. **Lab 端導向 Docs**：Lab 首頁卡片新增「技術手冊」連結，直接打開該主題文件。
3. **深連結支援**：可直接使用 `#/docs/<doc-id>` 進入指定文件。

## 🧪 範例

- `#/lab/webcodecs` ↔ `#/docs/webcodecs`
- `#/lab/view-transitions` ↔ `#/docs/view-transitions`
- `#/lab/webauthn` ↔ `#/docs/webauthn`
- `#/lab/permissions` ↔ `#/docs/permissions-preflight`
- `#/lab/web-share` ↔ `#/docs/web-share`

## 📌 後續可擴充

- 在文件底部加入「下一個推薦實驗」導覽。
- 針對手機版提供固定底部快取導覽列。

## 📱 手機版可用性檢查

- Docs 導覽在小螢幕會改為可換行 chip 清單，避免側欄擠壓內容。
- 文件頁右上操作按鈕（對應實驗室/語音朗讀）在手機版會自動展開為等寬按鈕。
- 觸控熱區提升到 `min-height: 44px`，降低誤觸。
