import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { QR_BYTE_CAPACITY, QR_MAX_VERSION, encodeQr, qrToSvg } from '../components/pages/solutions/pos-v2/qr-code.js';

/**
 * 參考向量：[內容, 版本, 遮罩, 模組矩陣的 SHA-256]。
 * 以 segno 1.6.6（error='m'、mode='byte'、encoding='utf-8'、指定遮罩）產生，2026-11-26。
 * segno 在資料已對齊碼字邊界時會多補 8 個 0 位元（ISO/IEC 18004 7.4.10 應為補到邊界即止），
 * 產生向量時把它的 write_padding_bits 換成 `(8 - length % 8) % 8`；其餘照 segno 原樣。
 * 矩陣轉成每列一行的 0／1 字串（不含留白），以 '\n' 連接後取 SHA-256。
 */
/** 正式長度的櫃檯訂單 QR Code 網址（帶 ns、Quick Tunnel 信令、訂單 id 與完整查詢 token） */
const TRACK_URL = 'https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/track?ns=demo-2&room=AbCdEfGhIjKlMnOpQrStUv&sig=wss%3A%2F%2Fabcd-efgh-ijkl-mnop.trycloudflare.com&o=7563381a-0d3d-43e1-abb2-25ad53026ba1&k=Zz9-Yy8_Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp-Oo_NnMmL';

const VECTORS = [
    ['HELLO', 1, 0, 'b664c5ebcc2451fb6630e63f516abd72b3cdfbf16b9ceb0d92d226f6a6d0cde0'],
    ['桌號 A1', 1, 1, '6a92fd8938bb6c1995120286a7df33fe03dbf6edbccd86469c73693ded56e431'],
    ['https://raybird.github.io/plainvanillaweb/', 3, 2, '5717bdb9e8a96180ba2c65a7cb699ea14210d6f594709a3dd3a63c392f41776a'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/table?room=AbCdEfGhIjKlMnOpQrStUv&t=A1', 6, 0, '8a3934ac04b3f0877490716acc0ef5f06dbca3788a3f63bd34675634ec2c1b91'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/table?room=AbCdEfGhIjKlMnOpQrStUv&t=A1', 6, 1, '6a35714c63e5bd09974c6cf78e150f9206182ce844531257f7b3a4cb30b92721'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/table?room=AbCdEfGhIjKlMnOpQrStUv&t=A1', 6, 2, '3c8c8830de955b910b43013f2a33151743fa77ee9df4a9870fc5b8da204f1455'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/table?room=AbCdEfGhIjKlMnOpQrStUv&t=A1', 6, 3, '90f74081e11a1ea8ec15b50b6a36859e9df6220a11f5dc7fa40fee037759261b'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/table?room=AbCdEfGhIjKlMnOpQrStUv&t=A1', 6, 4, 'c045f905880dc7f84d1b188a417adedf6f6188721e16007ef8d76cdc4dfd8da2'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/table?room=AbCdEfGhIjKlMnOpQrStUv&t=A1', 6, 5, 'd8fc7074ebb843cd13f1e76063f2167ff9675f47a189bb7d61194b5faaab6461'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/table?room=AbCdEfGhIjKlMnOpQrStUv&t=A1', 6, 6, '082b32eaf5384c2f76f961f2cbc613e4a10950103f8627641287d74c47921d4f'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/table?room=AbCdEfGhIjKlMnOpQrStUv&t=A1', 6, 7, '68e8e23f262262122eaef9cbac5bf0cc9459452af83d71e8cc5a1b3095b730c2'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/join?room=AbCdEfGhIjKlMnOpQrStUv&sig=wss%3A%2F%2Fexample-tunnel.trycloudflare.com&pair=Zz9-Yy8_Xx7Ww6Vv5Uu4Tt', 9, 0, 'aad6c15621bc58df1276478fdd66fdfe8435691f0b754fd1e448df464b26121a'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/join?room=AbCdEfGhIjKlMnOpQrStUv&sig=wss%3A%2F%2Fexample-tunnel.trycloudflare.com&pair=Zz9-Yy8_Xx7Ww6Vv5Uu4Tt', 9, 1, '808a3267a92674cd1ecb71013f1e07bf7dd832dbe99ead0cd7892020d229c12d'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/join?room=AbCdEfGhIjKlMnOpQrStUv&sig=wss%3A%2F%2Fexample-tunnel.trycloudflare.com&pair=Zz9-Yy8_Xx7Ww6Vv5Uu4Tt', 9, 2, 'e23907c91fca8d46a8870b50594996907c1c4704e355cb424810b426e8fa5bbd'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/join?room=AbCdEfGhIjKlMnOpQrStUv&sig=wss%3A%2F%2Fexample-tunnel.trycloudflare.com&pair=Zz9-Yy8_Xx7Ww6Vv5Uu4Tt', 9, 3, '79ddbdcaad8e44a138f17010af5562410f8a91b0a287908dda853f23060e8c52'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/join?room=AbCdEfGhIjKlMnOpQrStUv&sig=wss%3A%2F%2Fexample-tunnel.trycloudflare.com&pair=Zz9-Yy8_Xx7Ww6Vv5Uu4Tt', 9, 4, '74a6d5a5b385faa2d5bf348caeb283cd99f3976189248058e19d6a1a4dfff30d'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/join?room=AbCdEfGhIjKlMnOpQrStUv&sig=wss%3A%2F%2Fexample-tunnel.trycloudflare.com&pair=Zz9-Yy8_Xx7Ww6Vv5Uu4Tt', 9, 5, '02bcb8141efca502e873fd46af0c609f4a00b94490a0e99d33f7512b76fce62d'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/join?room=AbCdEfGhIjKlMnOpQrStUv&sig=wss%3A%2F%2Fexample-tunnel.trycloudflare.com&pair=Zz9-Yy8_Xx7Ww6Vv5Uu4Tt', 9, 6, '59a892a49ef784125b487ebffcc7504387c1c48ebd81dd3605e5fc30528036b0'],
    ['https://raybird.github.io/plainvanillaweb/#/solutions/pos-v2/join?room=AbCdEfGhIjKlMnOpQrStUv&sig=wss%3A%2F%2Fexample-tunnel.trycloudflare.com&pair=Zz9-Yy8_Xx7Ww6Vv5Uu4Tt', 9, 7, '07c84706dded411d7ed0e45e577bcebf88b3fb865309435dcf576c250691d100'],
    ['x'.repeat(213), 10, 5, '919daa13cee1a6ec71b5964fc76a137512d71766b7cbaa03b563430bf94034b8'],
    ['a'.repeat(14), 1, 6, 'b2d48ee35b3594d120dc12b6ee7d8a11fc33fc35d8af870ae7f06e796b536bcd'],
    ['a'.repeat(15), 2, 7, '860c81081bc2672b2837a08f4f79c6f0ca25da6741d9a1d44d3d815cf5902f42'],
    ['a'.repeat(26), 2, 0, 'bec3007287eb2865f44a653cc91e54118fdf911859b888d8d16603a00d0b2fd1'],
    ['a'.repeat(27), 3, 1, '1d2f63b94bfe4300fbd00836dfafa892998c8b2002829afab9aba2112269d56a'],
    ['a'.repeat(42), 3, 2, 'd58dfd4a15246aa7b05d815aa7622cbc81b20e3d72554dae5d35c4fb1acdac83'],
    ['a'.repeat(62), 4, 3, '46d66ed746cec722cd15d90899db35d47fc079da79dea133d676d1c23455e2b8'],
    ['a'.repeat(84), 5, 4, 'f9e9ea4b27274331ada057370852f1c15e785467853fe6b8a51c0cad4e19e8d8'],
    ['a'.repeat(106), 6, 5, 'edcdb73fd6cb663f451a2ea430c6e7d5ffb8fd21f58e9d721d10baf6439921f6'],
    ['a'.repeat(122), 7, 6, '6ac1f12a53b176bfeaa600cb98edf1ffe76354d566542d7fc53e6ad5b4d99804'],
    ['a'.repeat(152), 8, 7, '57a31dbc38ceeac52702fc5963777d2b06f6367d52007c4a05778262942a4d52'],
    ['a'.repeat(180), 9, 0, '10544625b001c3005211a459102f0034f538ece84219c5dab8f8384abfa59636'],
    // 版本 11–15（審查 M2），2026-11-27 以同樣方式產生：正式長度的櫃檯訂單網址八種遮罩，加上各版本容量的邊界
    [TRACK_URL, 11, 0, 'dbed33144a7e925f271cd74935ef103491164b5cb39cb9ce9eb9494ce518ac2d'],
    [TRACK_URL, 11, 1, 'c7fa9b5836103678d134b271ab8511f1dea8e08945348e5c707b334bf19091ae'],
    [TRACK_URL, 11, 2, '1660cc0eaa276b53738d3df69dda09d51190c46a38e4e5e6346d0b04824cf29b'],
    [TRACK_URL, 11, 3, '43c5b70b47128584d2973de0187e85aff6526470284b98af947eed70ba1e9189'],
    [TRACK_URL, 11, 4, '98aba02cf8c28758e92fea2c74238a50d5298fc9d631e797a66079e77af1b503'],
    [TRACK_URL, 11, 5, '5fa94d7f39fec61bda8adef4e0452c3d068a3aac716bfd2218502eacc9487936'],
    [TRACK_URL, 11, 6, 'cc507cebcdb9f10f137de7e40939621f5f8a7dfa1e1ef6a132f8e7d061164abe'],
    [TRACK_URL, 11, 7, '8ebb3fecc3f200e82da4c709c893cde915db1919b72b8779138d0d61c722d46a'],
    ['b'.repeat(214), 11, 0, '1f1be8ef542132be156303326c496d97348a970091357635172ecbda782cbe01'],
    ['b'.repeat(251), 11, 1, 'e88bb77794183ce3bbf6e976dae6b64e8bf963f3b13fd6c72611f58942b116c6'],
    ['b'.repeat(252), 12, 2, '69cf499e589b22d05149e6c8f668b2e730597fb9412bd5559a75c3d219d3af03'],
    ['b'.repeat(287), 12, 3, '375285fadcf515746210a0ab845a8c98d76774f20637d1594eaa91b43942c841'],
    ['b'.repeat(288), 13, 4, 'cf4a59ef9be21de3c03588e886b995f4b48bb304b78f2e502303c98c53371e5e'],
    ['b'.repeat(331), 13, 5, 'c96ac0435980d0e38ce2265e96fde1ffb4e754a722748945467eb34946b2be10'],
    ['b'.repeat(332), 14, 6, 'b2a53dfdf472c3b370351e63b400fd3b7212cecdb3a139504988311084e5bb0a'],
    ['b'.repeat(362), 14, 7, '76b749f230904785c752b325ec39b02efe847e530efc006b754282b6dedcd21e'],
    ['b'.repeat(363), 15, 0, '617d91a07364901dfeb061b88bc7e3862b180538473fb84f86628e7a85ffea95'],
    ['b'.repeat(412), 15, 1, '4ae9381fd8f0ae7a08ee70f257c92d69e91e49e00510ca05e4b535a26520e00e'],
];

const digest = (qr) => createHash('sha256').update(qr.modules.map((row) => row.map((dark) => (dark ? '1' : '0')).join('')).join('\n')).digest('hex');

test('指定遮罩時，每個版本與遮罩的模組矩陣都和參考實作一致', () => {
    assert.deepEqual([...new Set(VECTORS.map(([, version]) => version))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.deepEqual([...new Set(VECTORS.map(([, , mask]) => mask))].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
    for (const [text, version, mask, sha256] of VECTORS) {
        const qr = encodeQr(text, { mask });
        assert.equal(qr.version, version, `${text.slice(0, 20)} 的版本`);
        assert.equal(qr.size, version * 4 + 17);
        assert.equal(qr.mask, mask);
        assert.equal(digest(qr), sha256, `${text.slice(0, 20)}（版本 ${version}、遮罩 ${mask}）的模組矩陣`);
    }
});

test('自動選遮罩：結果等於以選定遮罩產生的矩陣', () => {
    for (const text of new Set(VECTORS.map(([t]) => t))) {
        const auto = encodeQr(text);
        assert.ok(Number.isInteger(auto.mask) && auto.mask >= 0 && auto.mask <= 7);
        assert.equal(digest(auto), digest(encodeQr(text, { mask: auto.mask })));
    }
});

test('版本依 UTF-8 長度選最小的；超過版本 15 的容量報錯', () => {
    assert.deepEqual(QR_BYTE_CAPACITY.slice(1), [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412]);
    assert.equal(QR_MAX_VERSION, 15);
    assert.equal(encodeQr('a'.repeat(14)).version, 1);
    assert.equal(encodeQr('a'.repeat(15)).version, 2);
    assert.equal(encodeQr('桌'.repeat(4)).version, 1, '12 bytes');
    assert.equal(encodeQr('桌'.repeat(5)).version, 2, '15 bytes');
    assert.equal(encodeQr('a'.repeat(213)).version, 10);
    assert.equal(encodeQr('a'.repeat(214)).version, 11);
    assert.equal(encodeQr('a'.repeat(412)).version, 15);
    assert.throws(() => encodeQr('a'.repeat(413)), RangeError);
    assert.equal(encodeQr('').version, 1);
});

test('參數檢查', () => {
    assert.throws(() => encodeQr(123), TypeError);
    assert.throws(() => encodeQr('x', { mask: 8 }), RangeError);
    assert.throws(() => encodeQr('x', { mask: 1.5 }), RangeError);
    assert.throws(() => qrToSvg(encodeQr('x'), { border: -1 }), RangeError);
});

test('qrToSvg：viewBox 含留白，深色模組以水平線段畫出，只用 currentColor', () => {
    const qr = encodeQr('HELLO', { mask: 0 });
    const svg = qrToSvg(qr);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><path fill="currentColor" d="[Mhvz0-9 -]+"\/><\/svg>$/);
    assert.match(qrToSvg(qr, { border: 0 }), /viewBox="0 0 21 21"/);
    // 畫出的面積等於深色模組數
    const area = [...svg.matchAll(/h(\d+)v1h-\d+z/g)].reduce((sum, [, width]) => sum + Number(width), 0);
    assert.equal(area, qr.modules.flat().filter(Boolean).length);
    // 左上尋像圖形的第一列：7 個連續深色模組，從留白後的 (4,4) 開始
    assert.ok(svg.includes('M4 4h7v1h-7z'));
});
