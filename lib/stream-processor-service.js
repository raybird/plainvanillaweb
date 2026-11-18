import { BaseService } from './base-service.js';

/**
 * StreamProcessorService - 原生即時串流處理服務
 * 利用 MediaStreamTrackProcessor 操作原始影格數據。
 */
export class StreamProcessorService extends BaseService {
    constructor() {
        super();
        this.isSupported = typeof globalThis.MediaStreamTrackProcessor === 'function'
            && typeof globalThis.MediaStreamTrackGenerator === 'function';
        this._pipeline = null;
    }

    /**
     * 對指定的媒體軌道套用處理器
     * @param {MediaStreamTrack} track 原始影像軌道
     * @param {Function} transformer 影格處理函數 (receive VideoFrame, return VideoFrame)
     * @returns {MediaStream} 處理後的媒體串流
     */
    process(track, transformer) {
        if (!this.isSupported) {
            throw new Error('此瀏覽器不支援 MediaStreamTrackProcessor 或 MediaStreamTrackGenerator');
        }

        void this.stop();

        const processor = new MediaStreamTrackProcessor({ track });
        const generator = new MediaStreamTrackGenerator({ kind: 'video' });
        const output = new MediaStream([generator]);
        const pipeline = {
            reader: processor.readable.getReader(),
            writer: generator.writable.getWriter(),
            generator,
            stopping: false,
        };

        this._pipeline = pipeline;
        pipeline.done = this._processFrames(pipeline, transformer);
        return output;
    }

    async _processFrames(pipeline, transformer) {
        const { reader, writer, generator } = pipeline;
        try {
            while (!pipeline.stopping) {
                const { done, value: frame } = await reader.read();
                if (done) break;

                let output = frame;
                let written = false;
                try {
                    if (pipeline.stopping) break;
                    try {
                        output = await transformer(frame) || frame;
                    } catch (err) {
                        if (!pipeline.stopping) console.error('[StreamProcessor] Frame Process Error:', err);
                    }
                    if (pipeline.stopping) break;

                    await writer.write(output);
                    // Generator 成功寫入後會自行 close() 該影格。
                    written = true;
                } finally {
                    if (!written || output !== frame) frame.close();
                    if (!written && output !== frame) output.close();
                }
            }
            if (!pipeline.stopping) await writer.close();
        } catch (err) {
            if (!pipeline.stopping) {
                console.error('[StreamProcessor] Pipeline Error:', err);
                await Promise.allSettled([reader.cancel(), writer.abort()]);
            }
        } finally {
            await pipeline.cancellation;
            reader.releaseLock();
            writer.releaseLock();
            if (!pipeline.stopping) generator.stop();
            if (this._pipeline === pipeline) this._pipeline = null;
        }
    }

    /**
     * 停止處理管道；回傳的 Promise 會在釋放鎖及處理中的影格後完成。
     */
    async stop() {
        const pipeline = this._pipeline;
        if (!pipeline) return;
        if (!pipeline.stopping) {
            pipeline.stopping = true;
            pipeline.cancellation = Promise.allSettled([pipeline.reader.cancel(), pipeline.writer.abort()]);
            pipeline.generator.stop();
        }
        await pipeline.done;
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
