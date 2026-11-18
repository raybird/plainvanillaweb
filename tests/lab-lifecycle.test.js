import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = new EventTarget();
globalThis.document = { baseURI: 'https://example.test/' };
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null }, configurable: true });
globalThis.HTMLElement = class {};
globalThis.customElements = { define() {} };

const { HistoryPage } = await import('../components/pages/lab/HistoryPage.js');
const { PerformancePage } = await import('../components/pages/lab/PerformancePage.js');
const { PWAAdvancedPage } = await import('../components/pages/lab/PWAAdvancedPage.js');
const { performanceService } = await import('../lib/performance-service.js');
const { pwaService } = await import('../lib/pwa-service.js');

function withoutDOM(Page) {
    const page = new Page();
    page._isRendered = true;
    page.scheduleUpdate = () => {};
    page.connectedCallback();
    return page;
}

test('History Lab commits the previous text so the first undo changes the text', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const page = withoutDOM(HistoryPage);
    const initial = page.state.documentText;
    page.handleInput({ target: { value: 'edited' } });
    t.mock.timers.tick(500);
    page.handleUndo();
    assert.equal(page.state.documentText, initial);
    page.handleRedo();
    assert.equal(page.state.documentText, 'edited');
    assert.equal(page.state.undoCount, 1);
    page.disconnectedCallback();
});

test('leaving History Lab cancels its pending edit timer', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const outgoing = withoutDOM(HistoryPage);
    outgoing.handleInput({ target: { value: 'edited' } });
    outgoing.disconnectedCallback();
    const incoming = withoutDOM(HistoryPage);
    t.mock.timers.tick(500);
    assert.equal(incoming.state.canUndo, false);
    incoming.disconnectedCallback();
});

test('Performance Lab removes its observer subscription when detached', () => {
    const page = withoutDOM(PerformancePage);
    const last = page.state.metrics.lcp;
    page.disconnectedCallback();
    performanceService.metrics.lcp = 2150;
    performanceService.emit('metric-update', { name: 'lcp', value: 2150 });
    assert.equal(page.state.metrics.lcp, last);
});

test('PWA Lab stops receiving progress when detached and listens again on reattach', () => {
    const page = withoutDOM(PWAAdvancedPage);
    pwaService.emit('fetch-progress', { percent: 25 });
    assert.equal(page.state.fetchProgress, 25);
    page.disconnectedCallback();
    pwaService.emit('fetch-progress', { percent: 40 });
    assert.equal(page.state.fetchProgress, 25);
    page.connectedCallback();
    pwaService.emit('fetch-progress', { percent: 75 });
    assert.equal(page.state.fetchProgress, 75);
    page.disconnectedCallback();
});
