# ADR 0057: SDK 型別與介面標準化 (Industrial SDK Design)

## 狀態
已提議 (Proposed)

## 背景
`plainvanillaweb` 目前的 SDK 入口 `lib/vanilla-sdk.js` 僅僅是簡單的服務彙整與導出。使用者反應 SDK 說明內容空洞且缺乏快速上手的設計。此外，部分服務在特定環境（如 GitHub Pages）下的配置不夠穩定。

## 決策
我們決定將 `VanillaSDK` 升級為一個具備「自動化配置」與「型別提示」能力的工業級入口。
1. **命名規範**：服務名稱應統一且具備語義化（例如 `speech` 而非 `speechService`）。
2. **單例入口 (VanillaSDK Hub)**：提供一個全域可用的 `VanillaSDK` 物件，並具備 `init()` 方法以進行環境自動偵測與配置。
3. **穩定性增強**：
    - **WebRTC**：內建穩定的公開 STUN Server 列表 (如 Google, Twilio)，確保 P2P 在靜態託管環境下可用。
    - **Speech**：在 SDK 初始化時自動檢查瀏覽器相容性。
4. **型別支持**：透過 JSDoc 補完所有服務的 API 提示，讓開發者在沒有 TypeScript 的情況下也能享受自動補全。

## 後果
- **優點**：大幅降低開發者使用門檻，提昇 SDK 的專業形象與穩定性。
- **缺點**：SDK 的體積會略微增加，但在 Tree-shaking 模式下影響有限。
