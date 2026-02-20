# ADR 0088: 原生 Web Audio 合成器 (Oscillator) 實驗室整合

## 狀態
已接受 (Accepted)

## 背景
`plainvanillaweb` 已具備 Web MIDI 支援，但缺乏原生的音訊產生能力。Web Audio API 是瀏覽器處理音訊的核心，透過實作振盪器 (Oscillator) 與增益節點 (GainNode)，可以讓網頁直接發出聲音，完成「MIDI 輸入 -> 音訊輸出」的原生閉環。

## 決策
建立一個專屬的音訊合成實驗室頁面。
1. **聲道管理**：實作 `audio-service.js` 封裝 `AudioContext`。
2. **實時合成**：提供多種波形（Sine, Square, Sawtooth, Triangle）切換與頻率調整。
3. **MIDI 聯動**：支援 Web MIDI 訊息直接驅動合成器發聲（音高對應）。
4. **三位一體同步**：建立 `AudioPage.js`，撰寫 `web-audio.md` 文檔。

## 後果
- **優點**：展現瀏覽器在數位音訊處理 (DSP) 上的強大原生能力。
- **缺點**：`AudioContext` 必須由使用者互動（如點擊）後才能啟動，需實作自動恢復機制。
