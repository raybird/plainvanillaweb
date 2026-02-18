import test from 'node:test';
import assert from 'node:assert';

/**
 * 測試 CompressionService
 * 注意：由於 Node.js 環境不具備瀏覽器的 CompressionStream API，
 * 此測試僅在具備該 API 的環境 (如瀏覽器或 Mock 環境) 中有意義。
 * 在此我們主要測試邏輯接口。
 */
test('Compression Service 接口存在性測試', async () => {
    // 這裡我們僅檢查模組是否能被正確載入
    const { compressionService } = await import('../lib/compression-service.js');
    assert.ok(compressionService);
    assert.strictEqual(typeof compressionService.compress, 'function');
    assert.strictEqual(typeof compressionService.decompress, 'function');
});
