import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { appStore } from '../../lib/store.js';

export class UserProfile extends BaseComponent {
    constructor() {
        super();
        this.state = { 
            name: appStore.state.userProfile?.name || '',
            bio: appStore.state.userProfile?.bio || '',
            avatar: appStore.state.userProfile?.avatar || 'assets/images/user-profile.jpg',
            previewMode: false 
        };
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    handleSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        // 更新 Store
        const newProfile = {
            ...appStore.state.userProfile,
            name: formData.get('name'),
            bio: formData.get('bio')
        };
        
        appStore.state.userProfile = newProfile;
        
        // 顯示通知
        appStore.state.notifications = [...appStore.state.notifications, "個人資料已更新！"];
        
        // 更新本地狀態以觸發重繪
        this.state = { ...this.state, ...newProfile };
        this.update();
    }

    handleAvatarChange(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.state.avatar = e.target.result;
                this.state.previewMode = true; // 標記為預覽模式，不立即存入 Store (除非使用者按儲存)
                this.update();
            };
            reader.readAsDataURL(file);
        }
    }

    render() {
        return html`
            <h1>👤 個人資料 (Profile Demo)</h1>
            <p>展示原生表單處理與靜態資源管理。</p>

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
                    <h3>編輯資料</h3>
                    <form id="profile-form" style="display: grid; gap: 1rem;">
                        <label>
                            <strong>姓名</strong>
                            <input name="name" value="${this.state.name}" required style="display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem;">
                        </label>
                        
                        <label>
                            <strong>簡介</strong>
                            <textarea name="bio" required style="display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem; min-height: 80px;">${this.state.bio}</textarea>
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
        this.querySelector('#profile-form')?.addEventListener('submit', this.handleSubmit);
        this.querySelector('#avatar-input')?.addEventListener('change', (e) => this.handleAvatarChange(e));
    }
}
customElements.define('page-profile', UserProfile);
