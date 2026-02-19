# 📝 原生響應式表單 (Reactive Forms)

在複雜的 Web 應用中，管理表單狀態（如：是否被修改過、是否正在驗證、錯誤訊息管理）是一項艱鉅的任務。本專案實作了一套零相依的 **響應式表單引擎**，提供如同 Angular 或 React Hook Form 般的開發體驗。

## 🌟 為什麼需要表單引擎？

瀏覽器內建的 `Constraint Validation API` (如 `required`, `pattern`) 雖然好用，但在處理以下情境時顯得不足：
1.  **跨欄位驗證**：例如「密碼」與「確認密碼」必須一致。
2.  **非同步檢查**：例如「檢查使用者名稱是否已存在」。
3.  **狀態顆粒度**：需要知道使用者是否「觸碰過 (Touched)」欄位，以避免在使用者尚未輸入前就顯示錯誤。

## 🛠️ 核心概念

### 1. FormControl (單一欄位)
封裝單一資料點的值與驗證狀態。
```javascript
const name = new FormControl('初始值', [Validators.required]);
name.on('status-change', s => console.log(s.valid));
```

### 2. FormGroup (表單群組)
將多個 `FormControl` 彙整，提供整體的合法性 (Validity) 與 數值 (Value)。

### 3. 狀態追蹤 (Status Tracking)
- **Touched**: 使用者是否已點擊過該欄位並移開。
- **Dirty**: 欄位值是否已被修改。
- **Pending**: 非同步驗證是否正在執行中。

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面體驗響應式註冊表單。它展示了如何實作即時驗證回饋與「admin」帳號重複檢查的非同步效果。
