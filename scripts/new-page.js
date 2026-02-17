import fs from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
if (!name) {
    console.error('請提供頁面名稱，例如: node scripts/new-page.js ProductInfo');
    process.exit(1);
}

const className = name.charAt(0).toUpperCase() + name.slice(1);
const fileName = className + '.js';
const tagName = 'page-' + name.toLowerCase();
const targetPath = path.join('components', 'pages', fileName);

const template = `import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

export class ${className} extends BaseComponent {
    render() {
        return html\`
            <h1>\${this.tagName}</h1>
            <p>這是自動產生的 ${className} 頁面。</p>
        \`;
    }
}
customElements.define('${tagName}', ${className});
`;

if (fs.existsSync(targetPath)) {
    console.error('檔案已存在:', targetPath);
    process.exit(1);
}

fs.writeFileSync(targetPath, template);
console.log('✅ 成功建立組件:', targetPath);
console.log('💡 請記得在 index.js 匯入它，並在 App.js 設定路由。');
