# 🎨 EyeDropper API 原生取色

`EyeDropper API` 讓網頁可直接呼叫瀏覽器取色器，從目前畫面擷取像素顏色，適合主題客製化、品牌色選擇與設計工具。

## 🌟 為什麼用 EyeDropper API

- **原生能力**：不需要第三方取色元件，降低維護成本。
- **使用直覺**：使用者可直接在畫面上點選目標顏色。
- **可延伸性高**：可串接主題系統、圖表配色與設計 token。

## 🧩 基本用法

```javascript
if ("EyeDropper" in window) {
  const eyeDropper = new EyeDropper();
  const { sRGBHex } = await eyeDropper.open();
  console.log("picked:", sRGBHex);
}
```

## 🛡️ 相容性與降級策略

- 先檢查：`"EyeDropper" in window`
- 不支援時顯示提示訊息，並保留預設色票供選擇
- `open()` 被取消時會拋出 `AbortError`，應安靜處理避免干擾體驗

## 🎓 教學對應

在 `Lab` 的 `#/lab/eyedropper` 可以直接體驗：

1. 從畫面擷取顏色並回填色票
2. 用擷取色即時更新預覽卡片
3. 觀察不支援環境的降級提示策略
