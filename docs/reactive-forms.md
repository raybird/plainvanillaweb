# 📝 原生響應式表單與驗證引擎 (Forms Handling)

在前端開發中，管理表單狀態（如：欄位是否已被修改過、是否觸碰過、錯誤訊息的管理、非同步後端檢查等）是一項繁重且容易出 Bug 的工作。

本專案實作了一套零相依的 **響應式表單引擎 (`lib/form-engine.js`)**，提供如同 Angular 或 React Hook Form 般的開發體驗，且完全符合標準的 HTML `ValidityState` 與 Web 安全規範。

---

## 🛠️ 1. 核心觀念與資料模型

表單引擎由三個核心類別組成，皆繼承自 `BaseService` 以支援事件監聽：

### 1.1 `FormControl` (單一欄位控制)
管理單一欄位的值、驗證規則與狀態（Touched/Dirty/Pending/Valid）。
* **Touched (觸碰狀態)**：使用者是否點擊過該欄位並移開（通常在 `blur` 事件中觸發）。這可以防止使用者在還沒開始輸入前就顯示刺眼的紅色錯誤訊息。
* **Dirty (修改狀態)**：欄位值是否已被修改過（相較於初始值）。
* **Pending (驗證中狀態)**：通常用於非同步驗證（例如向伺服器發送 API 檢查帳號是否重複時）。

### 1.2 `FormGroup` (表單群組)
將多個 `FormControl` 彙整成一個樹狀結構。當且僅當所有子欄位皆合法時，`FormGroup` 的 `valid` 狀態才為 `true`。

### 1.3 `Validators` (驗證器)
提供內建的驗證規則（如 `required`, `email`, `minLen(N)`, `pattern`）。

---

## 💻 2. 實戰範例：使用者註冊表單

以下示範如何在一個 `BaseComponent` 元件中配置、綁定並渲染一個包含**即時驗證**與**非同步帳號重複檢查**的註冊表單。

```javascript
import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { FormControl, FormGroup, Validators } from '../../lib/form-engine.js';
import { notificationService } from '../../lib/notification-service.js';

export class RegisterForm extends BaseComponent {
    constructor() {
        super();
        
        // 1. 初始化響應式表單群組
        this.form = new FormGroup({
            username: new FormControl('', [Validators.required, Validators.minLen(3)], [this.checkUsernameUnique.bind(this)]),
            email: new FormControl('', [Validators.required, Validators.email]),
            password: new FormControl('', [Validators.required, Validators.minLen(6)])
        });

        // 2. 當表單狀態改變時，手動觸發組件重繪
        this.form.on('status-change', () => this.update());
        this.form.on('value-change', () => this.update());
    }

    // 3. 模擬非同步 API 檢查帳號是否已被註冊
    async checkUsernameUnique(value) {
        return new Promise(resolve => {
            setTimeout(() => {
                // 模擬已存在 "admin" 帳號
                if (value.toLowerCase() === 'admin') {
                    resolve({ unique: '此使用者名稱已被註冊。' });
                } else {
                    resolve(null); // 回傳 null 表示驗證通過
                }
            }, 1000);
        });
    }

    // 4. 表單提交處理
    handleSubmit(event) {
        event.preventDefault();
        
        // 標記所有欄位為已觸碰，以便在未填寫時顯示錯誤
        this.form.markAllAsTouched();
        
        if (this.form.valid) {
            notificationService.success('表單驗證成功！正在送出資料...');
            console.log('Submitted Value:', this.form.value);
        } else {
            notificationService.error('請修正表單中的錯誤欄位。');
        }
    }

    render() {
        const usernameCtrl = this.form.get('username');
        const emailCtrl = this.form.get('email');
        const passwordCtrl = this.form.get('password');

        return html`
            <form onsubmit="this.closest('register-form').handleSubmit(event)" class="form-container">
                <!-- 使用者名稱欄位 -->
                <div class="form-field">
                    <label for="username">使用者名稱</label>
                    <input 
                        id="username" 
                        value="${usernameCtrl.value}"
                        oninput="this.closest('register-form').form.get('username').setValue(this.value)"
                        onblur="this.closest('register-form').form.get('username').markAsTouched()"
                    />
                    <!-- 僅在使用者觸碰過且欄位無效時，顯示錯誤訊息 -->
                    ${usernameCtrl.touched && usernameCtrl.errors ? html`
                        <span class="error-msg">${usernameCtrl.errors.required || usernameCtrl.errors.minLen || usernameCtrl.errors.unique}</span>
                    ` : ''}
                    ${usernameCtrl.pending ? html`<span class="pending-msg">🔄 正在檢查帳號可用性...</span>` : ''}
                </div>

                <!-- 信箱欄位 -->
                <div class="form-field">
                    <label for="email">電子信箱</label>
                    <input 
                        id="email" 
                        type="email"
                        value="${emailCtrl.value}"
                        oninput="this.closest('register-form').form.get('email').setValue(this.value)"
                        onblur="this.closest('register-form').form.get('email').markAsTouched()"
                    />
                    ${emailCtrl.touched && emailCtrl.errors ? html`
                        <span class="error-msg">${emailCtrl.errors.required || emailCtrl.errors.email}</span>
                    ` : ''}
                </div>

                <!-- 密碼欄位 -->
                <div class="form-field">
                    <label for="password">密碼</label>
                    <input 
                        id="password" 
                        type="password"
                        value="${passwordCtrl.value}"
                        oninput="this.closest('register-form').form.get('password').setValue(this.value)"
                        onblur="this.closest('register-form').form.get('password').markAsTouched()"
                    />
                    ${passwordCtrl.touched && passwordCtrl.errors ? html`
                        <span class="error-msg">${passwordCtrl.errors.required || passwordCtrl.errors.minLen}</span>
                    ` : ''}
                </div>

                <button type="submit" class="btn btn-primary" ${!this.form.valid ? 'disabled' : ''}>
                    註冊
                </button>
            </form>
        `;
    }
}

customElements.define('register-form', RegisterForm);
```

---

## ⚙️ 3. 與原生 `ValidityState` 與事件委派的結合

在最簡單的表單中，您不需要使用這麼複雜的 `FormGroup`。您可以直接利用瀏覽器內建的 `Constraint Validation API`：

```javascript
// 直接利用原生的 Validity 狀態
validateNative(inputElement) {
    if (!inputElement.validity.valid) {
        if (inputElement.validity.valueMissing) {
            return '此欄位為必填。';
        }
        if (inputElement.validity.typeMismatch) {
            return '格式不正確。';
        }
    }
    return '';
}
```
本專案的 `lib/form-engine.js` 與 `lib/validation-service.js` 提供了這兩種模式的完美對接，讓您可以依據表單複雜度，在「超輕量 HTML 原生檢核」與「響應式表單狀態樹」之間自由選擇。
