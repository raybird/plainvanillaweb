import test from 'node:test';
import assert from 'node:assert/strict';

// 模組載入時會建立 i18n 單例，建構子讀取 document.baseURI 與 localStorage，先補上最小 stub
global.document = { baseURI: 'http://localhost/' };
global.localStorage = { getItem: () => null, setItem() {} };
const { I18nService } = await import('../lib/i18n-service.js');

function serviceWith(messages) {
    const i18n = new I18nService();
    i18n._locale = 'zh-TW';
    i18n._messages = { 'zh-TW': messages };
    return i18n;
}

test('t() 以點號路徑取出巢狀翻譯，找不到時回傳 key', () => {
    const i18n = serviceWith({ app: { home: '首頁' } });
    assert.equal(i18n.t('app.home'), '首頁');
    assert.equal(i18n.t('app.missing'), 'app.missing');
    assert.equal(i18n.t('app'), 'app');
});

test('t() 取代 {{參數}}，0 與 false 照實輸出，缺少的參數輸出空字串', () => {
    const i18n = serviceWith({ cart: '共有 {{count}} 件，{{note}}{{missing}}' });
    assert.equal(i18n.t('cart', { count: 0, note: false }), '共有 0 件，false');
    assert.equal(i18n.t('cart', { count: 3, note: '' }), '共有 3 件，');
});
