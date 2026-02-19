/**
 * Vanilla SDK - 現代原生功能聚合入口
 * 提供工業級、零相依的核心 Web API 封裝服務。
 */

export { cryptoService, CryptoService } from './crypto-service.js';
export { compressionService, CompressionService } from './compression-service.js';
export { fileSystemService, FileSystemService } from './file-system-service.js';
export { wasmService, WasmService } from './wasm-service.js';
export { webgpuService, WebGPUService } from './webgpu-service.js';
export { webrtcService, WebRTCService } from './webrtc-service.js';
export { shareService, ShareService } from './share-service.js';
export { notificationService, NotificationService } from './notification-service.js';
export { storageService, StorageService } from './storage-service.js';
export { idbService, IDBService } from './idb-service.js';
export { i18n, I18nService } from './i18n-service.js';
export { store, Store } from './store.js';
export { speechService, SpeechService } from './speech-service.js';
export { mediaService, MediaService } from './media-service.js';
export { paymentService, PaymentService } from './payment-service.js';
export { bluetoothService, BluetoothService } from './bluetooth-service.js';
export { pwaService, PWAService } from './pwa-service.js';
export { authService, AuthService } from './auth-service.js';

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
import { store } from './store.js';
import { speechService } from './speech-service.js';
import { mediaService } from './media-service.js';
import { paymentService } from './payment-service.js';
import { bluetoothService } from './bluetooth-service.js';
import { pwaService } from './pwa-service.js';
import { authService } from './auth-service.js';

export default {
    crypto: cryptoService,
    compression: compressionService,
    fileSystem: fileSystemService,
    wasm: wasmService,
    webgpu: webgpuService,
    webrtc: webrtcService,
    share: shareService,
    notification: notificationService,
    storage: storageService,
    idb: idbService,
    i18n,
    store,
    speech: speechService,
    media: mediaService,
    payment: paymentService,
    bluetooth: bluetoothService,
    pwa: pwaService,
    auth: authService
};
