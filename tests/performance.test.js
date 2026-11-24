import test from 'node:test';
import assert from 'node:assert/strict';

const { PerformanceService } = await import('../lib/performance-service.js');

test('late initialization reads completed navigation and distinguishes missing metrics', () => {
    const navigation = { loadEventEnd: 215.6, domContentLoadedEventEnd: 150.3 };
    const service = new PerformanceService({
        getEntriesByType: () => [navigation],
        Observer: null
    });
    assert.deepEqual(service.summary, {
        lcp: null, cls: null, fid: null, interactionLatency: null, loadTime: 216, domReady: 150
    });
});

test('early initialization updates after browser dispatch completes', async () => {
    const navigation = { loadEventEnd: 0, domContentLoadedEventEnd: 0 };
    const eventTarget = new EventTarget();
    const service = new PerformanceService({
        getEntriesByType: () => [navigation], Observer: null, eventTarget
    });
    assert.equal(service.summary.loadTime, null);
    const updated = new Promise(resolve => service.addEventListener('metric-update', resolve, { once: true }));
    eventTarget.dispatchEvent(new Event('load'));
    navigation.loadEventEnd = 216;
    navigation.domContentLoadedEventEnd = 150;
    await updated;
    assert.equal(service.summary.loadTime, 216);
    assert.equal(service.summary.domReady, 150);
});

test('layout shift reports the largest session and observed interactions exclude non-interactions', () => {
    const callbacks = new Map();
    class Observer {
        static supportedEntryTypes = ['layout-shift', 'event'];
        constructor(callback) { this.callback = callback; }
        observe({ type }) { callbacks.set(type, values => this.callback({ getEntries: () => values })); }
    }
    const service = new PerformanceService({ getEntriesByType: () => [], Observer });
    assert.equal(service.summary.cls, 0);
    callbacks.get('layout-shift')([
        { startTime: 100, value: 0.125 },
        { startTime: 1000, value: 0.25 },
        { startTime: 1200, value: 1, hadRecentInput: true },
        { startTime: 2000, value: 0.25 }
    ]);
    callbacks.get('event')([
        { interactionId: 0, duration: 500 },
        { interactionId: 1, duration: 48 },
        { interactionId: 2, duration: 64 }
    ]);
    assert.equal(service.summary.cls, 0.375);
    assert.equal(service.summary.interactionLatency, 64);
});
