import { BaseService } from './base-service.js';

/**
 * SerialService - 原生 Web Serial 通訊服務
 * 支援與硬體裝置進行序列埠通訊。
 */
export class SerialService extends BaseService {
    constructor() {
        super();
        this.port = null;
        this.reader = null;
        this.isSupported = 'serial' in navigator;
        this._opening = null;
        this._closing = null;
        this._reading = null;
        this._writing = null;
    }

    async connect(baudRate = 9600) {
        if (!this.isSupported) throw new Error('您的瀏覽器不支援 Web Serial API');
        if (this._closing) throw new Error('序列埠正在關閉，請稍後再試');
        if (this.port) return this.port;
        if (this._opening) return this._opening;

        this._opening = this._open(baudRate);
        try {
            return await this._opening;
        } finally {
            this._opening = null;
        }
    }

    async _open(baudRate) {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate });
        this.port = port;
        this._reading = this._readLoop(port);
        this._reading.then(() => {
            if (this.port === port && !this._closing && !port.readable) {
                return this.disconnect();
            }
        }).catch(err => console.error('[Serial] Disconnect Error:', err));
        this.emit('connected', { port });
        return port;
    }

    disconnect() {
        if (this._closing) return this._closing;
        if (!this.port && !this._opening) return Promise.resolve();

        this._closing = this._close().finally(() => { this._closing = null; });
        return this._closing;
    }

    async _close() {
        const port = this.port ?? await this._opening.catch(() => null);
        if (!port) return;

        // cancel() 喚醒待決的 read；等讀寫鎖都釋放後才能關閉 port。
        await Promise.allSettled([this.reader?.cancel(), this._reading, this._writing]);
        try {
            await port.close();
        } catch (err) {
            // 裝置已拔除時，瀏覽器可能已關閉該 port。
            if (port.connected !== false && (port.readable || port.writable)) throw err;
        }
        this.port = null;
        this.emit('disconnected');
    }

    async write(text) {
        if (this._closing) return;
        const writable = this.port?.writable;
        if (!writable) return;

        const writer = writable.getWriter();
        const bytes = new TextEncoder().encode(text);
        const writing = writer.write(bytes).finally(() => writer.releaseLock());
        this._writing = writing;
        try {
            await writing;
        } finally {
            if (this._writing === writing) this._writing = null;
        }
    }

    async _readLoop(port) {
        let readable = port.readable;
        while (readable && !this._closing) {
            const reader = readable.getReader();
            const decoder = new TextDecoder();
            this.reader = reader;

            try {
                while (!this._closing) {
                    const { value, done } = await reader.read();
                    if (this._closing) break;
                    const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
                    if (text) this.emit('data', text);
                    if (done) break;
                }
            } catch (err) {
                if (!this._closing && port.readable) console.error('[Serial] Read Error:', err);
            } finally {
                reader.releaseLock();
                this.reader = null;
            }

            // 非致命的序列埠讀取錯誤會提供新的 readable；不可重新讀取已結束的舊串流。
            const replacement = port.readable;
            if (replacement === readable) break;
            readable = replacement;
        }
    }
}

export const serialService = new SerialService();
