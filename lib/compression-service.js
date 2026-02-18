import { BaseService } from './base-service.js';

/**
 * CompressionService - 原生數據壓縮服務
 * 利用瀏覽器內建的 Compression Streams API (Gzip/Deflate)。
 */
export class CompressionService extends BaseService {
    /**
     * 壓縮數據
     * @param {string|Uint8Array} data 
     * @param {string} format 'gzip' | 'deflate' | 'deflate-raw'
     * @returns {Promise<Uint8Array>}
     */
    async compress(data, format = 'gzip') {
        const stream = new Blob([data]).stream();
        const compressionStream = new CompressionStream(format);
        const compressedStream = stream.pipeThrough(compressionStream);
        
        const response = new Response(compressedStream);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }

    /**
     * 解壓縮數據
     * @param {Uint8Array} data 
     * @param {string} format 'gzip' | 'deflate' | 'deflate-raw'
     * @returns {Promise<string>}
     */
    async decompress(data, format = 'gzip') {
        const stream = new Blob([data]).stream();
        const decompressionStream = new DecompressionStream(format);
        const decompressedStream = stream.pipeThrough(decompressionStream);
        
        const response = new Response(decompressedStream);
        const text = await response.text();
        return text;
    }

    /**
     * 判斷是否為壓縮數據 (簡單啟發式判斷)
     * Gzip 標頭通常以 1f 8b 開頭
     */
    isCompressed(data) {
        if (!(data instanceof Uint8Array)) return false;
        return data[0] === 0x1f && data[1] === 0x8b;
    }
}

export const compressionService = new CompressionService();
