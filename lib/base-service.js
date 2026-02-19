/**
 * BaseService
 * 規範所有服務層的標準接口，繼承自 EventTarget 以支援事件驅動。
 * 具備自動展開 CustomEvent 的便利功能。
 */
export class BaseService extends EventTarget {
    constructor() {
        super();
        // 用於儲存回呼函式的映射，方便 off() 方法精準移除
        this._listenersMap = new Map();
    }

    /**
     * 封裝 addEventListener
     * @param {string} type 事件名稱
     * @param {Function} callback 原始回呼
     */
    on(type, callback) {
        const wrapper = (event) => {
            if (event instanceof CustomEvent) {
                callback(event.detail);
            } else {
                callback(event);
            }
        };

        // 記錄對應關係
        if (!this._listenersMap.has(callback)) {
            this._listenersMap.set(callback, []);
        }
        this._listenersMap.get(callback).push({ type, wrapper });
        
        this.addEventListener(type, wrapper);
    }

    /**
     * 移除事件監聽 (修正 Missing Function 錯誤)
     * @param {string} type 事件名稱
     * @param {Function} callback 原始回呼
     */
    off(type, callback) {
        if (!this._listenersMap.has(callback)) return;

        const listeners = this._listenersMap.get(callback);
        const index = listeners.findIndex(l => l.type === type);
        
        if (index !== -1) {
            const { wrapper } = listeners[index];
            this.removeEventListener(type, wrapper);
            listeners.splice(index, 1);
            
            if (listeners.length === 0) {
                this._listenersMap.delete(callback);
            }
        }
    }

    /**
     * 發布內部狀態變更事件
     * @param {string} type 事件名稱
     * @param {any} detail 攜帶的數據
     */
    emit(type, detail = {}) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}
