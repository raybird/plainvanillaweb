/**
 * BaseService
 * 規範所有服務層的標準接口，繼承自 EventTarget 以支援事件驅動。
 */
export class BaseService extends EventTarget {
    constructor() {
        super();
    }

    /**
     * 封裝 addEventListener 的捷徑
     * @param {string} type 
     * @param {Function} callback 
     */
    on(type, callback) {
        this.addEventListener(type, (event) => {
            // 自動展開 CustomEvent 的 detail，讓開發者直接拿數據
            if (event instanceof CustomEvent) {
                callback(event.detail);
            } else {
                callback(event);
            }
        });
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
