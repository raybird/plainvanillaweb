# 🗣️ 原生語音服務 (Web Speech API)

本專案利用瀏覽器內建的 **Web Speech API** 實作了零依賴的語音交互功能，包含 **文字轉語音 (TTS)** 與 **語音辨識 (STT)**。

## 🚀 核心服務：SpeechService

我們將語音功能封裝在 `lib/speech-service.js` 中，提供一致的接口供 UI 組件呼叫。

### 1. 文字轉語音 (Speech Synthesis)

透過 `window.speechSynthesis` 將網頁文字朗讀出來，這對提升無障礙體驗非常有幫助。

```javascript
import { speechService } from './lib/speech-service.js';

// 基本使用
speechService.speak('歡迎來到 Vanilla Web！');

// 自定義語言 (預設 zh-TW)
speechService.speak('Hello World', 'en-US');
```

### 2. 語音辨識 (Speech Recognition)

透過 `SpeechRecognition` API（在某些瀏覽器為 `webkitSpeechRecognition`）將麥克風輸入轉為文字。

```javascript
import { speechService } from './lib/speech-service.js';

// 監聽辨識結果
speechService.on('result', (data) => {
    console.log('辨識結果:', data.text);
});

// 開始傾聽
speechService.startListening();

// 停止傾聽
speechService.stopListening();
```

## 🧪 實戰 Demo 總覽

本專案在多個地方整合了語音功能，您可以前往體驗：

1.  **[Vanilla 實驗室](#/lab)**：
    - **TTS 測試**：輸入任意文字並點擊「🔊 朗讀文字」。
    - **STT 測試**：點擊「🎤 開始辨識」並說話，觀察即時辨識結果。
2.  **[教學文件頁面](#/docs)**：
    - **文件朗讀**：點擊右上方「🔊 語音朗讀」按鈕，系統將自動提取目前文件的純文字進行朗讀。
3.  **[GitHub 專案搜尋](#/search)**：
    - **語音搜尋**：點擊搜尋框旁的「🎤」圖示，說出專案關鍵字（如 "React"）即可自動填充並執行搜尋。

## ⚠️ 瀏覽器相容性

- **Speech Synthesis (TTS)**：幾乎所有現代瀏覽器（Chrome, Firefox, Safari, Edge）皆完整支援。
- **Speech Recognition (STT)**：
  - **Chrome & Edge**：支援度最佳。
  - **Safari**：支援部分功能。
  - **Firefox**：預設禁用，需在 `about:config` 手動開啟。

本服務已內建相容性偵測，若瀏覽器不支援將會透過 `notificationService` 提示使用者。
