# ADR 0073: 引入原生 Badging API 應用徽章

## 狀態

Accepted

## 背景

專案已涵蓋通知與多項 PWA 能力，但缺少「未讀數徽章」這類系統層提醒機制。為了讓教學更貼近實務訊息中心與任務中心場景，需要導入 Badging API。

## 決策

導入 `Badging API` 作為 Lab 新項目，採用以下整合策略：

1. 在 `#/lab/badging` 提供未讀數設定、遞增遞減與清除操作。
2. 若環境支援，使用 `navigator.setAppBadge()` / `navigator.clearAppBadge()`。
3. 若不支援，降級為 `document.title` 前綴顯示，保持教學可觀察性。
4. 提供狀態回饋與最後操作紀錄，降低 API 可見性不足問題。

## 後果

- **優點**：補齊 PWA 實務中常見的未讀提醒能力。
- **優點**：維持 Vanilla-first 與零第三方依賴。
- **缺點**：平台支援度不一致，需維持降級策略與相容性說明。
