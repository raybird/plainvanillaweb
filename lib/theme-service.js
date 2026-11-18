import { BaseService } from './base-service.js';
import { appStore } from './store.js';

class ThemeService extends BaseService {
    constructor() {
        super();
        this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this._handleSystemChange = this._handleSystemChange.bind(this);
        
        // 監聽 Store 變更
        appStore.addEventListener('change', (e) => {
            if (e.detail.key === 'theme' || e.detail.key === 'primaryColor' || e.detail.isSnapshot) {
                this.applyTheme();
            }
        });

        // 監聽系統偏好變更
        this._mediaQuery.addEventListener('change', this._handleSystemChange);
    }

    init() {
        // 初始化時應用主題
        this.applyTheme();
    }

    _handleSystemChange() {
        if (!['light', 'dark'].includes(appStore.state.theme)) {
            this.applyTheme();
        }
    }

    applyTheme() {
        const preference = appStore.state.theme;
        const mode = ['light', 'dark'].includes(preference) ? preference : 'system';
        const primaryColor = appStore.state.primaryColor || '#007bff';
        
        let effectiveMode = mode;
        if (mode === 'system') {
            effectiveMode = this._mediaQuery.matches ? 'dark' : 'light';
        }

        // 設定 data-theme 屬性
        document.documentElement.setAttribute('data-theme', effectiveMode);
        
        // 設定主色調 CSS 變數
        document.documentElement.style.setProperty('--primary-color', primaryColor);
        
        this.emit('change', { mode, effectiveMode });
    }
}

export const themeService = new ThemeService();
