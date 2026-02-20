# 🎹 原生 MIDI 互動 (Web MIDI API)

Web MIDI API 讓瀏覽器具備了與音樂硬體（如電子琴、混音器、合成器）進行雙向通訊的能力，是構建網頁音樂工作站 (DAW) 的核心技術。

## 🌟 核心能力

### 1. 設備列舉與權限
透過 <code>navigator.requestMIDIAccess()</code> 獲取權限並掃描可用設備。
```javascript
const midiAccess = await navigator.requestMIDIAccess();
midiAccess.inputs.forEach(input => {
  console.log('偵測到輸入設備:', input.name);
});
```

### 2. 即時訊息處理
MIDI 數據以 3 位元組的陣列形式傳輸，包含指令類型、音高與力度。
```javascript
input.onmidimessage = (event) => {
  const [status, note, velocity] = event.data;
  // 解析 status 位元組獲取 Note On/Off 等資訊
};
```

### 3. 低延遲特性
API 設計旨在滿足音樂表演所需的極低延遲，配合 Web Audio API 可實現高效能的原生電子樂器。

## 🎓 學習成果
在 **「實驗室 (Lab)」** 中進入 **「MIDI 互動」** 單元，您可以連接實體 MIDI 設備並即時觀察訊號解析流程。
