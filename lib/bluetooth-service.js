import { BaseService } from './base-service.js';

/**
 * BluetoothService - 原生 Web Bluetooth 服務
 * 封裝藍牙裝置搜尋、連線與特徵值互動。
 */
export class BluetoothService extends BaseService {
    constructor() {
        super();
        this.device = null;
        this.server = null;
        this.isSupported = 'bluetooth' in navigator;
    }

    /**
     * 請求藍牙裝置
     * @param {object} options 篩選條件，預設接受所有具備名稱的裝置
     */
    async requestDevice(options = { acceptAllDevices: true }) {
        if (!this.isSupported) throw new Error('此瀏覽器不支援 Web Bluetooth');

        try {
            this.device = await navigator.bluetooth.requestDevice(options);
            this.emit('device-selected', { device: this.device });
            return this.device;
        } catch (err) {
            console.error('[BluetoothService] Request Device Error:', err);
            throw err;
        }
    }

    /**
     * 連線至 GATT 伺服器
     */
    async connect() {
        if (!this.device) throw new Error('未選擇任何裝置');

        try {
            this.server = await this.device.gatt.connect();
            this.emit('connected', { server: this.server });
            
            // 監聽斷線事件
            this.device.addEventListener('gattserverdisconnected', () => {
                this.emit('disconnected');
                this.server = null;
            });

            return this.server;
        } catch (err) {
            console.error('[BluetoothService] Connection Error:', err);
            throw err;
        }
    }

    /**
     * 讀取特徵值 (範例)
     * @param {string|number} serviceUuid 
     * @param {string|number} characteristicUuid 
     */
    async readValue(serviceUuid, characteristicUuid) {
        if (!this.server) throw new Error('藍牙伺服器未連線');
        
        const service = await this.server.getPrimaryService(serviceUuid);
        const characteristic = await service.getCharacteristic(characteristicUuid);
        const value = await characteristic.readValue();
        return value;
    }

    /**
     * 斷開連線
     */
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
    }
}

export const bluetoothService = new BluetoothService();
