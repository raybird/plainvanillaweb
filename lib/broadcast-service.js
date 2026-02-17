import { BaseService } from './base-service.js';

/**
 * BroadcastService - 跨分頁通訊服務
 * 利用 BroadcastChannel API 實現多個標籤頁之間的狀態同步。
 */
export class BroadcastService extends BaseService {
    constructor(channelName = 'vanilla_web_sync') {
        super();
        this.channelName = channelName;
        this._channel = new BroadcastChannel(this.channelName);
        this._tabId = Math.random().toString(36).substr(2, 9);
        
        this._channel.onmessage = (event) => {
            this.emit('message', event.data);
        };
    }

    /**
     * 發送訊息給其他分頁
     * @param {string} type 
     * @param {any} payload 
     */
    post(type, payload) {
        this._channel.postMessage({
            type,
            payload,
            sender: this._tabId,
            timestamp: Date.now()
        });
    }

    get tabId() {
        return this._tabId;
    }
}

export const broadcastService = new BroadcastService();
