export class RouteComponent extends HTMLElement {
    constructor() { super(); this.style.display = 'contents'; this.update = this.update.bind(this); }
    #isActive = false;
    get isActive() { return this.#isActive; }
    connectedCallback() { this.classList.toggle('route', true); window.addEventListener('hashchange', this.update); this.update(); }
    disconnectedCallback() { window.removeEventListener('hashchange', this.update); }
    static get observedAttributes() { return ['path', 'exact']; }
    attributeChangedCallback() { this.update(); }
    update() {
        const path = this.getAttribute('path') || '';
        const exact = this.hasAttribute('exact');
        const matches = this.#matchesRoute(path, exact);
        this.#isActive = !!matches;
        this.style.display = this.#isActive ? 'contents' : 'none';
    }
    #matchesRoute(path, exact) {
        if (path === '*') {
            const active = Array.from(this.parentNode.querySelectorAll('.route')).filter(r => r.isActive && r !== this);
            return active.length ? null : ['*'];
        }
        const regex = new RegExp(`^#${path.replace(/\//g, '\\/')}${exact ? '$' : ''}`, 'i');
        return regex.exec(window.location.hash || '#/');
    }
}
export const registerRoute = () => customElements.define('x-route', RouteComponent);
