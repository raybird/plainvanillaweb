/**
 * POS v2 文件（#16 A10）：自架信令的指令要和主機頁顯示的一樣，SHA-256 要和實際檔案一樣。
 * 改了 server/ 的檔案或升版時，這裡會提醒同步 docs/solutions/pos-v2.md 與 pos-v2.en.md。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { VERSION } from '../lib/version.js';
import { selfHostCommands } from '../components/pages/solutions/pos-v2/signaling-settings.js';

const root = new URL('../', import.meta.url);
const DOCS = ['docs/solutions/pos-v2.md', 'docs/solutions/pos-v2.en.md'];
const SERVER_FILES = ['server/signaling.mjs', 'server/cloudflare/worker.js', 'server/cloudflare/wrangler.jsonc'];

const read = (path) => readFile(new URL(path, root), 'utf8');

for (const doc of DOCS) {
    test(`${doc}：兩組自架指令和主機頁顯示的一樣`, async () => {
        const text = await read(doc);
        const commands = selfHostCommands(VERSION);
        for (const [name, block] of Object.entries(commands)) {
            assert.ok(text.includes(`\`\`\`bash\n${block}\n\`\`\``), `${name} 指令應和 selfHostCommands(VERSION) 相同：\n${block}`);
        }
        assert.ok(text.includes(`\`v${VERSION}\``), `應寫明檔案的版本 v${VERSION}`);
    });

    test(`${doc}：SHA-256 和實際檔案一樣`, async () => {
        const text = await read(doc);
        for (const file of SERVER_FILES) {
            const digest = createHash('sha256').update(await readFile(new URL(file, root))).digest('hex');
            assert.ok(text.includes(`| \`${file}\` | \`${digest}\` |`), `${file} 的 SHA-256 應為 ${digest}`);
        }
    });
}
