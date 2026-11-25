/**
 * 圖片處理器：優先在 module Web Worker 內以 OffscreenCanvas 處理；Worker 無法啟動或不支援
 * OffscreenCanvas 時，降級為主執行緒處理（畫面可能短暫卡頓），並在 `engine` 標示實際使用的方式。
 */
import { processImage } from './farm-image.js';

const WORKER_URL = './workers/image-farm.worker.js';
const READY_TIMEOUT_MS = 3000;

export class ImageProcessor {
    constructor() {
        /** @type {'worker' | 'main-thread'} */
        this.engine = 'main-thread';
        this._worker = null;
        this._seq = 0;
        /** @type {Map<string, { resolve: Function, reject: Function }>} */
        this._pending = new Map();
    }

    /**
     * 嘗試啟動 Worker 並確認它能用 OffscreenCanvas；失敗就留在主執行緒模式。
     * @returns {Promise<'worker' | 'main-thread'>}
     */
    async init() {
        if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') return this.engine;
        let worker;
        try {
            worker = new Worker(new URL(WORKER_URL, document.baseURI), { type: 'module' });
        } catch {
            return this.engine;
        }
        const ready = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS);
            worker.addEventListener('message', ({ data }) => {
                if (data?.id !== 'ping') return;
                clearTimeout(timer);
                resolve(Boolean(data.ok));
            }, { once: true });
            worker.addEventListener('error', (event) => {
                event.preventDefault();
                clearTimeout(timer);
                resolve(false);
            }, { once: true });
            worker.postMessage({ id: 'ping' });
        });
        if (!ready) {
            worker.terminate();
            return this.engine;
        }
        worker.addEventListener('message', ({ data }) => {
            const entry = this._pending.get(data?.id);
            if (!entry) return;
            this._pending.delete(data.id);
            if (data.ok) entry.resolve({ blob: data.blob, width: data.width, height: data.height, sourceWidth: data.sourceWidth, sourceHeight: data.sourceHeight });
            else entry.reject(new Error(data.error));
        });
        this._worker = worker;
        this.engine = 'worker';
        return this.engine;
    }

    /**
     * @param {Blob} blob
     * @param {{ maxWidth: number, format: string, quality: number }} params
     */
    process(blob, params) {
        if (!this._worker) return processImage(blob, params);
        const id = `job-${++this._seq}`;
        return new Promise((resolve, reject) => {
            this._pending.set(id, { resolve, reject });
            this._worker.postMessage({ id, blob, params });
        });
    }

    dispose() {
        this._worker?.terminate();
        this._worker = null;
        for (const { reject } of this._pending.values()) reject(new Error('處理器已關閉'));
        this._pending.clear();
    }
}
