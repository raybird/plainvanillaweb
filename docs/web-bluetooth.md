# 原生 Web 藍牙通訊 (Web Bluetooth)

現代瀏覽器讓網頁具備了與鄰近藍牙低功耗 (BLE) 裝置溝通的能力，不需安裝任何驅動程式。

## 1. 核心安全規範

由於涉及實體裝置存取，Web Bluetooth 有極嚴格的安全限制：
- **安全上下文**：僅能在 HTTPS 或 localhost 下運作。
- **使用者觸發**：搜尋裝置的操作必須由使用者明確的互動（如點擊按鈕）觸發。
- **權限授權**：使用者必須在瀏覽器彈出的選單中親自選取裝置。

## 2. 存取流程 (GATT)

Web Bluetooth 基於通用屬性設定檔 (GATT) 運作：
1.  **Request Device**：搜尋具備特定服務或名稱的裝置。
2.  **Connect**：連線至裝置的 GATT 伺服器。
3.  **Get Service**：獲取特定的服務（如電池資訊、心率）。
4.  **Get Characteristic**：獲取服務下的特徵值，進行讀寫或訂閱。

```javascript
const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true
});
const server = await device.gatt.connect();
```

## 3. 本專案的實踐

在「實驗室 (Lab)」中，我們展示了：
1.  **可用性偵測**：檢查瀏覽器是否支援藍牙。
2.  **裝置掃描**：啟動原生的裝置選取介面。
3.  **資訊獲取**：獲取所選裝置的名稱與基本狀態。

## 4. 平台相容性

- **支援**：Chrome, Edge, Opera (Android, macOS, Windows, Linux)。
- **不支援**：iOS (所有瀏覽器), Firefox (預設關閉)。

---
*本文件為 Plain Vanilla Web 教學系列的一部分。*
