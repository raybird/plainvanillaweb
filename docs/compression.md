# 🗜️ 原生數據壓縮流 (Compression Streams API)

Compression Streams API 允許網頁應用程式利用瀏覽器內建的壓縮引擎，以流 (Stream) 的方式對數據進行 Gzip 或 Deflate 壓縮與解壓縮。

## 🌟 為什麼需要 Compression API？

以往在網頁處理壓縮需要引入如 `pako` 或 `zlib.js` 等第三方函式庫（體積約數十至上百 KB）。原生 API 實現了：
1.  **零依賴**：完全無需下載額外套件，減少 JS bundle 體積。
2.  **效能卓越**：利用瀏覽器底層優化的 C++ 實作，運算速度與省電效率均優於 JS 版本。
3.  **流式處理**：支援直接對 <code>ReadableStream</code> 進行轉換，非常適合處理大型檔案或即時日誌。

## 🛠️ 核心實作原理

### 1. 壓縮數據 (Compression)
```javascript
const stream = new Blob(["要壓縮的文字內容"]).stream();
const compressionStream = new CompressionStream("gzip");
const compressedStream = stream.pipeThrough(compressionStream);

const response = new Response(compressedStream);
const buffer = await response.arrayBuffer();
const bytes = new Uint8Array(buffer); // 得到 Uint8Array 格式的 Gzip 數據
```

### 2. 解壓縮數據 (Decompression)
```javascript
const decompressionStream = new DecompressionStream("gzip");
const decompressedStream = blob.stream().pipeThrough(decompressionStream);
const text = await new Response(decompressedStream).text();
```

## 🎓 學習成果
您可以在 **「實驗室 (Lab)」** 頁面進入 **「數據壓縮流」** 單元體驗效果。這項技術對於優化 IndexedDB 儲存空間、減少資料回傳頻寬具有顯著價值。
