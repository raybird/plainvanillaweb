# ADR 0068: 引入原生 WebAuthn 生物辨識支援

## 狀態
已提議 (Proposed)

## 背景
現代網頁應用程式越來越依賴無密碼 (Passwordless) 驗證。WebAuthn 是一個強大的標準，允許網頁利用裝置原生的生物辨識 (如 TouchID, FaceID) 或實體安全金鑰 (如 YubiKey) 進行身分驗證，能有效防止釣魚攻擊與密碼洩漏。

## 決策
實作基於 `navigator.credentials` 的服務模組。
1. **安全性考量**：WebAuthn 強制要求 HTTPS 安全上下文。
2. **資料儲存**：由於本專案為 Vanilla 前端，我們將使用 `localStorage` 模擬伺服器端儲存公鑰 (Public Key Credential) 的行為。
3. **流程簡化**：封裝複雜的 Challenge 與 ArrayBuffer 處理邏輯，提供簡單的 `register` 與 `login` 介面。
4. **相容性處理**：提供 `isSupported` 檢查，並針對不支持的環境提供降級提示。

## 後果
- **優點**：極致的安全性與使用者體驗，展現原生 Web API 處理高安全性任務的能力。
- **缺點**：WebAuthn 流程涉及較多非同步操作與二進位數據處理，實作複雜度較高。
