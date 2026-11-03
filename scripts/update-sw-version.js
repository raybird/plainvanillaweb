#!/usr/bin/env node
/**
 * 依網站實際會載入的檔案內容計算版本雜湊，寫入：
 *   - sw.js 的 CACHE_NAME：sw.js 內容改變，瀏覽器才會安裝新的 Service Worker 並清掉舊快取
 *   - index.html 的 index.js?v=：讓 HTTP 快取失效
 *
 * 用法：
 *   node scripts/update-sw-version.js          更新版本號（commit 前執行）
 *   node scripts/update-sw-version.js --check  只檢查，版本號與檔案內容不符時以非零狀態結束（CI 使用）
 *
 * 雜湊範圍是 git 追蹤中的檔案（內容讀自工作目錄），新增檔案請先 git add 再執行。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const SW_PATH = 'sw.js';
const INDEX_PATH = 'index.html';

// 不會被網站載入的檔案：改動它們不需要讓使用者更新快取
const EXCLUDED_PREFIXES = ['.github/', '.agent/', 'scripts/', 'tests/'];
const EXCLUDED_FILES = new Set([SW_PATH, '.gitignore']);

const CACHE_NAME_RE = /const CACHE_NAME = '[^']*';/;
const INDEX_VERSION_RE = /(index\.js\?v=)[^"']*/;

function isServed(file) {
    if (EXCLUDED_FILES.has(file)) return false;
    if (EXCLUDED_PREFIXES.some(prefix => file.startsWith(prefix))) return false;
    if (!file.includes('/') && file.endsWith('.md')) return false; // 根目錄的 README、ROADMAP 等
    return true;
}

function computeVersion() {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
        .split('\0')
        .filter(Boolean)
        .filter(isServed)
        .filter(file => fs.existsSync(path.join(root, file)))
        .sort();

    const hash = crypto.createHash('sha256');
    for (const file of files) {
        let content = fs.readFileSync(path.join(root, file));
        if (file === INDEX_PATH) {
            // 版本字串本身不納入計算，否則寫入版本號會改變雜湊
            content = Buffer.from(content.toString('utf8').replace(INDEX_VERSION_RE, '$1'));
        }
        hash.update(file).update('\0').update(content).update('\0');
    }
    return { version: hash.digest('hex').slice(0, 12), fileCount: files.length };
}

function main() {
    const checkOnly = process.argv.includes('--check');
    const { version, fileCount } = computeVersion();
    const expectedCacheName = `const CACHE_NAME = 'vanilla-cache-${version}';`;

    const swPath = path.join(root, SW_PATH);
    const indexPath = path.join(root, INDEX_PATH);
    const sw = fs.readFileSync(swPath, 'utf8');
    const index = fs.readFileSync(indexPath, 'utf8');

    if (!CACHE_NAME_RE.test(sw)) throw new Error(`${SW_PATH} 找不到 CACHE_NAME 宣告`);
    if (!INDEX_VERSION_RE.test(index)) throw new Error(`${INDEX_PATH} 找不到 index.js?v= 版本字串`);

    const nextSw = sw.replace(CACHE_NAME_RE, expectedCacheName);
    const nextIndex = index.replace(INDEX_VERSION_RE, `$1${version}`);
    const stale = [nextSw !== sw && SW_PATH, nextIndex !== index && INDEX_PATH].filter(Boolean);

    if (checkOnly) {
        if (stale.length) {
            console.error(`❌ 版本號與檔案內容不符（${stale.join('、')}），預期版本 ${version}。`);
            console.error('   請執行 node scripts/update-sw-version.js 並一併提交。');
            process.exit(1);
        }
        console.log(`✅ 版本號正確：${version}（${fileCount} 個檔案）`);
        return;
    }

    if (!stale.length) {
        console.log(`版本號已是最新：${version}（${fileCount} 個檔案）`);
        return;
    }
    fs.writeFileSync(swPath, nextSw);
    fs.writeFileSync(indexPath, nextIndex);
    console.log(`已更新版本號為 ${version}（${fileCount} 個檔案）：${stale.join('、')}`);
}

main();
