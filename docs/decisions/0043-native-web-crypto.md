# ADR 0043: 原生 Web Crypto 服務整合 (Native Web Crypto Integration)

## 上下文
在處理敏感數據（如使用者 Token、加密儲存）時，許多開發者習慣引入外部庫（如 CryptoJS）。然而，現代瀏覽器已內建了高效且安全的 **Web Crypto API**。為了保持專案的「零依賴」精神並提升安全性教學深度，我們需要一個原生的封裝方案。

## 決策
實作 `CryptoService`，其核心特性如下：
1.  **安全雜湊 (Hashing)**: 利用 `subtle.digest` 實作 SHA-256 雜湊，用於內容完整性校驗或密碼比對。
2.  **高強度加密 (Encryption)**: 採用 **AES-GCM (256-bit)** 算法進行數據加解密。
3.  **密鑰衍生 (Key Derivation)**: 使用 **PBKDF2** 將使用者輸入的密碼轉化為加密金鑰，確保密鑰強度。
4.  **異步實作**: 所有的 Web Crypto API 均為非同步 (Promise-based)，確保在處理大量數據時不會阻塞主執行緒。

## 後果
- **優點**: 實現了完全在客戶端運行的工業級加密能力，零外部體積開銷。
- **優點**: 避免了外部加密庫可能存在的供應鏈安全風險。
- **優點**: 展示了原生網頁 API 在處理複雜密碼學任務時的優雅方案。
- **缺點**: Web Crypto API 僅在安全上下文 (HTTPS/localhost) 下可用。
- **缺點**: API 使用門檻較高，需要對 ArrayBuffer 與二進位數據處理有基礎了解（本服務已簡化為字串接口）。
