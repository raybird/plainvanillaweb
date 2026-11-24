import { html } from '../lib/html.js';
import { modalService } from '../lib/modal-service.js';

/**
 * ModalContainer 組件
 * 負責渲染由 modalService 管理的對話框。
 * 
 * [修復] 使用具名且可移除的 handler，防止 App 重繪時 connectedCallback
 *        重複執行而累積多個 'open'/'close' 監聽器導致 showModal() 報錯。
 */
export class ModalContainer extends HTMLElement {
    constructor() {
        super();
        this._dialog = null;
        this._options = null;

        this._onOpen = (e) => this.show(e.detail.modal);
        this._onClose = (e) => {
            if (this._options?.id === e.detail.id) this.hide();
        };
    }

    connectedCallback() {
        modalService.addEventListener('open', this._onOpen);
        modalService.addEventListener('close', this._onClose);
    }

    disconnectedCallback() {
        modalService.removeEventListener('open', this._onOpen);
        modalService.removeEventListener('close', this._onClose);
        if (this._options) modalService.close(false, this._options.id);
        this.hide();
    }

    show(options) {
        this.hide();
        this._options = options;
        this.render();
        const dialog = this.querySelector('dialog');
        this._dialog = dialog;
        dialog.addEventListener('close', () => {
            modalService.close(dialog.returnValue === 'confirm', options.id);
        }, { once: true });
        dialog.showModal();
    }

    hide() {
        this._dialog?.close();
        this._dialog = null;
        this._options = null;
    }

    render() {
        if (!this._options) {
            this.innerHTML = '<dialog style="display:none;"></dialog>';
            return;
        }

        const { title, content, confirmText, cancelText } = this._options;

        this.innerHTML = html`
            <style>
                app-modal dialog {
                    border: none;
                    border-radius: 12px;
                    padding: 0;
                    width: 90%;
                    max-width: 500px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                    background: var(--bg-color);
                    color: var(--text-color);
                }
                app-modal dialog:modal { overscroll-behavior: contain; }
                app-modal dialog::backdrop {
                    overflow: hidden;
                    overscroll-behavior: contain;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(2px);
                }
                .modal-header { padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; }
                .modal-body { padding: 1.5rem; min-height: 80px; }
                .modal-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 0.5rem; }
                [data-theme="dark"] .modal-header, [data-theme="dark"] .modal-footer { border-color: #333; }
                .btn { padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; border: none; font-weight: 500; font-size: 1rem; }
                .btn-primary { background: var(--primary-color); color: white; }
                .btn-secondary { background: #6c757d; color: white; }
            </style>
            <dialog aria-labelledby="app-modal-title">
                <div class="modal-header">
                    <h3 id="app-modal-title" style="margin:0;">${title}</h3>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <form class="modal-footer" method="dialog">
                    ${cancelText ? html`<button class="btn btn-secondary" value="cancel" autofocus>${cancelText}</button>` : ''}
                    <button class="btn btn-primary" value="confirm" ${cancelText ? '' : 'autofocus'}>${confirmText || '確定'}</button>
                </form>
            </dialog>
        `.toString();
    }
}

customElements.define('app-modal', ModalContainer);
