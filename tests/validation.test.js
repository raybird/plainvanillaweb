import test from 'node:test';
import assert from 'node:assert';

// ValidationService 只依賴 Constraint Validation API 的少數方法，
// 用輕量假物件模擬欄位即可，無需 jsdom。
const { ValidationService } = await import('../lib/validation-service.js');

/** 建立模擬欄位 */
const makeField = (name, valid, message = '') => ({
    name,
    checkValidity: () => valid,
    validationMessage: message
});

test('validateField 對有效欄位回傳 true 且不留錯誤', () => {
    const v = new ValidationService();
    assert.strictEqual(v.validateField(makeField('email', true)), true);
    assert.strictEqual(v.getError('email'), undefined);
});

test('validateField 對無效欄位回傳 false 並記錄訊息', () => {
    const v = new ValidationService();
    assert.strictEqual(v.validateField(makeField('email', false, '格式錯誤')), false);
    assert.strictEqual(v.getError('email'), '格式錯誤');
});

test('validateField 再次驗證通過時清除舊錯誤', () => {
    const v = new ValidationService();
    v.validateField(makeField('email', false, '格式錯誤'));
    v.validateField(makeField('email', true));
    assert.strictEqual(v.getError('email'), undefined);
});

test('validateField 發出 validation-change 事件', () => {
    const v = new ValidationService();
    let payload = null;
    v.on('validation-change', (d) => { payload = d; });
    v.validateField(makeField('user', false, 'required'));
    assert.deepStrictEqual(payload, { name: 'user', isValid: false, message: 'required' });
});

test('validateField 對 null 安全回傳 true', () => {
    const v = new ValidationService();
    assert.strictEqual(v.validateField(null), true);
});

test('validateForm 全部有效才回傳 true', () => {
    const v = new ValidationService();
    const form = {
        querySelectorAll: () => [makeField('a', true), makeField('b', true)]
    };
    assert.strictEqual(v.validateForm(form), true);
});

test('validateForm 任一無效即回傳 false', () => {
    const v = new ValidationService();
    const form = {
        querySelectorAll: () => [makeField('a', true), makeField('b', false, 'bad')]
    };
    assert.strictEqual(v.validateForm(form), false);
    assert.strictEqual(v.getError('b'), 'bad');
});

test('clearErrors 清空所有錯誤', () => {
    const v = new ValidationService();
    v.validateField(makeField('a', false, 'x'));
    v.clearErrors();
    assert.strictEqual(v.getError('a'), undefined);
});
