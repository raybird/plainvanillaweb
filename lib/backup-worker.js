/**
 * backup-worker.js
 * 
 * 這是一個 Web Worker 腳本，專門在背景執行緒中處理繁重的 CPU 運算：
 * 1. 接收主執行緒傳送的 JSON 數據。
 * 2. 使用 Compression Streams API (Gzip) 將數據進行壓縮。
 * 3. 使用位元遮罩 (XOR) 模擬數據加密。
 * 4. 計算壓縮率，並將最終加密後的 Blob 傳回主執行緒。
 */

self.onmessage = async (e) => {
    const { action, payload } = e.data;
    
    if (action === 'backup') {
        try {
            // 1. 序列化 JSON 數據並編碼為位元組
            const dataStr = JSON.stringify(payload);
            const encoder = new TextEncoder();
            const bytes = encoder.encode(dataStr);
            
            let compressedBlob;
            
            // 2. 進行 Gzip 壓縮（若環境支援 CompressionStream）
            if (typeof CompressionStream !== 'undefined') {
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(bytes);
                        controller.close();
                    }
                }).pipeThrough(new CompressionStream('gzip'));
                
                const chunks = [];
                const reader = stream.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                compressedBlob = new Blob(chunks, { type: 'application/gzip' });
            } else {
                // Fallback: 若無 CompressionStream 則以純 json blob 處理
                compressedBlob = new Blob([bytes], { type: 'application/json' });
            }

            // 3. 在背景使用 FileReaderSync 讀取 ArrayBuffer (Worker 專用同步 API)
            const fileReader = new FileReaderSync();
            const arrayBuffer = fileReader.readAsArrayBuffer(compressedBlob);
            const dataView = new DataView(arrayBuffer);
            const length = arrayBuffer.byteLength;
            const encryptedBytes = new Uint8Array(length);
            
            // 4. 進行背景加密運算（位元遮罩 XOR 0x42）
            for (let i = 0; i < length; i++) {
                encryptedBytes[i] = dataView.getUint8(i) ^ 0x42;
            }
            
            const finalBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' });

            // 5. 將結果發送回主執行緒
            self.postMessage({
                status: 'success',
                blob: finalBlob,
                originalSize: bytes.byteLength,
                compressedSize: finalBlob.size
            });
        } catch (error) {
            self.postMessage({
                status: 'error',
                error: error.message || '備份程序異常。'
            });
        }
    }
};
