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
        this._validation = 0;
        
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
        const revision = ++this._validation;
        const value = this._value;
        const errors = {};
        
        // 1. 同步驗證
        for (const validator of this._validators) {
            const res = validator(value);
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
                    const res = await asyncValidator(value);
                    if (res) Object.assign(errors, res);
                } catch (e) {
                    if (revision !== this._validation) return;
                    console.error('[FormEngine] Async Validator Error:', e);
                    errors.validationUnavailable = true;
                }
                if (revision !== this._validation) return;
            }
        }

        if (revision === this._validation) this._updateState(errors);
    }

    _updateState(errors) {
        this.state.pending = false;
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
        return Object.values(this.controls).every(c => c.state.valid && !c.state.pending);
    }

    _updateGlobalStatus() {
        this.emit('status-change', {
            valid: this.valid,
            value: this.value
        });
    }

    async validateAll() {
        await Promise.all(Object.values(this.controls).map(c => {
            c.markAsTouched();
            return c.validate();
        }));
        return this.valid;
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
