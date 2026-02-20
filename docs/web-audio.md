# 🔊 原生音訊合成 (Web Audio API)

Web Audio API 是瀏覽器中處理、合成音訊的強大系統。它不像 <code>&lt;audio&gt;</code> 標籤只能播放檔案，而是能讓開發者從零開始建構複雜的數位合成器。

## 🌟 核心組件

### 1. AudioContext
所有音訊操作的容器。注意：瀏覽器要求必須在使用者點擊後才能啟動。
```javascript
const ctx = new AudioContext();
```

### 2. 振盪器 (Oscillator)
音源產生器，支援 sine, square, sawtooth, triangle 等波形。
```javascript
const osc = ctx.createOscillator();
osc.frequency.value = 440; // A4
osc.start();
```

### 3. 增益節點 (Gain)
用於控制音量或製作音效。
```javascript
const gain = ctx.createGain();
gain.gain.value = 0.5;
```

## 🎓 學習成果
進入 **「實驗室 (Lab)」** 中的 **「音訊合成」** 單元，您可以調整波形、音量，甚至配合 MIDI 鍵盤進行演奏。
