import test from 'node:test';
import assert from 'node:assert';

// 純邏輯 (EventTarget 為 Node 內建)，無需 mock。
const { FormControl, FormGroup, Validators } = await import('../lib/form-engine.js');

// --- Validators 工廠 (純函式) ---

test('Validators.required 偵測空值', () => {
    assert.deepStrictEqual(Validators.required(''), { required: true });
    assert.strictEqual(Validators.required('x'), null);
});

test('Validators.minLen 依長度判定', () => {
    const min3 = Validators.minLen(3);
    assert.deepStrictEqual(min3('ab'), { minlen: { required: 3, actual: 2 } });
    assert.strictEqual(min3('abc'), null);
});

test('Validators.email 驗證格式', () => {
    assert.strictEqual(Validators.email('a@b.com'), null);
    assert.deepStrictEqual(Validators.email('bad'), { email: true });
});

test('Validators.pattern 依正則判定', () => {
    const onlyDigits = Validators.pattern(/^\d+$/);
    assert.strictEqual(onlyDigits('123'), null);
    assert.deepStrictEqual(onlyDigits('12a'), { pattern: true });
});

// --- FormControl ---

test('FormControl 初始為有效狀態', () => {
    const c = new FormControl('', []);
    assert.strictEqual(c.state.valid, true);
    assert.strictEqual(c.state.dirty, false);
});

test('FormControl 同步驗證失敗時設定錯誤', async () => {
    const c = new FormControl('', [Validators.required]);
    await c.validate();
    assert.strictEqual(c.state.valid, false);
    assert.strictEqual(c.state.invalid, true);
    assert.deepStrictEqual(c.state.errors, { required: true });
});

test('設定 value 會標記 dirty 並重新驗證', async () => {
    const c = new FormControl('', [Validators.required]);
    c.value = 'hello';
    await c.validate();
    assert.strictEqual(c.state.dirty, true);
    assert.strictEqual(c.state.valid, true);
    assert.strictEqual(c.state.errors, null);
});

test('FormControl 執行非同步驗證', async () => {
    const asyncTaken = async (val) => (val === 'taken' ? { taken: true } : null);
    const c = new FormControl('taken', [], [asyncTaken]);
    await c.validate();
    assert.strictEqual(c.state.valid, false);
    assert.deepStrictEqual(c.state.errors, { taken: true });
});

test('FormControl 同步錯誤時短路不跑非同步驗證', async () => {
    let asyncCalled = false;
    const asyncV = async () => { asyncCalled = true; return null; };
    const c = new FormControl('', [Validators.required], [asyncV]);
    await c.validate();
    assert.strictEqual(asyncCalled, false);
});

test('markAsTouched 發出 status-change', () => {
    const c = new FormControl('x', []);
    let touched = false;
    c.on('status-change', (s) => { touched = s.touched; });
    c.markAsTouched();
    assert.strictEqual(touched, true);
});

// --- FormGroup ---

test('FormGroup 彙整子欄位的 value', () => {
    const group = new FormGroup({
        name: new FormControl('Ray', []),
        age: new FormControl('30', [])
    });
    assert.deepStrictEqual(group.value, { name: 'Ray', age: '30' });
});

test('FormGroup 全部子欄位有效才 valid', async () => {
    const name = new FormControl('Ray', [Validators.required]);
    const email = new FormControl('', [Validators.required]);
    const group = new FormGroup({ name, email });

    await name.validate();
    await email.validate();
    assert.strictEqual(group.valid, false);

    email.value = 'a@b.com';
    await email.validate();
    assert.strictEqual(group.valid, true);
});
