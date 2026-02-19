import { BaseService } from './base-service.js';

/**
 * NFCService - 原生 Web NFC 服務
 * 封裝 NDEFReader 實作 NFC 標籤的讀寫通訊。
 */
export class NFCService extends BaseService {
    constructor() {
        super();
        this.reader = null;
        this.isSupported = 'NDEFReader' in window;
    }

    /**
     * 開始掃描 NFC 標籤
     */
    async scan() {
        if (!this.isSupported) throw new Error('您的瀏覽器或設備不支援 Web NFC');

        try {
            this.reader = new NDEFReader();
            await this.reader.scan();
            console.log('[NFC] Scan started');
            this.emit('scan-started');

            this.reader.onreading = (event) => {
                const { message, serialNumber } = event;
                this.emit('reading', { message, serialNumber });
                
                // 自動解析 NDEF 記錄
                for (const record of message.records) {
                    this._processRecord(record);
                }
            };

            this.reader.onreadingerror = () => {
                this.emit('error', new Error('無法讀取 NFC 標籤，請靠近重試'));
            };

        } catch (err) {
            console.error('[NFC] Scan Error:', err);
            throw err;
        }
    }

    /**
     * 寫入數據到 NFC 標籤
     * @param {string|Object} data 寫入的內容
     */
    async write(data) {
        if (!this.isSupported) throw new Error('您的瀏覽器不支援 Web NFC');

        try {
            const writer = new NDEFReader();
            const message = typeof data === 'string' 
                ? data 
                : JSON.stringify(data);
            
            await writer.write(message);
            this.emit('write-success');
            return true;
        } catch (err) {
            console.error('[NFC] Write Error:', err);
            throw err;
        }
    }

    _processRecord(record) {
        const textDecoder = new TextDecoder(record.encoding || 'utf-8');
        if (record.recordType === 'text') {
            const text = textDecoder.decode(record.data);
            this.emit('text-found', text);
        } else if (record.recordType === 'mime' && record.mediaType === 'application/json') {
            const json = JSON.parse(textDecoder.decode(record.data));
            this.emit('json-found', json);
        }
    }
}

export const nfcService = new NFCService();
