import { BaseService } from './base-service.js';

/**
 * WebAuthnService - 原生生物辨識驗證服務
 * 利用 WebAuthn API 實現 FaceID / TouchID / Security Key 驗證。
 * 本服務模擬了一個 Relying Party (RP) 伺服器行為。
 */
export class WebAuthnService extends BaseService {
    constructor() {
        super();
        this.isSupported = !!(window.PublicKeyCredential && 
                             navigator.credentials && 
                             navigator.credentials.create);
        
        // 儲存已註冊的憑證 (模擬伺服器資料庫)
        this._storageKey = 'vanilla_webauthn_credentials';
    }

    /**
     * 註冊新憑證 (生物辨識/安全金鑰)
     * @param {string} username 使用者名稱
     * @returns {Promise<Object>} 憑證資訊
     */
    async register(username) {
        if (!this.isSupported) throw new Error('您的瀏覽器不支援 WebAuthn');

        // 1. 建立挑戰值與設定 (模擬 Server 生成)
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const userId = new TextEncoder().encode(username + '_' + Date.now());

        const createOptions = {
            publicKey: {
                challenge,
                rp: {
                    name: "Plain Vanilla Web",
                    id: window.location.hostname || "localhost"
                },
                user: {
                    id: userId,
                    name: username,
                    displayName: username
                },
                pubKeyCredParams: [
                    { alg: -7, type: "public-key" }, // ES256
                    { alg: -257, type: "public-key" } // RS256
                ],
                timeout: 60000,
                attestation: "direct",
                authenticatorSelection: {
                    userVerification: "preferred",
                    residentKey: "preferred"
                }
            }
        };

        // 2. 呼叫瀏覽器原生介面
        try {
            const credential = await navigator.credentials.create(createOptions);
            
            // 3. 提取憑證資訊 (模擬 Server 儲存)
            const credData = {
                id: this._bufferToBase64(credential.rawId),
                type: credential.type,
                publicKey: this._bufferToBase64(credential.response.getPublicKey ? credential.response.getPublicKey() : new Uint8Array(0)),
                username: username,
                createdAt: Date.now()
            };

            this._saveCredential(credData);
            this.emit('register-success', credData);
            return credData;
        } catch (err) {
            console.error('[WebAuthn] Register Error:', err);
            throw err;
        }
    }

    /**
     * 使用已註冊憑證進行驗證
     * @returns {Promise<boolean>} 是否驗證成功
     */
    async authenticate() {
        const savedCreds = this.getCredentials();
        if (savedCreds.length === 0) throw new Error('尚未註冊任何生物辨識憑證');

        // 1. 準備挑戰 (模擬 Server 生成)
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const allowCredentials = savedCreds.map(c => ({
            id: this._base64ToBuffer(c.id),
            type: 'public-key'
        }));

        const getOptions = {
            publicKey: {
                challenge,
                allowCredentials,
                timeout: 60000,
                userVerification: "required"
            }
        };

        // 2. 呼叫瀏覽器原生介面
        try {
            const assertion = await navigator.credentials.get(getOptions);
            
            // 3. 驗證結果 (模擬 Server 驗證)
            // 在實際應用中，會將 assertion 傳回伺服器進行簽章驗證
            console.log('[WebAuthn] Assertion received:', assertion);
            
            this.emit('auth-success', { id: this._bufferToBase64(assertion.rawId) });
            return true;
        } catch (err) {
            console.error('[WebAuthn] Auth Error:', err);
            throw err;
        }
    }

    /**
     * 獲取所有已註冊憑證
     */
    getCredentials() {
        return JSON.parse(localStorage.getItem(this._storageKey)) || [];
    }

    /**
     * 清除所有憑證
     */
    clearCredentials() {
        localStorage.removeItem(this._storageKey);
        this.emit('credentials-cleared');
    }

    // --- 輔助工具 ---

    _saveCredential(cred) {
        const creds = this.getCredentials();
        creds.push(cred);
        localStorage.setItem(this._storageKey, JSON.stringify(creds));
    }

    _bufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    _base64ToBuffer(base64) {
        const binary = window.atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

export const webauthnService = new WebAuthnService();
