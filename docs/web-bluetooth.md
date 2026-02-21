# 📱 原生藍牙通訊 (Web Bluetooth API)

Web Bluetooth 讓瀏覽器具備了與物理世界互動的能力。透過低功耗藍牙 (BLE)，網頁可以直接控制硬體或讀取感測器數據。

## 🌟 核心開發規範

### 1. 安全與權限 (Security)
- **HTTPS Only**: 僅限安全上下文使用。
- **User Activation**: 必須由使用者點擊或按鍵後才能調用 `requestDevice()`。

### 2. 連線工作流 (Workflow)
一個標準的連線流程包含四個步驟：
1. **掃描 (Scan)**: `navigator.bluetooth.requestDevice(options)`
2. **連接 (Connect)**: `device.gatt.connect()`
3. **獲取服務 (Service)**: `server.getPrimaryService(uuid)`
4. **讀寫特徵 (Characteristic)**: `service.getCharacteristic(uuid)`

```javascript
const device = await navigator.bluetooth.requestDevice({
  filters: [{ services: ['heart_rate'] }]
});
const server = await device.gatt.connect();
```

## 🛠️ 最佳實踐
在 Vanilla 架構中，建議將 GATT 狀態維護在 `BluetoothService` 中，並透過事件通知 UI 更新。務必監聽 `gattserverdisconnected` 事件以實作自動恢復或狀態重置。

## 🎓 學習成果
進入 **「實驗室 (Lab)」** 中的 **「藍牙通訊」** 單元，您可以親自體驗從網頁搜尋並連接身邊 BLE 設備的完整流程。
