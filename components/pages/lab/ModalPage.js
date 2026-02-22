import { html, unsafe } from "../../../lib/html.js";
import { BaseComponent } from "../../../lib/base-component.js";
import { modalService } from "../../../lib/modal-service.js";

export class ModalPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            lastAction: '尚未進行任何操作',
            dialogResult: null
        });
    }

    async handleShowAlert() {
        this.state.lastAction = '呼叫了 Alert 對話框';
        await modalService.alert('💡 實驗室提示', '這是一個原生的 Alert 對話框，它使用 <dialog> 元素呈現，取代了瀏覽器醜陋的 window.alert() 並且支援完整的 CSS 樣式與過場動畫。');
        this.state.dialogResult = '使用者已閱讀完畢 (Alert 回傳 true)';
    }

    async handleShowConfirm() {
        this.state.lastAction = '呼叫了 Confirm 對話框';
        const isConfirmed = await modalService.confirm(
            '⚠️ 刪除確認',
            '您確定要執行此危險操作嗎？此動作將會不可逆轉。\n原生 <dialog> 自動將焦點鎖定在對話框內，且按 Esc 可快速取消。'
        );

        if (isConfirmed) {
            this.state.dialogResult = '✅ 使用者點擊了「確定」';
        } else {
            this.state.dialogResult = '❌ 使用者點擊了「取消」或按下了 Esc';
        }
    }

    handleShowCustom() {
        this.state.lastAction = '呼叫了自訂內容對話框';
        this.state.dialogResult = '正在操作自訂表單...';

        const customHtml = html`
            <div style="padding: 1rem 0;">
                <p>我們甚至可以將 SafeHTML 或自訂 Web Component 注入到 Modal 中：</p>
                <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <label>輸入您的反饋：</label>
                    <input type="text" id="custom-modal-input" style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;" placeholder="寫點什麼..." />
                </div>
            </div>
        `;

        modalService.open({
            title: '🎨 自訂結構對話框',
            content: customHtml,
            confirmText: '送出表單',
            cancelText: '取消填寫',
            onConfirm: () => {
                const inputVal = document.getElementById('custom-modal-input')?.value || '未輸入';
                this.state.dialogResult = `✅ 成功送出自訂表單，內容為：「${inputVal}」`;
            },
            onCancel: () => {
                this.state.dialogResult = '❌ 取消填寫表單';
            }
        });
    }

    render() {
        return html`
            <style>
                .modal-lab-container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 2rem;
                }
                .card {
                    background: var(--surface-color, #fff);
                    border-radius: 12px;
                    padding: 2rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                    margin-bottom: 2rem;
                }
                .btn-group {
                    display: flex;
                    gap: 1rem;
                    margin-top: 1.5rem;
                    flex-wrap: wrap;
                }
                button {
                    padding: 0.8rem 1.5rem;
                    font-size: 1rem;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .btn-alert {
                    background: #eff6ff;
                    color: #2563eb;
                    border: 1px solid #bfdbfe;
                }
                .btn-alert:hover { background: #dbeafe; }
                
                .btn-confirm {
                    background: #fef2f2;
                    color: #dc2626;
                    border: 1px solid #fecaca;
                }
                .btn-confirm:hover { background: #fee2e2; }
                
                .btn-custom {
                    background: #f0fdf4;
                    color: #16a34a;
                    border: 1px solid #bbf7d0;
                }
                .btn-custom:hover { background: #dcfce7; }
                
                .result-panel {
                    margin-top: 2rem;
                    background: #1e293b;
                    color: #f8fafc;
                    padding: 1.5rem;
                    border-radius: 8px;
                }
                .result-panel h4 {
                    margin-top: 0;
                    color: #cbd5e1;
                    border-bottom: 1px solid #334155;
                    padding-bottom: 0.5rem;
                }
                .log-text {
                    font-family: monospace;
                    margin: 0.5rem 0;
                    color: #10b981;
                }
            </style>

            <div class="modal-lab-container">
                <div class="card">
                    <h2>🪟 原生對話框 (Dialog / Modal)</h2>
                    <p>
                        拋棄複雜的 CSS 懸浮層管理與 z-index 戰爭！這項實驗展示我們專案如何透過封裝原生的 <code>&lt;dialog&gt;</code> 標籤，完美實現具備<b>焦點補獲 (Focus Trap)</b>、<b>暗黑遮罩 (Backdrop)</b>、與 <b>Esc 鍵快速關閉</b> 的現代化系統對話框。
                    </p>
                    
                    <div class="btn-group">
                        <button class="btn-alert" onclick="this.closest('page-lab-modal').handleShowAlert()">
                            🔔 觸發提示訊息 (Alert)
                        </button>
                        <button class="btn-confirm" onclick="this.closest('page-lab-modal').handleShowConfirm()">
                            ⚠️ 觸發危險確認 (Confirm)
                        </button>
                        <button class="btn-custom" onclick="this.closest('page-lab-modal').handleShowCustom()">
                            🎨 觸發自訂內容 (Custom Form)
                        </button>
                    </div>
                </div>

                <div class="result-panel">
                    <h4>📡 即時操作日誌</h4>
                    <div class="log-text">最新操作：${this.state.lastAction}</div>
                    <div class="log-text" style="color: #60a5fa;">回傳結果：${this.state.dialogResult || '-'}</div>
                </div>
            </div>
        `;
    }
}

customElements.define("page-lab-modal", ModalPage);
