# ADR 0093: 原生 Web Bluetooth 整合與硬體通訊規範

## 狀態
已接受 (Accepted)

## 背景
`plainvanillaweb` 旨在展示瀏覽器的極限能力。Web Bluetooth API 允許網頁直接與低功耗藍牙 (BLE) 設備通訊，這是在 IoT 與穿戴式裝置應用中極具代表性的原生技術。目前專案已有基礎服務，但缺乏完整的教學實驗室與架構文件。

## 決策
建立一個專業的藍牙通訊實驗室與開發規範：
1. **設備生命週期管理**：規範從 `requestDevice`、`gatt.connect` 到服務與特徵值 (Characteristic) 的獲取流程。
2. **實時數據流**：利用 `startNotifications` 實作非同步數據訂閱模式。
3. **錯誤防禦**：針對 User Gesture 要求與 Secure Context 進行明確引導。
4. **三位一體同步**：實作 `BluetoothPage.js`，撰寫 `web-bluetooth.md` 文檔。

## 後果
- **優點**：向開發者展示如何在網頁上實現工業級的硬體控制。
- **缺點**：Web Bluetooth 在多數行動端瀏覽器（如 iOS）支援有限，需強調 Chrome/Edge 桌面版的重要性。
