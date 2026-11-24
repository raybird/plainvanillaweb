import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { FormGroup, FormControl, Validators } from '../../../lib/form-engine.js';
import { notificationService } from '../../../lib/notification-service.js';

export class FormsPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({ revision: 0, submitting: false, editing: { username: false, email: false } });

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
        this._unsubscribe = this.form.on('status-change', () => this.state.revision++);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._unsubscribe?.();
    }

    async submitForm(event) {
        event.preventDefault();
        if (this.state.submitting) return;
        this.state.submitting = true;
        this.state.editing = { username: false, email: false };
        try {
            // 也讀取瀏覽器可能未派發 input 事件的自動填入值。
            const values = new FormData(event.currentTarget);
            for (const [name, value] of values) {
                if (this.form.controls[name].value !== value) this.form.controls[name].value = value;
            }
            if (!await this.form.validateAll()) {
                await new Promise(requestAnimationFrame);
                if (this.isConnected) this.querySelector('[aria-invalid="true"]')?.focus();
            } else if (this.isConnected) {
                notificationService.success('驗證成功！');
            }
        } finally {
            this.state.submitting = false;
        }
    }

    renderField(name, label, type, autocomplete) {
        const { touched, pending, errors } = this.form.controls[name].state;
        const error = touched && !this.state.editing[name] && (errors?.required ? '此欄位為必填'
            : errors?.minlen ? '至少輸入 3 個字元'
            : errors?.duplicated ? '名稱已被佔用'
            : errors?.email ? '請輸入有效的電子郵件'
            : errors?.validationUnavailable ? '目前無法驗證，請稍後再試'
            : '');
        const id = `registration-${name}`;
        return html`
            <div class="input-group">
                <label for="${id}">${label}（必填）</label>
                <input id="${id}" name="${name}" type="${type}" autocomplete="${autocomplete}"
                    required minlength="${name === 'username' ? 3 : 1}"
                    aria-invalid="${Boolean(error)}" aria-describedby="${id}-feedback">
                ${pending ? html`<p aria-hidden="true">檢查中…</p>` : ''}
                <p id="${id}-feedback" role="status">${error || ''}</p>
            </div>
        `;
    }

    afterFirstRender() {
        const form = this.querySelector('form');
        form.addEventListener('submit', event => this.submitForm(event));
        form.addEventListener('input', ({ target }) => {
            const control = this.form.controls[target.name];
            if (control) {
                this.state.editing[target.name] = true;
                control.value = target.value;
            }
        });
        form.addEventListener('focusout', ({ target }) => {
            const control = this.form.controls[target.name];
            if (control?.state.dirty) {
                this.state.editing[target.name] = false;
                control.markAsTouched();
            }
        });
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>📝 響應式表單 (Reactive Forms)</h3>
                <form novalidate style="max-width: 400px; margin-inline: auto">
                    ${this.renderField('username', '使用者名稱', 'text', 'username')}
                    ${this.renderField('email', '電子郵件', 'email', 'email')}
                    <button class="btn btn-primary" type="submit" ${this.state.submitting ? 'disabled' : ''}>送出註冊</button>
                </form>
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-forms', FormsPage);
