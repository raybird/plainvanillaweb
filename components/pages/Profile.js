import { html } from "../../lib/html.js";
import { BaseComponent } from "../../lib/base-component.js";
import { appStore } from "../../lib/store.js";
import { validationService } from "../../lib/validation-service.js";
import { notificationService } from "../../lib/notification-service.js";
import { syncService } from "../../lib/sync-service.js";
import { connectivityService } from "../../lib/connectivity-service.js";
import { imageService } from "../../lib/image-service.js";

export class UserProfile extends BaseComponent {
  constructor() {
    super();
    this.state = {
      name: appStore.state.userProfile?.name || "",
      bio: appStore.state.userProfile?.bio || "",
      avatar:
        appStore.state.userProfile?.avatar || "assets/images/user-profile.jpg",
      previewMode: false,
      errors: {},
    };
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleValidation = this.handleValidation.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    validationService.addEventListener(
      "validation-change",
      this.handleValidation,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    validationService.removeEventListener(
      "validation-change",
      this.handleValidation,
    );
  }

  handleValidation(e) {
    const { name, isValid, message } = e.detail;
    this.state.errors[name] = isValid ? null : message;
    this.update();
  }

  async applyFilter() {
    if (!this.state.avatar) return;
    notificationService.info("正在套用濾鏡...");
    try {
      const filtered = await imageService.applyGrayscale(this.state.avatar);
      this.state.avatar = filtered;
      this.state.previewMode = true;
      notificationService.success("濾鏡套用成功！");
      this.update();
    } catch (err) {
      notificationService.error("濾鏡處理失敗");
    }
  }

  handleSubmit(e) {
    e.preventDefault();
    const form = e.target;

    if (!validationService.validateForm(form)) {
      notificationService.warn("表單包含錯誤，請修正後再試。");
      return;
    }

    const formData = new FormData(form);
    const newProfile = {
      ...appStore.state.userProfile,
      name: formData.get("name"),
      bio: formData.get("bio"),
      avatar: this.state.avatar,
    };

    appStore.state.userProfile = newProfile;
    syncService.queueAction("update_profile", newProfile);

    if (connectivityService.isOnline) {
      notificationService.success("個人資料已更新並同步至雲端。");
    }

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
    const theme = appStore.state.theme || "system";
    const primaryColor = appStore.state.primaryColor || "#007bff";
    const { errors } = this.state;
    const errorStyle =
      "color: #dc3545; font-size: 0.8rem; margin-top: 0.25rem; display: block;";

    return html`
      <h1>👤 個人資料 (Profile Demo)</h1>
      <p>展示原生表單處理、驗證機制、影像處理與資源管理。</p>

      <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
        <div
          style="flex: 1; min-width: min(300px, 100%); padding: 2rem; border: 1px solid #ddd; border-radius: 12px; text-align: center; background: var(--nav-bg);"
        >
          <img
            src="${this.state.avatar}"
            alt="Profile"
            style="width: 150px; height: 150px; object-fit: cover; border-radius: 50%; border: 4px solid var(--primary-color); margin-bottom: 1rem;"
          />

          <div
            style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem;"
          >
            <button
              class="btn btn-secondary"
              style="font-size: 0.75rem; padding: 4px 10px;"
              onclick="this.closest('page-profile').applyFilter()"
            >
              🪄 灰階濾鏡
            </button>
          </div>

          <h2>${this.state.name || "未命名"}</h2>
          <p style="color: #666; font-style: italic;">
            ${this.state.bio || "這是一個簡介..."}
          </p>
        </div>

        <div style="flex: 1; min-width: min(300px, 100%);">
          <div
            style="margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #eee;"
          >
            <h3>🎨 外觀設定</h3>
            <div
              style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr;"
            >
              <label>
                <strong>主題模式</strong>
                <select
                  id="theme-select"
                  style="display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem;"
                >
                  <option
                    value="system"
                    ${theme === "system" ? "selected" : ""}
                  >
                    系統跟隨 (System)
                  </option>
                  <option value="light" ${theme === "light" ? "selected" : ""}>
                    淺色 (Light)
                  </option>
                  <option value="dark" ${theme === "dark" ? "selected" : ""}>
                    深色 (Dark)
                  </option>
                </select>
              </label>
              <label>
                <strong>主色調</strong>
                <div
                  style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;"
                >
                  <input
                    type="color"
                    id="color-input"
                    value="${primaryColor}"
                    style="height: 38px; cursor: pointer;"
                  />
                  <span id="color-val" style="font-family: monospace;"
                    >${primaryColor}</span
                  >
                </div>
              </label>
            </div>
          </div>

          <h3>編輯資料</h3>
          <form id="profile-form" novalidate style="display: grid; gap: 1rem;">
            <label>
              <strong>姓名</strong>
              <input
                name="name"
                value="${this.state.name}"
                required
                minlength="2"
                maxlength="20"
                style="display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem; border: 1px solid ${errors.name
                  ? "red"
                  : "#ccc"};"
              />
              ${errors.name
                ? html`<span style="${errorStyle}">${errors.name}</span>`
                : ""}
            </label>

            <label>
              <strong>簡介</strong>
              <textarea
                name="bio"
                required
                minlength="5"
                maxlength="100"
                style="display: block; width: 100%; padding: 0.5rem; margin-top: 0.25rem; min-height: 80px; border: 1px solid ${errors.bio
                  ? "red"
                  : "#ccc"};"
              >
${this.state.bio}</textarea
              >
              ${errors.bio
                ? html`<span style="${errorStyle}">${errors.bio}</span>`
                : ""}
            </label>

            <label>
              <strong>更換頭像 (本地預覽)</strong>
              <input
                type="file"
                accept="image/*"
                id="avatar-input"
                style="display: block; margin-top: 0.25rem;"
              />
            </label>

            <div style="margin-top: 1rem;">
              <button
                type="submit"
                class="btn btn-primary"
                style="width: 100%;"
              >
                儲存變更
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  afterFirstRender() {
    const form = this.querySelector("#profile-form");
    form?.addEventListener("submit", this.handleSubmit);
    form?.addEventListener("input", (e) => {
      if (e.target.name) validationService.validateField(e.target);
    });

    this.querySelector("#avatar-input")?.addEventListener("change", (e) =>
      this.handleAvatarChange(e),
    );

    this.querySelector("#theme-select")?.addEventListener("change", (e) => {
      appStore.state.theme = e.target.value;
    });

    this.querySelector("#color-input")?.addEventListener("input", (e) => {
      const color = e.target.value;
      appStore.state.primaryColor = color;
      this.querySelector("#color-val").textContent = color;
    });
  }
}
customElements.define("page-profile", UserProfile);
