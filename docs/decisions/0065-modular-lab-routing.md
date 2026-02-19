# ADR 0065: 實驗室模組化與巢狀路由架構

## 狀態
已接受 (Accepted)

## 背景
隨著 `plainvanillaweb` 的功能不斷增加，原本單一的 `Lab.js` 組件已膨脹至 700 行以上，承載了超過 10 個不同的 Web API 實驗。這導致了嚴重的狀態污染問題，單一功能的初始化失敗會導致整個頁面崩潰（如 `map of undefined` 錯誤）。

## 決策
實施實驗室功能的完全模組化與巢狀路由 (Nested Routing)。
1.  **目錄重構**：建立 `components/pages/lab/` 目錄，將每個實驗項目拆分為獨立的子組件。
2.  **路由隔離**：主 `page-lab` 演進為佈局容器 (Layout Container)，內部使用 `<x-switch>` 根據 `#/lab/ID` 分發請求。
3.  **狀態解耦**：每個子組件 (`SpeechPage`, `WebRTCPage` 等) 僅負責自身的 `initReactiveState`，實現真正的實體隔離。

## 後果
- **優點**：極致的穩定性（錯誤不蔓延）、更容易維護、支援深度連結。
- **缺點**：檔案數量增加，需要管理更多的 ESM 匯入。
