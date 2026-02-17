import { html } from '../../lib/html.js';
import { BaseComponent } from '../../lib/base-component.js';

export class WorkerDemo extends BaseComponent {
    render() {
        return html`
            <h1>${this.tagName}</h1>
            <p>這是自動產生的 WorkerDemo 頁面。</p>
        `;
    }
}
customElements.define('page-workerdemo', WorkerDemo);
