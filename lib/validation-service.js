import { BaseService } from './base-service.js';

/**
 * ValidationService - 原生表單驗證服務
 * 封裝並增強瀏覽器內建的 Constraint Validation API。
 */
export class ValidationService extends BaseService {
    constructor() {
        super();
        this._errors = new Map();
    }

    /**
     * 驗證單個輸入欄位
     * @param {HTMLInputElement|HTMLTextAreaElement} field 
     * @returns {boolean}
     */
    validateField(field) {
        if (!field) return true;

        const isValid = field.checkValidity();
        const name = field.name;

        if (!isValid) {
            // 優先使用自訂錯誤訊息，否則使用瀏覽器預設
            const message = field.validationMessage;
            this._errors.set(name, message);
        } else {
            this._errors.delete(name);
        }

        this.emit('validation-change', { name, isValid, message: this._errors.get(name) });
        return isValid;
    }

    /**
     * 驗證整個表單
     * @param {HTMLFormElement} form 
     * @returns {boolean}
     */
    validateForm(form) {
        let isFormValid = true;
        const inputs = form.querySelectorAll('input, textarea, select');
        
        inputs.forEach(input => {
            if (!this.validateField(input)) {
                isFormValid = false;
            }
        });

        return isFormValid;
    }

    getError(name) {
        return this._errors.get(name);
    }

    clearErrors() {
        this._errors.clear();
        this.emit('clear');
    }
}

export const validationService = new ValidationService();
