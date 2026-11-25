/**
 * Browser Computing Farm 的圖片處理 Worker（module worker，#11）。
 * 收到 `{ id, blob, params }`，以 OffscreenCanvas 縮放與轉換格式後回傳 `{ id, ok, ...result }`；
 * 失敗回傳 `{ id, ok: false, error }`。Blob 以結構化複製傳遞，不經過主執行緒解碼。
 */
import { processImage } from '../components/pages/solutions/farm/farm-image.js';

self.addEventListener('message', async ({ data }) => {
    const { id, blob, params } = data ?? {};
    if (id === 'ping') {
        self.postMessage({ id, ok: typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function' });
        return;
    }
    try {
        const result = await processImage(blob, params);
        self.postMessage({ id, ok: true, ...result });
    } catch (err) {
        self.postMessage({ id, ok: false, error: err?.message ?? String(err) });
    }
});
