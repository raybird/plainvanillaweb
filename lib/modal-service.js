import { BaseService } from './base-service.js';

/**
 * ModalService - 全域對話框服務
 * 負責管理對話框的開啟、關閉與內容傳遞。
 * 利用原生 <dialog> 元素提供 A11y 支援。
 */
export class ModalService extends BaseService {
    constructor() {
        super();
        this._current = null;
        this._nextId = 0;
    }

    /**
     * 開啟對話框
     * @param {object} options 
     * @param {string} options.title 標題
     * @param {string|SafeHTML} options.content 內容
     * @param {string} options.confirmText 確認按鈕文字
     * @param {string} options.cancelText 取消按鈕文字
     * @param {Function} options.onConfirm 確認回呼
     * @param {Function} options.onCancel 取消回呼
     */
    open(options = {}) {
        const previous = this._current;
        const modal = { ...options, id: ++this._nextId };
        this._current = modal;
        try {
            if (previous) this._settle(previous, false);
        } finally {
            if (this._current === modal) this.emit('open', { modal });
        }
    }

    /** 關閉並完成目前對話框；過期的 DOM 事件不得影響後續對話框。 */
    close(confirmed = false, id = this._current?.id) {
        const modal = this._current;
        if (!modal || modal.id !== id) return;
        this._current = null;
        this._settle(modal, confirmed);
    }

    _settle(modal, confirmed) {
        try {
            if (confirmed) modal.onConfirm?.();
            else modal.onCancel?.();
        } finally {
            this.emit('close', { id: modal.id });
        }
    }

    /**
     * 簡易確認對話框 (Promise-based)
     */
    confirm(title, message) {
        return new Promise((resolve) => {
            this.open({
                title,
                content: message,
                confirmText: '確定',
                cancelText: '取消',
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        });
    }

    /**
     * 簡易警告對話框 (Promise-based)
     */
    alert(title, message) {
        return new Promise((resolve) => {
            this.open({
                title,
                content: message,
                confirmText: '了解',
                cancelText: null, // 不顯示取消
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        });
    }
}

export const modalService = new ModalService();
