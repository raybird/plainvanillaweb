/**
 * BaseComponent 2.1
 * 支援錯誤捕獲與優雅降級
 */
export class BaseComponent extends HTMLElement {
    constructor() {
        super();
        this._isRendered = false;
        this._hasError = false;
    }

    render() { return ''; }
    renderError(error) {
        return `<div style="padding:1rem; border:1px solid red; color:red;">
            <strong>組件錯誤:</strong> ${error.message}
        </div>`;
    }

    update() {
        try {
            if (this._hasError) return;
            this.innerHTML = this.render();
            if (!this._isRendered) {
                this.afterFirstRender();
                this._isRendered = true;
            }
        } catch (err) {
            this.handleComponentError(err);
        }
    }

    handleComponentError(err) {
        console.error(`[Component Error] ${this.tagName}:`, err);
        this._hasError = true;
        this.innerHTML = this.renderError(err);
    }

    afterFirstRender() {}
    connectedCallback() { this.update(); }
}
