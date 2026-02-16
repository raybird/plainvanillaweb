/**
 * BaseService
 * 規範所有服務層的標準接口，繼承自 EventTarget 以支援事件驅動。
 */
export class BaseService extends EventTarget {
    constructor() {
        super();
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
