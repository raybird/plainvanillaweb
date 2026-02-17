# ADR 0035: 原生身分驗證與路由保護 (Native Auth System & Route Guards)

## 上下文
現代網頁應用通常包含需要登入才能存取的私有區域（如個人資料、後台數據）。我們需要一套與原生路由系統相容的身分驗證機制。

## 決策
實作 **`AuthService`** 並整合至路由系統：
1.  **AuthService**: 負責管理 `localStorage` 中的憑證 (Mock Token) 與使用者資訊。提供 `login()`, `logout()` 與 `isAuthenticated` 狀態。
2.  **受保護路由 (AuthRequired)**: 擴充 `x-route` 支援 `auth-required` 屬性。
3.  **路由攔截 (Guard)**: 在 `x-switch` 的更新邏輯中加入攔截器。若使用者試圖進入標記為 `auth-required` 的路由但未登入，系統會自動將其導向至 `#/login`。
4.  **響應式 UI**: `App` 組件監聽 `AuthService` 的變更事件，即時更新導航列中的登入/登出狀態與使用者資訊。

## 後果
- **優點**: 實現了與主流框架一致的導航保護體驗，且完全不依賴外部 Auth SDK。
- **優點**: 保持了宣告式路由的簡潔性 (只需在 HTML 標籤加屬性)。
- **缺點**: 由於是純前端攔截，對於後端資源的真實保護仍需配合 API 層級的 Token 校驗（這在教學範例中已透過 mock 體現）。
