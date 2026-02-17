import { BaseService } from './base-service.js';

/**
 * PerformanceService - 原生性能監控服務
 * 利用 PerformanceObserver 監控 Web Vitals 與頁面加載指標。
 */
export class PerformanceService extends BaseService {
    constructor() {
        super();
        this.metrics = {
            lcp: 0, // Largest Contentful Paint
            cls: 0, // Cumulative Layout Shift
            fid: 0, // First Input Delay
            loadTime: 0, // 總體加載時間
            domReady: 0  // DOM 內容載入時間
        };
        this._initObservers();
        this._captureNavigationMetrics();
    }

    _initObservers() {
        // 1. LCP (Largest Contentful Paint)
        try {
            const lcpObserver = new PerformanceObserver((entryList) => {
                const entries = entryList.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.metrics.lcp = Math.round(lastEntry.startTime);
                this.emit('metric-update', { name: 'lcp', value: this.metrics.lcp });
            });
            lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) {}

        // 2. CLS (Cumulative Layout Shift)
        try {
            const clsObserver = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    if (!entry.hadRecentInput) {
                        this.metrics.cls += entry.value;
                        this.emit('metric-update', { name: 'cls', value: this.metrics.cls });
                    }
                }
            });
            clsObserver.observe({ type: 'layout-shift', buffered: true });
        } catch (e) {}

        // 3. FID (First Input Delay)
        try {
            const fidObserver = new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    this.metrics.fid = Math.round(entry.processingStart - entry.startTime);
                    this.emit('metric-update', { name: 'fid', value: this.metrics.fid });
                }
            });
            fidObserver.observe({ type: 'first-input', buffered: true });
        } catch (e) {}
    }

    _captureNavigationMetrics() {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const nav = performance.getEntriesByType('navigation')[0];
                if (nav) {
                    this.metrics.loadTime = Math.round(nav.loadEventEnd);
                    this.metrics.domReady = Math.round(nav.domContentLoadedEventEnd);
                    this.emit('metric-update', { name: 'navigation', metrics: this.metrics });
                }
            }, 0);
        });
    }

    get summary() {
        return { ...this.metrics };
    }
}

export const performanceService = new PerformanceService();
