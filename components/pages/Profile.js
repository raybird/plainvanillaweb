import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { appStore } from '../../lib/store.js';
import { validationService } from '../../lib/validation-service.js';

export class UserProfile extends BaseComponent {
    constructor() {
        super();
        this.state = { 
            name: appStore.state.userProfile?.name || '',
            bio: appStore.state.userProfile?.bio || '',
            avatar: appStore.state.userProfile?.avatar || 'assets/images/user-profile.jpg',
            previewMode: false,
            errors: {} // 存放驗證錯誤
        };
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleValidation = this.handleValidation.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        validationService.addEventListener('validation-change', this.handleValidation);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        validationService.removeEventListener('validation-change', this.handleValidation);
    }

    handleValidation(e) {
        const { name, isValid, message } = e.detail;
        this.state.errors[name] = isValid ? null : message;
        this.update();
    }

    handleSubmit(e) {
        e.preventDefault();
        const form = e.target;
        
        // 提交前進行全表單驗證
        if (!validationService.validateForm(form)) {
            appStore.state.notifications = [...appStore.state.notifications, "表單包含錯誤，請修正後再試。"];
            return;
        }

        const formData = new FormData(form);
        const newProfile = {
            ...appStore.state.userProfile,
            name: formData.get('name'),
            bio: formData.get('bio'),
            avatar: this.state.avatar // 保留可能的預覽圖
        };
        
        appStore.state.userProfile = newProfile;
        appStore.state.notifications = [...appStore.state.notifications, "個人資料已更新！"];
        this.state = { ...this.state, ...newProfile, previewMode: false };
        this.update();
    }

    handleAvatarChange(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.state.avatar = e.target.result;
                this.state.previewMode = true;
                this.update();
            };
            reader.readAsDataURL(file);
        }
    }

    render() {
        const theme = appStore.state.theme || 'system';
        const primaryColor = appStore.state.primaryColor || '#007bff';
        const { errors } = this.state;

        const errorStyle = "color: #dc3545; font-size: 0.8rem; margin-top: 0.25rem; display: block;";

        return html`
            <h1>👤 個人資料 (Profile Demo)</h1>
            <p>展示原生表單處理、驗證機制與靜態資源管理。</p>

            <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
                <!-- 左側：卡片預覽 -->
                <div style="flex: 1; min-width: 300px; padding: 2rem; border: 1px solid #ddd; border-radius: 12px; text-align: center; background: var(--nav-bg);">
                    <img src="${this.state.avatar}" alt="Profile" style="width: 150px; height: 150px; object-fit: cover; border-radius: 50%; border: 4px solid var(--primary-color); margin-bottom: 1rem;">
                    <h2>${this.state.name || '未命名'}</h2>
                    <p style="color: #666; font-style: italic;">${this.state.bio || '這是一個簡介...'}</p>
                    <div style="margin-top: 1rem;">
                        <span style="background: #e9ecef; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #495057;">Vanilla User</span>
                    </div>
                </div>

                <!-- 右側：編輯表單 -->
                <div style="flex: 1; min-width: 300px;">
                    <!-- 外觀設定略 (保持原樣) -->
                    <div style="margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #eee;">
                        <h3>🎨 外觀設定</h3>
                        <div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr;">
                            <label>
                                <strong>主題模式</strong>
                                <select id="theme-select" style="display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem;">
                                    <option value="system" ${theme === 'system' ? 'selected' : ''}>系統跟隨 (System)</option>
                                    <option value="light" ${theme === 'light' ? 'selected' : ''}>淺色 (Light)</option>
                                    <option value="dark" ${theme === 'dark' ? 'selected' : ''}>深色 (Dark)</option>
                                </select>
                            </label>
                            <label>
                                <strong>主色調</strong>
                                <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                                    <input type="color" id="color-input" value="${primaryColor}" style="height: 38px; cursor: pointer;">
                                    <span id="color-val" style="font-family: monospace;">${primaryColor}</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <h3>編輯資料</h3>
                    <form id="profile-form" novalidate style="display: grid; gap: 1rem;">
                        <label>
                            <strong>姓名</strong>
                            <input name="name" value="${this.state.name}" required minlength="2" maxlength="20" 
                                   style="display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem; border: 1px solid ${errors.name ? 'red' : '#ccc'};">
                            ${errors.name ? html`<span style="${errorStyle}">${errors.name}</span>` : ''}
                        </label>
                        
                        <label>
                            <strong>簡介</strong>
                            <textarea name="bio" required minlength="5" maxlength="100" 
                                      style="display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem; min-height: 80px; border: 1px solid ${errors.bio ? 'red' : '#ccc'};">${this.state.bio}</textarea>
                            ${errors.bio ? html`<span style="${errorStyle}">${errors.bio}</span>` : ''}
                        </label>

                        <label>
                            <strong>更換頭像 (本地預覽)</strong>
                            <input type="file" accept="image/*" id="avatar-input" style="display: block; margin-top: 0.25rem;">
                            <small style="color: #666;">圖片將轉為 DataURL 進行預覽。</small>
                        </label>

                        <div style="margin-top: 1rem;">
                            <button type="submit" style="background: var(--primary-color); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-size: 1rem;">
                                儲存變更
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    afterFirstRender() {
        const form = this.querySelector('#profile-form');
        form?.addEventListener('submit', this.handleSubmit);
        
        // 監聽 input 事件進行即時驗證
        form?.addEventListener('input', (e) => {
            if (e.target.name) validationService.validateField(e.target);
        });

        this.querySelector('#avatar-input')?.addEventListener('change', (e) => this.handleAvatarChange(e));
        
        this.querySelector('#theme-select')?.addEventListener('change', (e) => {
            appStore.state.theme = e.target.value;
        });
        
        this.querySelector('#color-input')?.addEventListener('input', (e) => {
            const color = e.target.value;
            appStore.state.primaryColor = color;
            this.querySelector('#color-val').textContent = color;
        });
    }
}
customElements.define('page-profile', UserProfile);
