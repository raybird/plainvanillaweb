# 🔊 原生音訊合成 (Web Audio API)

Web Audio API 是瀏覽器中處理、合成音訊的強大系統。它不像 `<audio>` 標籤只能播放檔案，而是能讓開發者從零開始建構複雜的數位合成器。

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
進入 **「實驗室 (Lab)」** 中的 **「音訊合成」** 單元，啟動音訊引擎後即可切換波形、以滑桿調整主音量（作用在 `masterGain`）；點擊「🔌 開啟 MIDI 聯動」會在需要時請求 MIDI 存取權，之後即可用實體 MIDI 鍵盤演奏，離開頁面時自動解除聯動。
