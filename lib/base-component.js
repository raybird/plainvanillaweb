/**
 * BaseComponent
 * 提供極簡的 Web Component 封裝，維持原生精神。
 */
export class BaseComponent extends HTMLElement {
    constructor() {
        super();
        this._isRendered = false;
    }

    /**
     * 渲染邏輯，子類別必須實作
     */
    render() {
        return '';
    }

    /**
     * 觸發 UI 更新
     */
    update() {
        this.innerHTML = this.render();
        if (!this._isRendered) {
            this.afterFirstRender();
            this._isRendered = true;
        }
    }

    /**
     * 首次渲染後的鉤子 (類似 connectedCallback 的補充)
     */
    afterFirstRender() {}

    connectedCallback() {
        this.update();
    }
}
