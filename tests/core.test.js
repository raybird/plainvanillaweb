import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 核心入口允許牽連到的檔案；新增核心模組時同步更新，展示用 service 不應出現在這裡 */
const CORE_FILES = [
    'lib/core.js',
    'lib/html.js',
    'lib/base-component.js',
    'lib/morph.js',
    'lib/base-service.js',
    'lib/store.js',
    'lib/broadcast-service.js',
    'lib/i18n-service.js',
    'lib/meta-service.js',
    'lib/router.js',
    'components/route/route.js',
    'components/route/switch.js',
].sort();

/** 以靜態 import／export from 走訪相依圖（動態 import() 不算，核心不應依賴它載入展示程式） */
function collectGraph(entry) {
    const seen = new Set();
    const visit = (file) => {
        if (seen.has(file)) return;
        seen.add(file);
        const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const [, spec] of source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/gms)) {
            if (spec.startsWith('.')) visit(path.relative(ROOT, path.resolve(ROOT, path.dirname(file), spec)));
        }
        for (const [, spec] of source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) {
            if (spec.startsWith('.')) visit(path.relative(ROOT, path.resolve(ROOT, path.dirname(file), spec)));
        }
    };
    visit(entry);
    return [...seen].sort();
}

test('核心入口只牽連核心檔案，不會載入展示用 service', () => {
    assert.deepEqual(collectGraph('lib/core.js'), CORE_FILES);
});

test('核心檔案不依賴 auth-service（登入判斷由 router.authGuard 注入）', () => {
    assert.ok(!collectGraph('lib/core.js').includes('lib/auth-service.js'));
});
