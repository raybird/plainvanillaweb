import { html } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { modalService } from "../../../lib/modal-service.js";

export class ModalPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            lastAction: null,
            dialogResult: null
        });
    }

    async handleShowAlert() {
        this.state.lastAction = 'Alert';
        this.state.dialogResult = '等待關閉...';
        await modalService.alert('💡 提示', '這是原生 &lt;dialog&gt; 元素驅動的提示框。它自動管理焦點，並支援 Esc 鍵關閉。');
        this.state.dialogResult = '✅ 使用者已關閉 Alert';
    }

    async handleShowConfirm() {
        this.state.lastAction = 'Confirm';
        this.state.dialogResult = '等待確認...';
        const ok = await modalService.confirm('⚠️ 危險操作', '您確定要執行此操作嗎？(無法復原)');
        this.state.dialogResult = ok ? '✅ 使用者按了「確定」' : '❌ 使用者取消或按了 Esc';
    }

    handleShowCustom() {
        this.state.lastAction = 'Custom Form';
        this.state.dialogResult = '等待表單送出...';

        const content = html`
            <div>
                <label style="display: block; margin-bottom: 0.5rem;">請輸入您的反饋：</label>
                <input type="text" id="custom-modal-input" style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;" placeholder="任何想法都歡迎！" />
            </div>
        `;

        modalService.open({
            title: '🎨 自訂表單',
            content,
            confirmText: '送出反饋',
            cancelText: '暫時不要',
            onConfirm: () => {
                const val = document.getElementById('custom-modal-input')?.value || '（空白）';
                this.state.dialogResult = `✅ 送出的反饋：「${val}」`;
            },
            onCancel: () => { this.state.dialogResult = '❌ 使用者取消了表單'; }
        });
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>🪟 原生對話框 (Dialog / Modal)</h3>
                <p><small>封裝原生 &lt;dialog&gt; 元素，實現自動焦點鎖定 (Focus Trap)、Esc 關閉與暗色遮罩，取代 window.alert/confirm。</small></p>

                <div class="btn-group" style="margin-top: 1rem;">
                    <button class="btn btn-secondary" onclick="this.closest('page-lab-modal').handleShowAlert()">🔔 Alert</button>
                    <button class="btn btn-outline" onclick="this.closest('page-lab-modal').handleShowConfirm()">⚠️ Confirm</button>
                    <button class="btn btn-primary" onclick="this.closest('page-lab-modal').handleShowCustom()">🎨 自訂表單</button>
                </div>

                ${this.state.lastAction ? html`
                    <div style="margin-top: 1.5rem; font-size: 0.85rem; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 1rem;">
                        <strong>觸發事件：</strong> ${this.state.lastAction}<br>
                        <strong>最終結果：</strong> <span style="color: #334155;">${this.state.dialogResult}</span>
                    </div>
                ` : ''}
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}

customElements.define("page-lab-modal", ModalPage);
