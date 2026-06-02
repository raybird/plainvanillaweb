import test from 'node:test';
import assert from 'node:assert';

// PaymentRequest 不存在於 Node，以可設定的假類別模擬。
const { PaymentService } = await import('../lib/payment-service.js');

const origWindow = global.window;
const origPR = global.PaymentRequest;

/** 安裝假的 PaymentRequest；impl 可提供 canMakePayment() 與 show(req) */
function installPaymentRequest(impl = {}) {
    const Fake = class {
        constructor(methods, details, options) {
            this.methods = methods;
            this.details = details;
            this.options = options;
        }
        canMakePayment() { return impl.canMakePayment ? impl.canMakePayment() : Promise.resolve(true); }
        show() { return impl.show ? impl.show(this) : Promise.resolve({ complete: async () => {} }); }
    };
    global.PaymentRequest = Fake;
    global.window = { PaymentRequest: Fake };
}

test.afterEach(() => {
    global.window = origWindow;
    global.PaymentRequest = origPR;
});

test('使用 Google Pay 付款方式，不再使用已移除的 basic-card', () => {
    installPaymentRequest();
    const svc = new PaymentService();
    assert.strictEqual(svc.paymentMethods[0].supportedMethods, 'https://google.com/pay');
    const serialized = JSON.stringify(svc.paymentMethods);
    assert.doesNotMatch(serialized, /basic-card/);
});

test('isAvailable: 無 PaymentRequest API 時回傳 false', async () => {
    global.window = {};            // 無 PaymentRequest
    delete global.PaymentRequest;
    const svc = new PaymentService();
    assert.strictEqual(svc.hasApi, false);
    assert.strictEqual(await svc.isAvailable(), false);
});

test('isAvailable: canMakePayment 為 true 時回傳 true', async () => {
    installPaymentRequest({ canMakePayment: async () => true });
    const svc = new PaymentService();
    assert.strictEqual(await svc.isAvailable(), true);
});

test('isAvailable: canMakePayment 為 false 時回傳 false', async () => {
    installPaymentRequest({ canMakePayment: async () => false });
    const svc = new PaymentService();
    assert.strictEqual(await svc.isAvailable(), false);
});

test('isAvailable: 偵測拋錯時安全回傳 false (不拋出)', async () => {
    installPaymentRequest({ canMakePayment: () => { throw new Error('boom'); } });
    const svc = new PaymentService();
    assert.strictEqual(await svc.isAvailable(), false);
});

test('checkout: 無 API 時拋出明確錯誤', async () => {
    global.window = {};
    delete global.PaymentRequest;
    const svc = new PaymentService();
    await assert.rejects(() => svc.checkout([]), /不支援 Payment Request API/);
});

test('checkout: 成功時完成支付並發出 payment-success', async () => {
    let completedWith = null;
    installPaymentRequest({
        show: async () => ({
            payerName: 'Ray',
            payerEmail: 'ray@example.com',
            details: { token: 'tok_123' },
            complete: async (status) => { completedWith = status; }
        })
    });
    const svc = new PaymentService();

    let emitted = null;
    svc.on('payment-success', (d) => { emitted = d; });

    const items = [{ label: 'A', amount: { currency: 'USD', value: '10.00' } }];
    const res = await svc.checkout(items);

    assert.strictEqual(completedWith, 'success');
    assert.strictEqual(res.payerName, 'Ray');
    assert.deepStrictEqual(emitted, { payer: 'Ray', email: 'ray@example.com', details: { token: 'tok_123' } });
});

test('_calculateTotal 加總並保留兩位小數', () => {
    installPaymentRequest();
    const svc = new PaymentService();
    const total = svc._calculateTotal([
        { amount: { value: '3000.00' } },
        { amount: { value: '500.50' } }
    ]);
    assert.strictEqual(total, '3500.50');
});
