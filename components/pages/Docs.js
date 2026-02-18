import { html, unsafe } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';
import { docService } from '../../lib/doc-service.js';

export class Documentation extends BaseComponent {
    constructor() {
        super();
        this.state = { content: '請選擇一個教學單元', currentDoc: null };
    }

    async loadDoc(docName) {
        this.state.content = '正在載入文件...';
        this.update();
        const htmlContent = await docService.getDoc(docName);
        this.state.content = htmlContent;
        this.state.currentDoc = docName;
        this.update();
    }

    render() {
        const docs = [
            { id: 'router', title: '原生路由與 SEO' },
            { id: 'state-management', title: '狀態管理與 IDB' },
            { id: 'pwa', title: 'PWA 離線技術' },
            { id: 'i18n', title: '原生國際化實作' },
            { id: 'api-fetching', title: 'API 非同步處理' },
            { id: 'storage-persistence', title: '儲存空間與持久化' },
            { id: 'testing-strategy', title: '原生單元測試策略' },
            { id: 'file-system-access', title: '原生檔案系統存取' }
        ];

        return html`
            <div style="display: flex; gap: 2rem; align-items: flex-start;">
                <!-- 左側導覽 -->
                <nav style="width: 250px; background: var(--nav-bg); padding: 1rem; border-radius: 8px; position: sticky; top: 1rem;">
                    <h3 style="margin-top: 0;">📚 技術手冊</h3>
                    <ul style="list-style: none; padding: 0;">
                        ${docs.map(d => html`
                            <li style="margin-bottom: 0.5rem;">
                                <button onclick="this.closest('page-docs').loadDoc('${d.id}')" 
                                        style="width: 100%; text-align: left; background: none; border: none; color: ${this.state.currentDoc === d.id ? 'var(--primary-color)' : 'inherit'}; font-weight: ${this.state.currentDoc === d.id ? 'bold' : 'normal'}; cursor: pointer; padding: 0.5rem; border-radius: 4px;">
                                    ${d.title}
                                </button>
                            </li>
                        `)}
                    </ul>
                </nav>

                <!-- 右側內容 -->
                <article style="flex: 1; padding: 2rem; border: 1px solid #eee; border-radius: 12px; background: white; min-height: 60vh;">
                    ${unsafe(this.state.content)}
                </article>
            </div>
        `;
    }
}
customElements.define('page-docs', Documentation);
