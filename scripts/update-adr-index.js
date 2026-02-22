#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const decisionsDir = path.join(__dirname, '../docs/decisions');
const readmePath = path.join(decisionsDir, 'README.md');

// 讀取所有 .md 檔案，排除 README.md
const files = fs.readdirSync(decisionsDir)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .sort();

let tableRows = [];

files.forEach(file => {
    const content = fs.readFileSync(path.join(decisionsDir, file), 'utf8');
    const firstLine = content.split('\n').find(line => line.trim().startsWith('# '));

    let id = file.replace(/\D/g, '').substring(0, 4); // 找出檔名中的數字 0001
    let title = file.replace('.md', '');

    if (firstLine) {
        // 解析標題，例如 "# ADR 0022: xxx" 或 "# xxx"
        const match = firstLine.match(/#\s*(ADR\s*\d+:\s*)?(.*)/i);
        if (match && match[2]) {
            title = match[2].trim();
        }
    }

    // 如果檔名包含數字開頭，但正規表示式沒抓到也可以 fallback
    if (!id || id.length === 0) {
        const matchId = file.match(/^(\d+)-/);
        if (matchId) id = matchId[1];
        else id = '----';
    }

    tableRows.push(`| ${id} | [${title}](./${file}) | [已實作] |`);
});

const readmeContent = `# 🏗️ 原生架構決策 (ADR) 索引

本文檔彙整了本專案演進過程中的關鍵技術決策紀錄 (Architecture Decision Records)。

## 索引表

| ID | 標題 | 狀態 |
|----|------|------|
${tableRows.join('\n')}

---
*詳細內容請參閱 \`docs/decisions/*.md\`。*
*此檔案由 \`scripts/update-adr-index.js\` 自動生成。*
`;

fs.writeFileSync(readmePath, readmeContent, 'utf8');
console.log(`✅ 已成功更新 ${files.length} 份 ADR 索引至 docs/decisions/README.md`);
