import test from 'node:test';
import assert from 'node:assert';

// Web Crypto / TextEncoder / btoa 等在 Node 22 皆為全域內建，無需 mock。
const { CryptoService } = await import('../lib/crypto-service.js');
const svc = new CryptoService();

test('sha256 產生已知向量 (NIST "abc")', async () => {
    const hash = await svc.sha256('abc');
    assert.strictEqual(
        hash,
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
});

test('sha256 對相同輸入具確定性', async () => {
    assert.strictEqual(await svc.sha256('vanilla'), await svc.sha256('vanilla'));
});

test('generateRandomString 回傳指定長度的 hex', () => {
    const s = svc.generateRandomString(16);
    assert.strictEqual(s.length, 32);            // 每 byte 兩個 hex 字元
    assert.match(s, /^[0-9a-f]+$/);
});

test('generateRandomString 兩次呼叫不相同', () => {
    assert.notStrictEqual(svc.generateRandomString(), svc.generateRandomString());
});

test('encrypt / decrypt round-trip 還原明文', async () => {
    const plain = '機密訊息 secret 🍦';
    const { ciphertext, iv } = await svc.encrypt(plain, 'pw1234');
    assert.notStrictEqual(ciphertext, plain);
    const out = await svc.decrypt(ciphertext, iv, 'pw1234');
    assert.strictEqual(out, plain);
});

test('decrypt 密碼錯誤時拋出友善錯誤', async () => {
    const { ciphertext, iv } = await svc.encrypt('hello', 'correct');
    await assert.rejects(
        () => svc.decrypt(ciphertext, iv, 'wrong'),
        /解密失敗/
    );
});
