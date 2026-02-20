# 🎞️ WebCodecs 低延遲編碼

`WebCodecs` 讓前端可以直接操作瀏覽器的影音編解碼器，降低傳統媒體管線的抽象成本，適合即時串流、視訊分析與低延遲轉碼場景。

## 🌟 為什麼用 WebCodecs

- **低延遲**：直接控制 `VideoEncoder` / `VideoDecoder`，縮短資料處理路徑。
- **高掌控**：可自行決定 codec、bitrate、keyframe 策略與時間戳。
- **原生整合**：可與 Canvas、WebRTC、Insertable Streams 組合成純原生管線。

## 🧩 基本用法

```javascript
const encoder = new VideoEncoder({
  output: (chunk) => {
    console.log("encoded bytes", chunk.byteLength);
  },
  error: (err) => console.error(err),
});

encoder.configure({
  codec: "vp8",
  width: 640,
  height: 360,
  bitrate: 800_000,
  framerate: 30,
  latencyMode: "realtime",
});

const frame = new VideoFrame(canvasElement, { timestamp: 0 });
encoder.encode(frame, { keyFrame: true });
frame.close();
await encoder.flush();
encoder.close();
```

## 🛡️ 相容性與降級策略

- 先檢查：`typeof VideoEncoder === "function"`
- `VideoEncoder.isConfigSupported(config)` 驗證 codec 可用性
- 不支援時顯示替代提示，保留教學流程可讀性

## 🎓 教學對應

在 `Lab` 的 `#/lab/webcodecs` 可直接體驗：

1. 切換 `VP8 / VP9 / H.264` codec
2. 以合成影格執行低延遲編碼
3. 檢視 chunk 數量、總位元組、平均 chunk 與耗時
