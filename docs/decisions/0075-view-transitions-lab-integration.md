# ADR 0075: 強化 View Transitions 教學頁整合

## 狀態

Accepted

## 背景

專案既有路由層已導入 `View Transitions API`，但缺少可直接操作的教學頁，使用者難以快速理解「路由過渡」與「元件狀態過渡」的差異。

## 決策

新增 `#/lab/view-transitions` 教學頁，並同步補齊技術手冊：

1. 透過 `document.startViewTransition()` 包裹同頁狀態切換。
2. 提供跨頁跳轉按鈕，讓使用者觀察路由切換過渡。
3. 保留不支援瀏覽器的降級路徑，確保功能一致性。
4. 在 Docs 導覽加入 View Transitions 專章，提升可發現性。

## 後果

- **優點**：教學從「已內建能力」提升為「可觀測、可操作」體驗。
- **優點**：維持零依賴動畫方案，與 Vanilla 原始精神一致。
- **缺點**：過渡效果仍受瀏覽器支援差異影響，需保留 fallback 說明。
