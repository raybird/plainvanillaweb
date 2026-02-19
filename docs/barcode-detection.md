# 🔍 原生掃碼辨識 (Barcode Detection API)

Barcode Detection API 允許網頁直接利用設備的硬體加速來辨識影像中的條碼與 QR Code。這大幅提昇了辨識速度，且無需載入笨重的第三方 JS 庫。

## 🌟 為什麼需要 Barcode API？

以往在網頁實作掃碼需要引入數百 KB 的演算法庫（如 `jsQR`）。原生 API 實現了：
1.  **極致效能**：利用底層作業系統與 GPU 進行辨識，延遲極低。
2.  **多格式支援**：原生支援 QR Code, EAN-13, Code 128, Data Matrix 等工業標準。
3.  **節省資源**：零額外套件下載，對行動裝置更友善。

## 🛠️ 核心實作原理

### 1. 初始化檢測器
您可以指定要監測的格式清單。
```javascript
const detector = new BarcodeDetector({
  formats: ['qr_code', 'ean_13', 'code_128']
});
```

### 2. 即時辨識 (Detection Loop)
結合攝像頭 <code>video</code> 標籤與 <code>requestAnimationFrame</code>。
```javascript
const barcodes = await detector.detect(videoElement);
barcodes.forEach(barcode => {
  console.log('偵測到內容：', barcode.rawValue);
});
```

### 3. 安全限制
必須在 **HTTPS** 環境下執行，且需先取得使用者授權開啟攝像頭。

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面進入 **「條碼辨識」** 單元體驗效果。這項技術是實作智慧倉儲、行動支付或實體互動應用的核心組件。
