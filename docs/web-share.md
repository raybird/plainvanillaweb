# 原生 Web 分享與接收 (Web Share & Target)

Web Share API 可直接呼叫作業系統分享面板；Web Share Target 則讓 PWA 成為「可被分享到」的目標。

## 1) 內容分享 (`navigator.share`)

適合手機情境，能把標題、文字、網址交給系統原生分享流程。

```javascript
async function shareContent() {
  try {
    await navigator.share({
      title: "Plain Vanilla Web",
      text: "這是我整理的原生 Web 教學頁",
      url: "https://example.com/#/docs/web-share",
    });
    console.log("分享成功");
  } catch (error) {
    if (error?.name === "AbortError") {
      console.log("使用者取消分享");
      return;
    }
    console.error("分享失敗", error);
  }
}
```

## 2) 接收分享 (`share_target`)

在 `manifest.json` 宣告 `share_target` 後，系統可把外部分享資料導向你指定的 hash route。

```json
"share_target": {
  "action": "#/lab/web-share",
  "method": "GET",
  "params": {
    "title": "share_title",
    "text": "share_text",
    "url": "share_url"
  }
}
```

接收頁可從 hash query 解析資料，例如：

```text
#/lab/web-share?share_title=...&share_text=...&share_url=...
```

## 3) 路由注意事項（Hash + Query）

若你使用 hash router，路由匹配時要先忽略 query，再做 path 比對。
否則像 `#/lab/web-share?share_title=...` 可能被視為不匹配而掉回 fallback。

## 4) 本專案教學實作

- Lab 範例：`#/lab/web-share`
- 支援能力偵測與錯誤處理（含取消分享）
- 不支援時提供剪貼簿降級
- 顯示 Share Target 進站資料（`share_title/share_text/share_url`）

可直接從文件跳到 Lab：`#/lab/web-share`
