# ADR 0079: WebGPU 運算實驗室整合

## 狀態

已接受 (Accepted)

## 背景

`plainvanillaweb` 已在 `lib/webgpu-service.js` 中實作了 WebGPU 的基礎封裝，但一直缺乏一個直觀的實驗室頁面來展示其超越 JavaScript 的平行運算能力。WebGPU 是現代網頁高效能計算（如 AI 推理、複雜物理模擬、3D 渲染）的基石。

## 決策

建立一個專屬的 WebGPU 實驗室頁面，展示 Compute Shader 的實際應用。

1.  **實作目標**：建立 `WebGPUPage.js`，展示一個「數值倍增」的平行運算範例（GPGPU）。
2.  **視覺化回饋**：提供輸入數組、運算狀態以及 GPU 傳回結果的對比。
3.  **錯誤處理**：處理瀏覽器不支援 WebGPU（如未開啟 Flag 或非 Secure Context）的情況，並顯示友好的降級提示。
4.  **三位一體同步**：確保該頁面能透過 `#/lab/webgpu` 直接存取，並與 `webgpu.md` 技術手冊建立雙向連結。

## 後果

- **優點**：向開發者展示網頁已具備調用硬體加速進行通用運算的能力，擴展 Vanilla 應用的性能邊界。
- **缺點**：WebGPU 目前相容性仍有限（主要在 Chromium 系最新版本），需要明確的相容性提示。
