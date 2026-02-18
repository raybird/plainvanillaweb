import { BaseService } from './base-service.js';

/**
 * WasmService - 原生 WebAssembly 整合服務
 * 負責 Wasm 模組的加載、例項化與運算接口封裝。
 */
export class WasmService extends BaseService {
    constructor() {
        super();
        this.modules = new Map();
    }

    /**
     * 從 URL 串流加載並例項化 Wasm 模組
     * @param {string} name 模組別名
     * @param {string} url .wasm 檔案路徑
     * @param {object} importObject 導入對象 (可選)
     */
    async loadModule(name, url, importObject = {}) {
        try {
            const { instance } = await WebAssembly.instantiateStreaming(
                fetch(url),
                importObject
            );
            this.modules.set(name, instance.exports);
            this.emit('module-loaded', { name });
            return instance.exports;
        } catch (err) {
            console.error(`[WasmService] Failed to load module "${name}":`, err);
            throw err;
        }
    }

    /**
     * 獲取已載入模組的導出接口
     */
    get(name) {
        return this.modules.get(name);
    }

    /**
     * 內建示範：手動載入微型 Wasm (Simple Add)
     * binary: (module (func $add (param i32 i32) (result i32) local.get 0 local.get 1 i32.add) (export "add" (func $add)))
     */
    async loadDemoAdd() {
        const bytes = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 
            0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 
            0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b
        ]);
        const { instance } = await WebAssembly.instantiate(bytes);
        this.modules.set('demo-add', instance.exports);
        return instance.exports;
    }
}

export const wasmService = new WasmService();
