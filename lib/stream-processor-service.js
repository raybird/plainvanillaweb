import { BaseService } from './base-service.js';

/**
 * StreamProcessorService - 原生即時串流處理服務
 * 利用 MediaStreamTrackProcessor 操作原始影格數據。
 */
export class StreamProcessorService extends BaseService {
    constructor() {
        super();
        this.isSupported = !!window.MediaStreamTrackProcessor;
        this.abortController = null;
    }

    /**
     * 對指定的媒體軌道套用處理器
     * @param {MediaStreamTrack} track 原始影像軌道
     * @param {Function} transformer 影格處理函數 (receive VideoFrame, return VideoFrame)
     * @returns {MediaStream} 處理後的媒體串流
     */
    process(track, transformer) {
        if (!this.isSupported) {
            throw new Error('此瀏覽器不支援 MediaStreamTrackProcessor');
        }

        const processor = new MediaStreamTrackProcessor({ track });
        const generator = new MediaStreamTrackGenerator({ kind: 'video' });
        
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const reader = processor.readable.getReader();
        const writer = generator.writable.getWriter();

        const processFrames = async () => {
            try {
                while (true) {
                    const { done, value: frame } = await reader.read();
                    if (done || signal.aborted) break;

                    try {
                        const newFrame = await transformer(frame);
                        await writer.write(newFrame || frame);
                    } catch (e) {
                        console.error('[StreamProcessor] Frame Process Error:', e);
                        await writer.write(frame);
                    } finally {
                        frame.close(); // 必須手動關閉影格以釋放記憶體
                    }
                }
            } catch (err) {
                console.error('[StreamProcessor] Pipeline Error:', err);
            } finally {
                reader.releaseLock();
                writer.releaseLock();
            }
        };

        processFrames();

        return new MediaStream([generator]);
    }

    /**
     * 停止處理管道
     */
    stop() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    /**
     * 輔助工具：建立基礎 Canvas 濾鏡處理器
     */
    createCanvasTransformer(filterName) {
        const canvas = new OffscreenCanvas(1, 1);
        const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

        return (frame) => {
            const width = frame.displayWidth || frame.codedWidth;
            const height = frame.displayHeight || frame.codedHeight;

            if (width === 0 || height === 0) {
                return null; // 略過無效影格
            }

            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            // 清除並繪製
            ctx.filter = this._getFilterValue(filterName);
            ctx.drawImage(frame, 0, 0, width, height);
            
            // 建立新影格並傳回
            return new VideoFrame(canvas, { 
                timestamp: frame.timestamp,
                duration: frame.duration 
            });
        };
    }

    _getFilterValue(name) {
        const filters = {
            'grayscale': 'grayscale(100%)',
            'invert': 'invert(100%)',
            'sepia': 'sepia(100%)',
            'none': 'none'
        };
        return filters[name] || 'none';
    }
}

export const streamProcessorService = new StreamProcessorService();
