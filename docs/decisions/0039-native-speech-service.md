# ADR 0039: 原生語音服務與實驗室 (Native Speech Service & Lab)

## 上下文
為了展示原生 Web API 的廣度，並提升應用的無障礙 (Accessibility) 水準，我們需要一套語音交互機制。

## 決策
實作基於 **Web Speech API** 的 `SpeechService` 並開設 `LabPage`：
1.  **SpeechSynthesis**: 實作 `speak()` 方法，將純文字轉換為自然語言語音。
2.  **SpeechRecognition**: 實作語音辨識監聽，將使用者的語音輸入轉換為文字。
3.  **Vanilla 實驗室**: 建立一個專門的 `Lab` 路由，作為展示實驗性功能（如語音技術）的場域。
4.  **事件驅動**: 服務透過 `emit()` 發送辨識結果與狀態事件，組件則透過反應式狀態更新 UI。

## 後果
- **優點**: 展示了瀏覽器內建的強大媒體處理能力，無需依賴外部收費 API。
- **優點**: 為視障使用者提供了更好的交互基礎。
- **優點**: 擴充了專案作為教學平台的廣度。
- **缺點**: `SpeechRecognition` 在不同瀏覽器間的支援度不一（目前 Chrome/Edge 支援較好），需處理相容性降級。
