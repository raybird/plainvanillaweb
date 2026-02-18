import { BaseService } from './base-service.js';

/**
 * CryptoService - 原生 Web Crypto 封裝
 * 提供基於 Web Crypto API 的安全雜湊與加解密功能。
 */
export class CryptoService extends BaseService {
    /**
     * 生成 SHA-256 雜湊
     * @param {string} text 
     * @returns {Promise<string>}
     */
    async sha256(text) {
        const msgUint8 = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 生成安全隨機字串 (用於 Salt 或 Token)
     * @param {number} length 
     * @returns {string}
     */
    generateRandomString(length = 32) {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('');
    }

    /**
     * 加密數據 (AES-GCM)
     * @param {string} text 
     * @param {string} password 
     * @returns {Promise<{ciphertext: string, iv: string}>}
     */
    async encrypt(text, password) {
        const enc = new TextEncoder();
        const keyMaterial = await this._getKeyMaterial(password);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            keyMaterial,
            enc.encode(text)
        );

        return {
            ciphertext: this._arrayBufferToBase64(ciphertext),
            iv: this._arrayBufferToBase64(iv.buffer)
        };
    }

    /**
     * 解密數據 (AES-GCM)
     * @param {string} ciphertextBase64 
     * @param {string} ivBase64 
     * @param {string} password 
     */
    async decrypt(ciphertextBase64, ivBase64, password) {
        try {
            const keyMaterial = await this._getKeyMaterial(password);
            const ciphertext = this._base64ToArrayBuffer(ciphertextBase64);
            const iv = new Uint8Array(this._base64ToArrayBuffer(ivBase64));

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                keyMaterial,
                ciphertext
            );

            return new TextDecoder().decode(decrypted);
        } catch (err) {
            throw new Error('解密失敗，請檢查密碼或數據完整性。');
        }
    }

    // 私有輔助方法
    async _getKeyMaterial(password) {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: enc.encode('vanilla-salt-constant'), // 教學範例使用常數，實務建議搭配隨機 Salt
                iterations: 100000,
                hash: 'SHA-256'
            },
            key,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    _base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

export const cryptoService = new CryptoService();
