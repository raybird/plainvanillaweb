import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { FormGroup, FormControl, Validators } from '../../../lib/form-engine.js';
import { notificationService } from '../../../lib/notification-service.js';

export class FormsPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            registrationForm: {
                username: { valid: true, pending: false, touched: false, errors: null },
                email: { valid: true, touched: false, errors: null },
                formValid: false
            }
        });

        this.form = new FormGroup({
            username: new FormControl('', [Validators.required, Validators.minLen(3)], [
                async (val) => {
                    await new Promise(r => setTimeout(r, 1000));
                    return val === 'admin' ? { duplicated: true } : null;
                }
            ]),
            email: new FormControl('', [Validators.required, Validators.email])
        });
    }

    connectedCallback() {
        super.connectedCallback();
        this._onStatusChange = (data) => {
            this.state.registrationForm = {
                username: this.form.controls.username.state,
                email: this.form.controls.email.state,
                formValid: data.valid
            };
        };
        this.form.on('status-change', this._onStatusChange);
    }

    handleFormInput(field, value) {
        this.form.controls[field].value = value;
    }

    submitForm() {
        this.form.validateAll();
        if (this.form.valid) {
            notificationService.success('驗證成功！');
        } else {
            notificationService.error('請檢查錯誤欄位');
        }
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>📝 響應式表單 (Reactive Forms)</h3>
                <div style="max-width: 400px; margin: 0 auto; text-align: left;">
                    <div style="margin-bottom: 1rem;">
                        <label>使用者名稱</label>
                        <input type="text" placeholder="輸入 admin 測試"
                               style="border-color: ${this.state.registrationForm.username.invalid ? 'red' : '#ccc'};"
                               oninput="this.closest('page-lab-forms').handleFormInput('username', this.value)">
                        ${this.state.registrationForm.username.pending ? html`<div>⏳ 檢查中...</div>` : ''}
                        ${this.state.registrationForm.username.errors?.duplicated ? html`<div style="color:red">❌ 名稱已被佔用</div>` : ''}
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="this.closest('page-lab-forms').submitForm()">送出註冊</button>
                    </div>
                </div>
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-forms', FormsPage);
