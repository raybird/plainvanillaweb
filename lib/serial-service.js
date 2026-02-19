import { BaseService } from './base-service.js';

/**
 * SerialService - 原生 Web Serial 通訊服務
 * 支援與硬體裝置（如 Arduino）進行序列埠通訊。
 */
export class SerialService extends BaseService {
    constructor() {
        super();
        this.port = null;
        this.reader = null;
        this.isSupported = 'serial' in navigator;
    }

    /**
     * 請求並開啟序列埠
     * @param {number} baudRate 鮑率，預設 9600
     */
    async connect(baudRate = 9600) {
        if (!this.isSupported) throw new Error('您的瀏覽器不支援 Web Serial API');

        try {
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate });
            
            console.log('[Serial] Connected');
            this.emit('connected', { port: this.port });
            
            // 開始讀取循環 (非阻塞)
            this._readLoop();
            
            return this.port;
        } catch (err) {
            console.error('[Serial] Connect Error:', err);
            throw err;
        }
    }

    /**
     * 關閉連線
     */
    async disconnect() {
        if (this.reader) {
            await this.reader.cancel();
            this.reader = null;
        }
        if (this.port) {
            await this.port.close();
            this.port = null;
        }
        this.emit('disconnected');
    }

    /**
     * 發送字串數據
     */
    async write(text) {
        if (!this.port || !this.port.writable) return;
        
        const encoder = new TextEncoder();
        const writer = this.port.writable.getWriter();
        await writer.write(encoder.encode(text));
        writer.releaseLock();
    }

    /**
     * 內部讀取循環
     */
    async _readLoop() {
        while (this.port && this.port.readable) {
            const textDecoder = new TextDecoderStream();
            const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.reader = textDecoder.readable.getReader();

            try {
                while (true) {
                    const { value, done } = await this.reader.read();
                    if (done) break;
                    if (value) {
                        this.emit('data', value);
                    }
                }
            } catch (err) {
                console.error('[Serial] Read Error:', err);
            } finally {
                this.reader.releaseLock();
            }
        }
    }
}

export const serialService = new SerialService();
