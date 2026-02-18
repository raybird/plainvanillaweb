# 原生 WebRTC P2P 通訊 (WebRTC P2P Communication)

WebRTC (Web Real-Time Communication) 讓瀏覽器具備了建立點對點 (Peer-to-Peer) 連線的能力，可以直接交換影像、語音與任意數據。

## 1. 核心流程：信令 (Signaling)

WebRTC 最具挑戰性的部分是建立連線前的「握手」過程。由於兩個瀏覽器互不認識，需要交換以下資訊：
- **SDP (Session Description)**：包含編碼支援、連線意圖等。
- **ICE Candidates**：包含對方的網路位址（公網 IP、內網 IP）。

本專案展示了 **「手動信令 (Manual Signaling)」** 模式，這是在沒有中介伺服器（如 WebSocket）時的極限做法。

## 2. DataChannel：數據傳輸

不同於傳輸音訊或視訊，`RTCDataChannel` 允許傳輸任意二進位或文字數據，且具備低延遲特性。

```javascript
// 建立通道 (發起方)
const channel = peerConnection.createDataChannel('my-channel');

// 接收訊息
channel.onmessage = (event) => {
    console.log('收到訊息:', event.data);
};

// 發送訊息
channel.send('Hello P2P!');
```

## 3. 本專案的實踐

在「實驗室 (Lab)」中，我們展示了：
1.  **無伺服器握手**：使用者手動複製本地 SDP 給對方，並貼上對方的 SDP。
2.  **即時通訊**：連線建立後，數據直接在兩個瀏覽器間傳輸，不經過任何伺服器。
3.  **零依賴實作**：不使用 Socket.io 或 WebRTC 框架，完全操作原生 API。

## 4. 注意事項

- **NAT 穿透**：本專案使用 Google 的免費 STUN 伺服器來獲取公網位址。
- **安全性**：WebRTC 本身強制對所有傳輸進行加密。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
