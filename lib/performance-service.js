import { BaseService } from './base-service.js';

/** Document performance samples. Missing measurements remain null. */
export class PerformanceService extends BaseService {
    constructor({
        getEntriesByType = type => performance.getEntriesByType(type),
        Observer = globalThis.PerformanceObserver,
        eventTarget = globalThis.window
    } = {}) {
        super();
        this.metrics = {
            lcp: null,
            cls: null,
            fid: null, // First Input Delay，保留給既有 SDK 呼叫端
            interactionLatency: null, // Event Timing 中最慢的觀測值
            loadTime: null,
            domReady: null
        };
        this._initObservers(Observer);
        this._captureNavigationMetrics(getEntriesByType, eventTarget);
    }

    _initObservers(Observer) {
        const observe = (type, onEntries, options = {}) => {
            if (!Observer?.supportedEntryTypes?.includes(type)) return false;
            const observer = new Observer(list => onEntries(list.getEntries()));
            observer.observe({ type, buffered: true, ...options });
            return true;
        };

        observe('largest-contentful-paint', entries => {
            const last = entries.at(-1);
            if (last) this._updateMetric('lcp', Math.round(last.startTime));
        });

        let sessionStart = 0;
        let previousShiftTime = -Infinity;
        let sessionScore = 0;
        if (observe('layout-shift', entries => {
            let maxScore = this.metrics.cls;
            for (const entry of entries) {
                if (entry.hadRecentInput) continue;
                const time = entry.startTime;
                if (time - previousShiftTime >= 1000 || time - sessionStart >= 5000) {
                    sessionStart = time;
                    sessionScore = 0;
                }
                sessionScore += entry.value;
                maxScore = Math.max(maxScore, sessionScore);
                previousShiftTime = time;
            }
            this._updateMetric('cls', maxScore);
        })) {
            this.metrics.cls = 0;
        }

        observe('first-input', entries => {
            const entry = entries[0];
            if (entry) this._updateMetric('fid', Math.round(entry.processingStart - entry.startTime));
        });

        observe('event', entries => {
            let slowest = this.metrics.interactionLatency;
            for (const entry of entries) {
                if (!entry.interactionId) continue;
                slowest = Math.max(slowest ?? 0, entry.duration);
            }
            this._updateMetric('interactionLatency', slowest);
        }, { durationThreshold: 16 });
    }

    _updateMetric(name, value) {
        if (this.metrics[name] === value) return;
        this.metrics[name] = value;
        this.emit('metric-update', { name, value });
    }

    _captureNavigationMetrics(getEntriesByType, eventTarget) {
        const capture = () => {
            const nav = getEntriesByType('navigation')[0];
            const loadTime = nav?.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null;
            const domReady = nav?.domContentLoadedEventEnd > 0 ? Math.round(nav.domContentLoadedEventEnd) : null;
            if (this.metrics.loadTime === loadTime && this.metrics.domReady === domReady) return;
            Object.assign(this.metrics, { loadTime, domReady });
            this.emit('metric-update', { name: 'navigation', metrics: this.summary });
        };

        capture();
        // Navigation Timing 會等事件處理結束後才填入 end 時間。
        const captureAfterEvent = () => setTimeout(capture, 0);
        if (this.metrics.domReady === null) {
            eventTarget?.addEventListener('DOMContentLoaded', captureAfterEvent, { once: true });
        }
        if (this.metrics.loadTime === null) {
            eventTarget?.addEventListener('load', captureAfterEvent, { once: true });
        }
    }

    get summary() {
        return { ...this.metrics };
    }
}

export const performanceService = new PerformanceService();
