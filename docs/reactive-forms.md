# 📝 原生響應式表單與驗證引擎 (Forms Handling)

在前端開發中，管理表單狀態（如：欄位是否已被修改過、是否觸碰過、錯誤訊息的管理、非同步後端檢查等）是一項繁重且容易出 Bug 的工作。

本專案實作了一套零相依的 **響應式表單引擎 (`lib/form-engine.js`)**，提供如同 Angular 或 React Hook Form 般的開發體驗（需要瀏覽器原生 `ValidityState` 檢核時，請改用 `lib/validation-service.js`，見第 3 節）。

---

## 🛠️ 1. 核心觀念與資料模型

表單引擎由 `FormControl`、`FormGroup` 兩個類別（皆繼承 `BaseService` 以支援事件監聽）與 `Validators` 驗證器物件組成：

### 1.1 `FormControl` (單一欄位控制)
管理單一欄位的值、驗證規則與狀態。狀態旗標都放在 `control.state` 底下（`valid`、`invalid`、`touched`、`dirty`、`pending`、`errors`）；寫入 `control.value = 新值` 會把欄位標為 dirty 並立即驗證，狀態改變時發出 `status-change` 事件。
* **Touched (觸碰狀態)**：使用者是否點擊過該欄位並移開（在 `blur` 事件中呼叫 `markAsTouched()`）。這可以防止使用者在還沒開始輸入前就顯示刺眼的紅色錯誤訊息。
* **Dirty (修改狀態)**：欄位值是否曾被寫入過（任何一次賦值即為 `true`，不與初始值比較）。
* **Pending (驗證中狀態)**：非同步驗證執行期間為 `true`（例如向伺服器發送 API 檢查帳號是否重複時）。

### 1.2 `FormGroup` (表單群組)
將多個 `FormControl` 彙整為一組，透過 `form.controls.<名稱>` 取得各欄位（不支援巢狀 FormGroup）。所有子欄位的 `state.valid` 皆為 `true` 時，`FormGroup` 的 `valid` 才為 `true`；任一欄位發出 `status-change` 時，群組也會發出 `status-change`。注意欄位在第一次驗證前預設為合法，送出前請先呼叫 `validateAll()`（標記所有欄位為已觸碰並重新驗證）。

### 1.3 `Validators` (驗證器)
提供內建的驗證規則（`required`, `email`, `minLen(N)`, `pattern(RegExp)`）。驗證器只回傳錯誤旗標，不含顯示文字：`{ required: true }`、`{ minlen: { required: N, actual: 目前長度 } }`、`{ email: true }`、`{ pattern: true }`，訊息需自行對應。非同步驗證器則是回傳 Promise 的函式，解析為 `null` 表示通過。

---

## 💻 2. 實戰範例：使用者註冊表單

以下示範如何在一個 `BaseComponent` 元件中配置、綁定並渲染一個包含**即時驗證**與**非同步帳號重複檢查**的註冊表單。重繪時 `BaseComponent` 以 DOM morphing 就地更新，輸入框會被保留，所以輸入中的焦點與游標不會跳掉，`oninput` 寫在模板裡也不會重複綁定。

```javascript
import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { FormControl, FormGroup, Validators } from '../../lib/form-engine.js';
import { notificationService } from '../../lib/notification-service.js';

// 內建驗證器只回傳錯誤旗標，在這裡對應成顯示文字
function errorMessage(errors) {
    if (!errors) return '';
    if (errors.required) return '此欄位為必填。';
    if (errors.minlen) return `至少需要 ${errors.minlen.required} 個字元。`;
    if (errors.email) return '電子信箱格式不正確。';
    return errors.unique || ''; // 非同步驗證器回傳的訊息
}

export class RegisterForm extends BaseComponent {
    constructor() {
        super();

        // 1. 初始化響應式表單群組
        this.form = new FormGroup({
            username: new FormControl('', [Validators.required, Validators.minLen(3)], [this.checkUsernameUnique.bind(this)]),
            email: new FormControl('', [Validators.required, Validators.email]),
            password: new FormControl('', [Validators.required, Validators.minLen(6)])
        });

        // 2. 任一欄位狀態改變（含非同步驗證開始與結束）時排程重繪；同一個 frame 內的多次變更只重繪一次
        this.form.on('status-change', () => this.scheduleUpdate());
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
    async handleSubmit(event) {
        event.preventDefault();

        // 等同 validateAll()：標記所有欄位為已觸碰並重新驗證，未填寫的欄位才會顯示錯誤。
        // validateAll() 不回傳 Promise，有非同步驗證器時改為自行等待每個欄位的 validate() 完成
        const controls = Object.values(this.form.controls);
        controls.forEach(control => control.markAsTouched());
        await Promise.all(controls.map(control => control.validate()));

        if (this.form.valid) {
            notificationService.success('表單驗證成功！正在送出資料...');
            console.log('Submitted Value:', this.form.value);
        } else {
            notificationService.error('請修正表單中的錯誤欄位。');
        }
    }

    render() {
        const { username, email, password } = this.form.controls;
        const isPending = Object.values(this.form.controls).some(control => control.state.pending);

        return html`
            <form onsubmit="this.closest('register-form').handleSubmit(event)" class="form-container">
                <!-- 使用者名稱欄位 -->
                <div class="form-field">
                    <label for="username">使用者名稱</label>
                    <input
                        id="username"
                        value="${username.value}"
                        oninput="this.closest('register-form').form.controls.username.value = this.value"
                        onblur="this.closest('register-form').form.controls.username.markAsTouched()"
                    />
                    <!-- 僅在使用者觸碰過且欄位無效時，顯示錯誤訊息 -->
                    ${username.state.touched && username.state.errors ? html`
                        <span class="error-msg">${errorMessage(username.state.errors)}</span>
                    ` : ''}
                    ${username.state.pending ? html`<span class="pending-msg">🔄 正在檢查帳號可用性...</span>` : ''}
                </div>

                <!-- 信箱欄位 -->
                <div class="form-field">
                    <label for="email">電子信箱</label>
                    <input
                        id="email"
                        type="email"
                        value="${email.value}"
                        oninput="this.closest('register-form').form.controls.email.value = this.value"
                        onblur="this.closest('register-form').form.controls.email.markAsTouched()"
                    />
                    ${email.state.touched && email.state.errors ? html`
                        <span class="error-msg">${errorMessage(email.state.errors)}</span>
                    ` : ''}
                </div>

                <!-- 密碼欄位 -->
                <div class="form-field">
                    <label for="password">密碼</label>
                    <input
                        id="password"
                        type="password"
                        value="${password.value}"
                        oninput="this.closest('register-form').form.controls.password.value = this.value"
                        onblur="this.closest('register-form').form.controls.password.markAsTouched()"
                    />
                    ${password.state.touched && password.state.errors ? html`
                        <span class="error-msg">${errorMessage(password.state.errors)}</span>
                    ` : ''}
                </div>

                <!-- 有欄位不合法或仍在非同步驗證時停用 -->
                <button type="submit" class="btn btn-primary" ${!this.form.valid || isPending ? 'disabled' : ''}>
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
