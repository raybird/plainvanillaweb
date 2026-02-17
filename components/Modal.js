import { html } from '../lib/html.js';
import { modalService } from '../lib/modal-service.js';

/**
 * ModalContainer 組件
 * 負責渲染由 modalService 管理的對話框。
 */
export class ModalContainer extends HTMLElement {
    constructor() {
        super();
        this._dialog = null;
        this._options = null;
    }

    connectedCallback() {
        modalService.addEventListener('open', (e) => this.show(e.detail.modal));
        modalService.addEventListener('close', () => this.hide());
        this.render();
    }

    show(options) {
        this._options = options;
        this.render();
        this._dialog = this.querySelector('dialog');
        
        // 使用 showModal() 啟動原生對話框邏輯（背景遮罩、焦點鎖定等）
        this._dialog.showModal();
    }

    hide() {
        if (this._dialog) {
            this._dialog.close();
        }
    }

    handleConfirm() {
        if (this._options?.onConfirm) this._options.onConfirm();
        this.hide();
    }

    handleCancel() {
        if (this._options?.onCancel) this._options.onCancel();
        this.hide();
    }

    render() {
        if (!this._options) {
            this.innerHTML = '<dialog style="display:none;"></dialog>';
            return;
        }

        const { title, content, confirmText, cancelText } = this._options;

        // 使用 SafeHTML 渲染，支援嵌套組件
        this.innerHTML = html`
            <style>
                dialog {
                    border: none;
                    border-radius: 12px;
                    padding: 0;
                    width: 90%;
                    max-width: 500px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                    background: var(--bg-color);
                    color: var(--text-color);
                }
                dialog::backdrop {
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(2px);
                }
                .modal-header { padding: 1.5rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
                .modal-body { padding: 1.5rem; min-height: 100px; }
                .modal-footer { padding: 1rem 1.5rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 0.5rem; }
                [data-theme="dark"] .modal-header, [data-theme="dark"] .modal-footer { border-color: #333; }
                
                .btn { padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; border: none; font-weight: 500; }
                .btn-primary { background: var(--primary-color); color: white; }
                .btn-secondary { background: #6c757d; color: white; }
            </style>
            <dialog>
                <div class="modal-header">
                    <h3 style="margin:0;">${title}</h3>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    ${cancelText ? html`<button class="btn btn-secondary" onclick="this.closest('app-modal').handleCancel()">${cancelText}</button>` : ''}
                    <button class="btn btn-primary" onclick="this.closest('app-modal').handleConfirm()">${confirmText || '確定'}</button>
                </div>
            </dialog>
        `.toString();

        // 監聽原生的 close 事件（處理 Escape 鍵）
        this.querySelector('dialog').addEventListener('close', () => {
            this._options = null;
        });
    }
}

customElements.define('app-modal', ModalContainer);
