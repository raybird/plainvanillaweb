/**
 * @typedef {import('./crypto-service').CryptoService} CryptoService
 * @typedef {import('./compression-service').CompressionService} CompressionService
 * @typedef {import('./file-system-service').FileSystemService} FileSystemService
 * @typedef {import('./wasm-service').WasmService} WasmService
 * @typedef {import('./webgpu-service').WebGPUService} WebGPUService
 * @typedef {import('./webrtc-service').WebRTCService} WebRTCService
 * @typedef {import('./share-service').ShareService} ShareService
 * @typedef {import('./notification-service').NotificationService} NotificationService
 * @typedef {import('./storage-service').StorageService} StorageService
 * @typedef {import('./idb-service').IDBService} IDBService
 * @typedef {import('./i18n-service').I18nService} I18nService
 * @typedef {import('./store').Store} Store
 * @typedef {import('./speech-service').SpeechService} SpeechService
 * @typedef {import('./media-service').MediaService} MediaService
 * @typedef {import('./payment-service').PaymentService} PaymentService
 * @typedef {import('./bluetooth-service').BluetoothService} BluetoothService
 * @typedef {import('./pwa-service').PWAService} PWAService
 * @typedef {import('./auth-service').AuthService} AuthService
 */

// 導入服務實例
import { cryptoService } from './crypto-service.js';
import { compressionService } from './compression-service.js';
import { fileSystemService } from './file-system-service.js';
import { wasmService } from './wasm-service.js';
import { webgpuService } from './webgpu-service.js';
import { webrtcService } from './webrtc-service.js';
import { shareService } from './share-service.js';
import { notificationService } from './notification-service.js';
import { storageService } from './storage-service.js';
import { idbService } from './idb-service.js';
import { i18n } from './i18n-service.js';
import { appStore } from './store.js';
import { speechService } from './speech-service.js';
import { mediaService } from './media-service.js';
import { paymentService } from './payment-service.js';
import { bluetoothService } from './bluetooth-service.js';
import { pwaService } from './pwa-service.js';
import { authService } from './auth-service.js';

/**
 * Vanilla SDK v1.0.0 (Industrial Hub)
 * 提供現代原生 Web API 的專業聚合服務。
 */
export const VanillaSDK = {
    /** @type {CryptoService} */
    crypto: cryptoService,
    
    /** @type {CompressionService} */
    compression: compressionService,
    
    /** @type {FileSystemService} */
    fileSystem: fileSystemService,
    
    /** @type {WasmService} */
    wasm: wasmService,
    
    /** @type {WebGPUService} */
    webgpu: webgpuService,
    
    /** @type {WebRTCService} */
    webrtc: webrtcService,
    
    /** @type {ShareService} */
    share: shareService,
    
    /** @type {NotificationService} */
    notification: notificationService,
    
    /** @type {StorageService} */
    storage: storageService,
    
    /** @type {IDBService} */
    idb: idbService,
    
    /** @type {I18nService} */
    i18n,
    
    /** @type {Store} */
    store: appStore,
    
    /** @type {SpeechService} */
    speech: speechService,
    
    /** @type {MediaService} */
    media: mediaService,
    
    /** @type {PaymentService} */
    payment: paymentService,
    
    /** @type {BluetoothService} */
    bluetooth: bluetoothService,
    
    /** @type {PWAService} */
    pwa: pwaService,
    
    /** @type {AuthService} */
    auth: authService,

    /**
     * 初始化 SDK 環境 (例如在 HTTPS 環境下自動配置 WebRTC)
     */
    async init() {
        console.log('🚀 Vanilla SDK initializing...');
        
        // 自動配置 WebRTC
        if (this.webrtc && typeof this.webrtc.init === 'function') {
            await this.webrtc.init();
        }

        // 初始化國際化
        if (this.i18n && typeof this.i18n.init === 'function') {
            await this.i18n.init();
        }

        console.log('✨ Vanilla SDK Ready.');
        return this;
    }
};

// 保持向後相容的命名導出
export { cryptoService, compressionService, fileSystemService, wasmService, webgpuService, webrtcService, shareService, notificationService, storageService, idbService, i18n, appStore as store, speechService, mediaService, paymentService, bluetoothService, pwaService, authService };

export default VanillaSDK;
