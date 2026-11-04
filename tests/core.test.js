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
    'lib/version.js',
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

/**
 * lib/core.js 的公開 API。增減或改名時更新這份清單，並依語意化版本升版：
 * 移除或改名 → major，新增 → minor（見 CHANGELOG.md）。
 */
const CORE_EXPORTS = [
    'BaseComponent', 'BaseService', 'I18nService', 'RouteComponent', 'RouterService', 'Store',
    'SwitchComponent', 'VERSION', 'appStore', 'broadcastService', 'escapeHTML', 'html', 'i18n',
    'matchRoute', 'metaService', 'morph', 'registerRoute', 'router', 'unsafe',
].sort();

function exportedNames(file) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return [...source.matchAll(/^export\s*\{([^}]*)\}/gm)]
        .flatMap(([, list]) => list.split(','))
        .map((item) => item.trim().split(/\s+as\s+/).pop())
        .filter(Boolean)
        .sort();
}

test('core.js 的匯出清單符合公開 API（有變動時要升版）', () => {
    assert.deepEqual(exportedNames('lib/core.js'), CORE_EXPORTS);
});

test('VERSION 與 CHANGELOG.md 最新一節一致', async () => {
    const { VERSION } = await import('../lib/version.js');
    assert.match(VERSION, /^\d+\.\d+\.\d+$/);
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    const latest = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
    assert.equal(latest, VERSION, 'CHANGELOG.md 最新一節的版本應等於 lib/version.js 的 VERSION');
    assert.ok(changelog.includes(`@v${VERSION}/`), 'CHANGELOG.md 的固定版本引用範例應指向目前版本');
});

test('文件中固定版本的引用網址都指向目前版本', async () => {
    const { VERSION } = await import('../lib/version.js');
    const files = ['README.md', 'README_zh-TW.md', 'CHANGELOG.md',
        ...fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`)];
    const stale = files.flatMap((file) =>
        [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/plainvanillaweb@v(\d+\.\d+\.\d+)/g)]
            .filter(([, v]) => v !== VERSION)
            .map(([match]) => `${file}: ${match}`));
    assert.deepEqual(stale, [], `發版時要一併更新的固定版本網址（目前版本 ${VERSION}）`);
});
