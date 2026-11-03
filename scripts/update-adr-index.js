#!/usr/bin/env node
/**
 * 依 docs/decisions/*.md 重新產生 ADR 索引 docs/decisions/README.md，並檢查：
 *   - 編號不可重複（ADR 編號一經使用就不再變動，重複時請改用下一個未使用的編號）
 *   - 標題中的 "ADR 0000" 編號必須與檔名一致
 *
 * 用法：
 *   node scripts/update-adr-index.js          重新產生索引
 *   node scripts/update-adr-index.js --check  只檢查，索引過期或編號有問題時以非零狀態結束（CI 使用）
 */

const fs = require('fs');
const path = require('path');

const decisionsDir = path.join(__dirname, '../docs/decisions');
const readmePath = path.join(decisionsDir, 'README.md');

function readAdrs() {
    return fs.readdirSync(decisionsDir)
        .filter(f => /^\d{4}-.+\.md$/.test(f))
        .sort()
        .map(file => {
            const content = fs.readFileSync(path.join(decisionsDir, file), 'utf8');
            const lines = content.split('\n');
            const id = file.slice(0, 4);

            // 解析標題，例如 "# ADR 0022: xxx" 或 "# xxx"
            const heading = lines.find(line => line.trim().startsWith('# ')) || '';
            const match = heading.match(/^#\s*(?:ADR\s*(\d+)\s*[:：]\s*)?(.*)/i);
            const headingId = match && match[1] ? match[1].padStart(4, '0') : null;
            const title = (match && match[2].trim()) || file.replace('.md', '');

            // 狀態：只區分「已取代」與其他（既有 ADR 的狀態寫法不一，其餘一律視為已實作）
            const statusIndex = lines.findIndex(line => /^##\s*(狀態|Status)(\s|$)/i.test(line.trim()));
            const statusLine = statusIndex === -1 ? '' : (lines.slice(statusIndex + 1).find(line => line.trim()) || '');
            const status = /Superseded|已被取代|已取代/i.test(statusLine) ? '已取代' : '已實作';

            return { file, id, headingId, title, status };
        });
}

function validate(adrs) {
    const errors = [];
    const byId = new Map();
    for (const adr of adrs) {
        byId.set(adr.id, [...(byId.get(adr.id) || []), adr.file]);
        if (adr.headingId && adr.headingId !== adr.id) {
            errors.push(`${adr.file}：標題寫的是 ADR ${adr.headingId}，與檔名編號 ${adr.id} 不符`);
        }
    }
    for (const [id, files] of byId) {
        if (files.length > 1) errors.push(`編號 ${id} 重複：${files.join('、')}`);
    }
    return errors;
}

function unusedIds(adrs) {
    const used = new Set(adrs.map(a => Number(a.id)));
    const max = Math.max(...used);
    const unused = [];
    for (let n = 1; n <= max; n++) if (!used.has(n)) unused.push(String(n).padStart(4, '0'));
    return unused;
}

function render(adrs) {
    const rows = adrs.map(a => `| ${a.id} | [${a.title}](./${a.file}) | [${a.status}] |`);
    const unused = unusedIds(adrs);
    return `# 🏗️ 原生架構決策 (ADR) 索引

本文檔彙整了本專案演進過程中的關鍵技術決策紀錄 (Architecture Decision Records)。

## 索引表

| ID | 標題 | 狀態 |
|----|------|------|
${rows.join('\n')}

---
${unused.length ? `*未使用的編號：${unused.join('、')}（保留空號，不回填）。新增 ADR 請使用 ${String(Math.max(...adrs.map(a => Number(a.id))) + 1).padStart(4, '0')}。*\n` : ''}*詳細內容請參閱 \`docs/decisions/*.md\`。*
*此檔案由 \`scripts/update-adr-index.js\` 自動生成。*
`;
}

function main() {
    const checkOnly = process.argv.includes('--check');
    const adrs = readAdrs();
    const errors = validate(adrs);
    if (errors.length) {
        errors.forEach(e => console.error(`❌ ${e}`));
        process.exit(1);
    }

    const content = render(adrs);
    const current = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';

    if (checkOnly) {
        if (content !== current) {
            console.error('❌ docs/decisions/README.md 不是最新，請執行 node scripts/update-adr-index.js 並一併提交。');
            process.exit(1);
        }
        console.log(`✅ ADR 索引正確（${adrs.length} 份）`);
        return;
    }

    fs.writeFileSync(readmePath, content, 'utf8');
    console.log(`✅ 已成功更新 ${adrs.length} 份 ADR 索引至 docs/decisions/README.md`);
}

main();
