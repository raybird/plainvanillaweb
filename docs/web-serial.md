# 🔌 原生序列通訊 (Web Serial API)

Web Serial API 允許網頁應用程式與透過序列埠（如 USB 或藍牙虛擬串口）連接的硬體裝置進行通訊。這使網頁能夠直接控制 Arduino、感測器或工業設備。

## 🌟 為什麼需要 Web Serial？

以往網頁與硬體通訊需要透過中介軟體（如 Node.js 伺服器或專屬 App）。Web Serial 實現了：
1.  **零安裝**：使用者只需開啟瀏覽器即可控制硬體。
2.  **低延遲**：直接存取系統層級的串口通訊。
3.  **安全性**：基於權限請求機制，且必須在 Secure Context (HTTPS) 下由使用者觸發。

## 🛠️ 核心實作原理

### 1. 連接埠請求
必須由使用者操作觸發（如點擊按鈕）。
```javascript
const port = await navigator.serial.requestPort();
await port.open({ baudRate: 9600 });
```

### 2. 數據讀取 (Streams)
利用 Web Streams API 進行高效、非阻塞的讀取。
```javascript
const textDecoder = new TextDecoderStream();
const reader = textDecoder.readable.getReader();
const { value, done } = await reader.read();
```

### 3. 數據寫入
```javascript
const writer = port.writable.getWriter();
await writer.write(new TextEncoder().encode("HELLO
"));
writer.releaseLock();
```

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面體驗 Web Serial 通訊效果。這項技術是實作 IoT 儀表板、硬體調試工具或 Web 版整合開發環境 (IDE) 的核心能力。
