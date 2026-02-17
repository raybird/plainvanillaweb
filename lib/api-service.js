import { BaseService } from './base-service.js';

/**
 * APIService - 原生 API 請求服務
 * 整合 AbortController 實現請求取消與競爭條件預防。
 */
export class APIService extends BaseService {
    constructor() {
        super();
        this._controllers = new Map(); // 存儲各個 endpoint 的 AbortController
    }

    /**
     * 執行帶有取消機制的 fetch
     * @param {string} key 請求標識符 (用於取消特定類別的請求)
     * @param {string} url 
     * @param {object} options 
     */
    async fetchWithCancel(key, url, options = {}) {
        // 1. 如果有舊的請求，先取消它
        if (this._controllers.has(key)) {
            console.log(`[APIService] Cancelling previous request: ${key}`);
            this._controllers.get(key).abort();
        }

        // 2. 建立新的控制器
        const controller = new AbortController();
        this._controllers.set(key, controller);

        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            return await response.json();
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log(`[APIService] Request aborted: ${key}`);
                return null; // 被取消時不拋出錯誤，回傳 null
            }
            throw err;
        } finally {
            // 3. 請求完成後移除控制器 (若是當前控制器的話)
            if (this._controllers.get(key) === controller) {
                this._controllers.delete(key);
            }
        }
    }
}

export const apiService = new APIService();
