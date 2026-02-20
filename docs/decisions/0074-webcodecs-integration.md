# ADR 0074: 引入原生 WebCodecs 低延遲編碼教學

## 狀態

Accepted

## 背景

專案已具備即時串流處理能力，但在「原生編解碼控制」仍缺少可觀測、可操作的教學頁。使用者也要求在演進項目中補強 `WebCodecs` 能力。

## 決策

導入 `WebCodecs` Lab 項目，採用以下整合策略：

1. 新增 `#/lab/webcodecs`，提供 codec 切換與編碼啟動/停止控制。
2. 使用合成 Canvas 影格作為輸入，避免裝置權限與環境差異干擾核心教學。
3. 採用 `VideoEncoder` 的 `latencyMode: "realtime"`，並顯示 chunk、總位元組與耗時。
4. 建立 `VideoEncoder.isConfigSupported` 檢查與不支援降級提示。

## 後果

- **優點**：補齊前端原生影音能力版圖，形成從串流處理到編解碼的完整教學鏈。
- **優點**：維持 Vanilla-first、零第三方依賴，便於閱讀與延伸。
- **缺點**：WebCodecs 支援度受瀏覽器版本與平台限制，需保留相容性說明。
