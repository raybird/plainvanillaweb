import { BaseService } from './base-service.js';

/**
 * AuthService - 原生身分驗證服務
 * 負責管理登入狀態、使用者憑證與權限校驗。
 */
export class AuthService extends BaseService {
    constructor() {
        super();
        this._user = null;
        try {
            if (globalThis.localStorage?.getItem('vanilla_auth_token')) {
                const user = JSON.parse(localStorage.getItem('vanilla_user') || 'null');
                if (typeof user?.username === 'string') this._user = user;
            }
        } catch { /* 示範登入仍能在本頁執行。 */ }
        this._isAuthenticated = this._user !== null;
    }

    get isAuthenticated() {
        return this._isAuthenticated;
    }

    get user() {
        return this._user;
    }

    /**
     * 模擬登入
     * @param {string} username 
     * @param {string} password 
     */
    async login(username, password) {
        // 模擬網路延遲
        await new Promise(resolve => setTimeout(resolve, 800));

        if (username === 'admin' && password === '1234') {
            this._isAuthenticated = true;
            this._user = { username, role: 'admin', lastLogin: Date.now() };
            
            try {
                localStorage.setItem('vanilla_auth_token', 'mock_token_abc123');
                localStorage.setItem('vanilla_user', JSON.stringify(this._user));
            } catch { /* 僅保留本頁的示範登入狀態。 */ }
            
            this.emit('auth-change', { isAuthenticated: true, user: this._user });
            return true;
        }
        
        throw new Error('帳號或密碼錯誤 (提示: admin / 1234)');
    }

    /**
     * 登出
     */
    logout() {
        this._isAuthenticated = false;
        this._user = null;
        try {
            localStorage.removeItem('vanilla_auth_token');
            localStorage.removeItem('vanilla_user');
        } catch { /* 本頁狀態已清除。 */ }
        
        this.emit('auth-change', { isAuthenticated: false, user: null });
    }

    /**
     * 校驗權限
     * @param {string} requiredRole 
     */
    hasRole(requiredRole) {
        return this._user?.role === requiredRole;
    }
}

export const authService = new AuthService();
