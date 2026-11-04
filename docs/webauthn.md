# 🔐 原生生物辨識驗證 (WebAuthn API)

WebAuthn (Web Authentication) 是一個全球標準，允許網頁利用使用者裝置原生的安全硬體（如 FaceID, TouchID, Windows Hello 或 YubiKey）進行身分驗證。

## 🌟 為什麼需要 WebAuthn？

WebAuthn 解決了傳統密碼的許多安全痛點：
1.  **防釣魚 (Phishing-resistant)**：憑證與特定網域綁定，偽造網站無法誘騙使用者提供憑證。
2.  **無密碼體驗 (Passwordless)**：使用者只需透過生物辨識即可登入，無需記憶複雜密碼。
3.  **高強度安全**：使用非對稱加密（公鑰與私鑰），私鑰永遠不會離開使用者的硬體安全模組。

## 🛠️ 核心實作原理

### 1. 憑證註冊 (Registration)
網頁向瀏覽器請求建立新憑證。
```javascript
const credential = await navigator.credentials.create({
  publicKey: {
    challenge: challengeFromServer, // 伺服器發出的挑戰值 (Uint8Array)
    rp: { name: "Plain Vanilla Web", id: location.hostname }, // 必填：Relying Party
    user: { id: userIdBytes, name: "raybird", displayName: "Raybird" },
    pubKeyCredParams: [{ alg: -7, type: "public-key" }]
  }
});
```

### 2. 登入驗證 (Authentication)
網頁請求使用者透過生物辨識確認身分。
```javascript
const assertion = await navigator.credentials.get({
  publicKey: {
    challenge: challengeFromServer,
    allowCredentials: [{ id: credentialId, type: "public-key" }] // 註冊時取得的 rawId
  }
});
```

### 3. 安全要求
必須在 **HTTPS** 環境下執行（localhost 除外），否則 <code>navigator.credentials</code> 會是未定義。

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面進入 **「生物辨識」** 單元體驗效果。這項技術是目前網頁應用程式所能達到的最高安全等級驗證方案。
