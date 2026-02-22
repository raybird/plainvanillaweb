/**
 * Vanilla SDK v1.0.0 (Industrial Hub)
 * 提供現代原生 Web API 的專業聚合服務。
 */

// 導入服務實例
import { apiService } from './api-service.js';
import { appStore as store } from './store.js';
import { audioService } from './audio-service.js';
import { authService } from './auth-service.js';
import { barcodeService } from './barcode-service.js';
import { bluetoothService } from './bluetooth-service.js';
import { broadcastService } from './broadcast-service.js';
import { chartService } from './chart-service.js';
import { compressionService } from './compression-service.js';
import { computeService } from './worker-service.js';
import { connectivityService } from './connectivity-service.js';
import { crdtService } from './crdt-service.js';
import { cryptoService } from './crypto-service.js';
import { docService } from './doc-service.js';
import { errorService } from './error-service.js';
import { fileSystemService } from './file-system-service.js';
import { historyService } from './history-service.js';
import { i18n } from './i18n-service.js';
import { idbService } from './idb-service.js';
import { imageService } from './image-service.js';
import { mediaService } from './media-service.js';
import { metaService } from './meta-service.js';
import { midiService } from './midi-service.js';
import { modalService } from './modal-service.js';
import { networkMonitor } from './network-monitor.js';
import { nfcService } from './nfc-service.js';
import { notificationService } from './notification-service.js';
import { paymentService } from './payment-service.js';
import { performanceService } from './performance-service.js';
import { playgroundService } from './playground-service.js';
import { prefetchService } from './prefetch-service.js';
import { pwaService } from './pwa-service.js';
import { router } from './router.js';
import { serialService } from './serial-service.js';
import { shareService } from './share-service.js';
import { speechService } from './speech-service.js';
import { storageService } from './storage-service.js';
import { streamProcessorService } from './stream-processor-service.js';
import { syncService } from './sync-service.js';
import { themeService } from './theme-service.js';
import { validationService } from './validation-service.js';
import { wasmService } from './wasm-service.js';
import { webauthnService } from './webauthn-service.js';
import { webgpuService } from './webgpu-service.js';
import { webrtcService } from './webrtc-service.js';

export const VanillaSDK = {
    apiService: apiService,
    audio: audioService,
    auth: authService,
    barcode: barcodeService,
    bluetooth: bluetoothService,
    broadcast: broadcastService,
    chart: chartService,
    compression: compressionService,
    compute: computeService,
    connectivity: connectivityService,
    crdt: crdtService,
    crypto: cryptoService,
    doc: docService,
    error: errorService,
    fileSystem: fileSystemService,
    history: historyService,
    i18n: i18n,
    idb: idbService,
    image: imageService,
    media: mediaService,
    meta: metaService,
    midi: midiService,
    modal: modalService,
    network: networkMonitor,
    nfc: nfcService,
    notification: notificationService,
    payment: paymentService,
    performance: performanceService,
    playground: playgroundService,
    prefetch: prefetchService,
    pwa: pwaService,
    router: router,
    serial: serialService,
    share: shareService,
    speech: speechService,
    storage: storageService,
    store,
    streamProcessor: streamProcessorService,
    sync: syncService,
    theme: themeService,
    validation: validationService,
    wasm: wasmService,
    webauthn: webauthnService,
    webgpu: webgpuService,
    webrtc: webrtcService,

    /**
     * 初始化 SDK 環境 (例如在 HTTPS 環境下自動配置 WebRTC)
     */
    async init() {
        console.log('🚀 Vanilla SDK initializing...');
        
        // 自動配置 WebRTC
        if (this.webrtcService && typeof this.webrtcService.init === 'function') {
            await this.webrtcService.init();
        } else if (this.webrtc && typeof this.webrtc.init === 'function') {
            await this.webrtc.init();
        }

        // 初始化國際化
        if (this.i18n && typeof this.i18n.init === 'function') {
            await this.i18n.init();
        }
        
        // 其他需非同步初始化的服務可以加在這裡
        if (this.authService && typeof this.authService.init === 'function') {
            await this.authService.init();
        }

        console.log('✨ Vanilla SDK Ready.');
        return this;
    }
};

// 保持向後相容的命名導出
export { apiService, audioService, authService, barcodeService, bluetoothService, broadcastService, chartService, compressionService, computeService, connectivityService, crdtService, cryptoService, docService, errorService, fileSystemService, historyService, i18n, idbService, imageService, mediaService, metaService, midiService, modalService, networkMonitor, nfcService, notificationService, paymentService, performanceService, playgroundService, prefetchService, pwaService, router, serialService, shareService, speechService, storageService, store, streamProcessorService, syncService, themeService, validationService, wasmService, webauthnService, webgpuService, webrtcService };

export default VanillaSDK;
