# 📡 原生近場通訊 (Web NFC API)

Web NFC 允許網頁應用程式在靠近 NFC 標籤時，讀取與寫入標籤內容。這為網頁解鎖了如庫存管理、實體互動遊戲與身分識別等全新能力。

## 🌟 為什麼需要 Web NFC？

傳統上，NFC 通訊需要透過原生 App。Web NFC 實現了：
1.  **即時互動**：使用者無需安裝 App，掃描 QR Code 開啟網頁後即可與實體設備互動。
2.  **標準化數據**：使用 NDEF (NFC Data Exchange Format) 格式，跨平台相容性高。
3.  **安全性**：嚴格限制在 HTTPS 下，且必須由使用者點擊按鈕後觸發。

## 🛠️ 核心實作原理

### 1. 開始掃描 (Reading)
```javascript
const reader = new NDEFReader();
await reader.scan();
reader.onreading = (event) => {
  const serialNumber = event.serialNumber;
  // 處理 NDEF 記錄...
};
```

### 2. 寫入標籤 (Writing)
```javascript
const writer = new NDEFReader();
await writer.write("Hello NFC from Vanilla!");
```

### 3. 解析數據
NFC 數據通常包含多筆記錄。
```javascript
for (const record of message.records) {
  if (record.recordType === "text") {
    const textDecoder = new TextDecoder();
    console.log(textDecoder.decode(record.data));
  }
}
```

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面進入 **「近場通訊」** 單元體驗效果。這項技術是實現實體世界與數位網頁無縫連結的關鍵橋樑。
