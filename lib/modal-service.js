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
        this._current = {
            id: Date.now(),
            ...options
        };
        this.emit('open', { modal: this._current });
    }

    /**
     * 關閉目前對話框
     */
    close() {
        if (!this._current) return;
        this.emit('close', { id: this._current.id });
        this._current = null;
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
                onConfirm: () => resolve(true)
            });
        });
    }
}

export const modalService = new ModalService();
