# ADR 0021: 內建教學文件中心 (Built-in Documentation Hub)

## 上下文
為了將專案從單純的 Demo 轉型為教學平台，我們需要讓使用者能直接在應用程式內閱讀技術文件。這需要一種方式來載入並渲染 Markdown 檔案。

## 決策
1.  **DocService**: 建立 `lib/doc-service.js` 負責 `fetch` 本地的 `docs/*.md` 檔案。
2.  **Vanilla MD Parser**: 實作一個輕量級的正規表達式解析器，將基礎 Markdown 語法轉換為 HTML。
    *   這符合「零相依性」與「Vanilla 精神」。
    *   雖然功能有限，但足以處理專案的技術指南。
3.  **Docs Component**: 建立 `components/pages/Docs.js` 提供側邊欄導航與內容展示。

## 後果
- **優點**: 使用者體驗大幅提升，無需切換至 GitHub 即可學習。
- **優點**: 展示了如何動態加載資源並進行簡單的文本處理。
- **缺點**: 正規表達式解析 Markdown 較為脆弱且功能受限（不支援複雜語法），若未來文件更複雜，可能需要更完備的解析方案。
