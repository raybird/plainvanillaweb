import { BaseService } from './base-service.js';

/**
 * FormControl - 單一欄位控制邏輯
 */
export class FormControl extends BaseService {
    constructor(initialValue = '', validators = [], asyncValidators = []) {
        super();
        this._value = initialValue;
        this._validators = validators;
        this._asyncValidators = asyncValidators;
        
        this.state = {
            valid: true,
            invalid: false,
            pending: false,
            touched: false,
            dirty: false,
            errors: null
        };
    }

    get value() { return this._value; }
    set value(v) {
        this._value = v;
        this.state.dirty = true;
        this.validate();
    }

    markAsTouched() {
        this.state.touched = true;
        this.emit('status-change', this.state);
    }

    async validate() {
        const errors = {};
        
        // 1. 同步驗證
        for (const validator of this._validators) {
            const res = validator(this._value);
            if (res) Object.assign(errors, res);
        }

        const hasSyncErrors = Object.keys(errors).length > 0;
        
        if (hasSyncErrors) {
            this._updateState(errors);
            return;
        }

        // 2. 非同步驗證
        if (this._asyncValidators.length > 0) {
            this.state.pending = true;
            this.emit('status-change', this.state);

            for (const asyncValidator of this._asyncValidators) {
                try {
                    const res = await asyncValidator(this._value);
                    if (res) Object.assign(errors, res);
                } catch (e) {
                    console.error('[FormEngine] Async Validator Error:', e);
                }
            }
            this.state.pending = false;
        }

        this._updateState(errors);
    }

    _updateState(errors) {
        const hasErrors = Object.keys(errors).length > 0;
        this.state.errors = hasErrors ? errors : null;
        this.state.valid = !hasErrors;
        this.state.invalid = hasErrors;
        this.emit('status-change', this.state);
        this.emit('value-change', this._value);
    }
}

/**
 * FormGroup - 表單欄位組合
 */
export class FormGroup extends BaseService {
    constructor(controls = {}) {
        super();
        this.controls = controls;
        
        // 監聽子欄位變動
        Object.keys(controls).forEach(key => {
            controls[key].on('status-change', () => this._updateGlobalStatus());
        });
    }

    get value() {
        return Object.keys(this.controls).reduce((acc, key) => {
            acc[key] = this.controls[key].value;
            return acc;
        }, {});
    }

    get valid() {
        return Object.values(this.controls).every(c => c.state.valid);
    }

    _updateGlobalStatus() {
        this.emit('status-change', {
            valid: this.valid,
            value: this.value
        });
    }

    validateAll() {
        Object.values(this.controls).forEach(c => {
            c.markAsTouched();
            c.validate();
        });
    }
}

/**
 * 內建驗證器工廠
 */
export const Validators = {
    required: (val) => (!val || val.length === 0 ? { required: true } : null),
    minLen: (min) => (val) => (val.length < min ? { minlen: { required: min, actual: val.length } } : null),
    email: (val) => (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? { email: true } : null),
    pattern: (reg) => (val) => (!reg.test(val) ? { pattern: true } : null)
};
