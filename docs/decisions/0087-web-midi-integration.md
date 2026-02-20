# ADR 0087: 原生 Web MIDI API 整合

## 狀態
已接受 (Accepted)

## 背景
`plainvanillaweb` 旨在展示網頁原生的多媒體與硬體互動能力。Web MIDI API 允許網頁與電子樂器、控制器等 MIDI 設備進行通訊，這是在音訊創作與硬體控制領域極具代表性的原生技術。

## 決策
建立一個專屬的 MIDI 實驗室頁面，整合 Web MIDI API。
1. **設備偵測**：實作 MIDI 設備的列舉與熱插拔監聽。
2. **訊息解析**：實作對 MIDI 訊息 (Note On/Off, Control Change) 的即時解析與展示。
3. **視覺化反饋**：提供虛擬鋼琴或指示燈，即時反應硬體輸入。
4. **三位一體同步**：建立 `midi-service.js`、`MIDIPage.js`，撰寫 `web-midi.md` 文檔。

## 後果
- **優點**：展示網頁在專業音樂製作與低延遲硬體通訊上的潛力。
- **缺點**：Web MIDI API 目前在部分行動瀏覽器（如 iOS Safari）上尚未支援，需實作 Feature Detection。
