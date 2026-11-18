import test from 'node:test';
import assert from 'node:assert/strict';
import { SerialService } from '../lib/serial-service.js';

function override(t, object, key, value) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { value, configurable: true });
    t.after(() => descriptor ? Object.defineProperty(object, key, descriptor) : delete object[key]);
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('Serial disconnect waits until pending reads release the port lock', async (t) => {
    const service = new SerialService();
    let finishCancel;
    let cancelled = false;
    const readable = new ReadableStream({
        cancel: () => new Promise(resolve => {
            cancelled = true;
            finishCancel = resolve;
        })
    });
    let portClosed = false;
    const port = {
        get readable() { return cancelled ? null : readable; },
        open: async () => {},
        close: async () => {
            assert.equal(readable.locked, false);
            portClosed = true;
        }
    };
    t.mock.method(console, 'log', () => {});
    override(t, navigator, 'serial', { requestPort: async () => port });
    service.isSupported = true;

    await service.connect();
    const closed = service.disconnect();
    closed.catch(() => {});
    await nextTurn();
    assert.equal(portClosed, false);
    finishCancel();
    await closed;
    assert.equal(portClosed, true);
    assert.equal(service.port, null);
});

test('Serial releases the writer after a failed send', async () => {
    const service = new SerialService();
    const writable = new WritableStream({ write() { throw new Error('send failed'); } });
    service.port = { writable };
    await assert.rejects(service.write('test'), /send failed/);
    assert.equal(writable.locked, false);
});

const { StreamProcessorService } = await import('../lib/stream-processor-service.js');

function mockMedia(t, source, sink = {}) {
    const readable = new ReadableStream(source);
    const writable = new WritableStream(sink);
    override(t, globalThis, 'MediaStreamTrackProcessor', class { readable = readable; });
    override(t, globalThis, 'MediaStreamTrackGenerator', class { writable = writable; stop() {} });
    override(t, globalThis, 'MediaStream', class { constructor(tracks) { this.tracks = tracks; } });
    return { readable, writable };
}

test('frame processing requires both processor and generator', (t) => {
    override(t, globalThis, 'MediaStreamTrackProcessor', class {});
    assert.equal(new StreamProcessorService().isSupported, false);
});

test('stopping frame processing cancels a pending read and releases both locks', async (t) => {
    let cancelled = false;
    let aborted = false;
    const { readable, writable } = mockMedia(t, { cancel: () => { cancelled = true; } }, {
        abort: () => { aborted = true; }
    });
    const service = new StreamProcessorService();
    service.process({}, frame => frame);
    await service.stop();

    assert.equal(cancelled, true);
    assert.equal(aborted, true);
    assert.equal(readable.locked, false);
    assert.equal(writable.locked, false);
});

test('stopping during an async transform releases the input and replacement without writing', async (t) => {
    let received;
    const entered = new Promise(resolve => { received = resolve; });
    let finishTransform;
    const transformed = new Promise(resolve => { finishTransform = resolve; });
    let inputClosed = 0;
    let replacementClosed = 0;
    const input = { close: () => { inputClosed++; } };
    const replacement = { close: () => { replacementClosed++; } };
    const writes = [];
    mockMedia(t, { start: controller => controller.enqueue(input) }, { write: frame => writes.push(frame) });
    const service = new StreamProcessorService();
    service.process({}, () => { received(); return transformed; });
    await entered;
    const stopped = service.stop();
    finishTransform(replacement);
    await stopped;

    assert.deepEqual(writes, []);
    assert.equal(inputClosed, 1);
    assert.equal(replacementClosed, 1);
});

test('late camera permission does not leave a track running after the page stops', async (t) => {
    override(t, globalThis, 'document', { baseURI: 'http://localhost/' });
    override(t, globalThis, 'localStorage', { getItem: () => null });
    override(t, globalThis, 'HTMLElement', class {
        querySelector() { return null; }
    });
    override(t, globalThis, 'customElements', { define() {} });
    override(t, globalThis, 'requestAnimationFrame', () => 1);

    const { MediaPage } = await import('../components/pages/lab/MediaPage.js');
    const page = new MediaPage();
    let grantPermission;
    page._requestCameraStream = () => new Promise(resolve => { grantPermission = resolve; });
    let stopped = false;
    const track = { stop() { stopped = true; }, addEventListener() {}, removeEventListener() {} };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };

    const starting = page.toggleLiveFilter();
    page.stopLiveStream();
    grantPermission(stream);
    await starting;

    assert.equal(stopped, true);
    assert.equal(page.state.isProcessingStream, false);
});

test('Serial decodes a character split across reads and waits for an in-flight write', async (t) => {
    const service = new SerialService();
    const bytes = new TextEncoder().encode('嗨');
    const readable = new ReadableStream({
        start(controller) {
            controller.enqueue(bytes.slice(0, 1));
            controller.enqueue(bytes.slice(1));
        }
    });
    let completeWrite;
    const writable = new WritableStream({
        write: () => new Promise(resolve => { completeWrite = resolve; })
    });
    let portClosed = false;
    const port = {
        readable,
        writable,
        open: async () => {},
        close: async () => {
            assert.equal(readable.locked, false);
            assert.equal(writable.locked, false);
            portClosed = true;
        }
    };
    override(t, navigator, 'serial', { requestPort: async () => port });
    service.isSupported = true;

    const incoming = new Promise(resolve => service.addEventListener('data', e => resolve(e.detail), { once: true }));
    await service.connect();
    assert.equal(await incoming, '嗨');

    const sending = service.write('test');
    const closing = service.disconnect();
    await nextTurn();
    assert.equal(portClosed, false);
    completeWrite();
    await Promise.all([sending, closing]);
    assert.equal(portClosed, true);
});

test('replacing a running frame processor cancels the first stream', async (t) => {
    let firstCancelled = false;
    const first = mockMedia(t, { cancel: () => { firstCancelled = true; } });
    const service = new StreamProcessorService();
    service.process({}, frame => frame);

    const second = mockMedia(t, {});
    service.process({}, frame => frame);
    await nextTurn();

    assert.equal(firstCancelled, true);
    assert.equal(first.readable.locked, false);
    assert.equal(second.readable.locked, true);
    await service.stop();
    assert.equal(second.readable.locked, false);
});

async function mockWebCodecsPage(t, encoder) {
    override(t, globalThis, 'document', { baseURI: 'http://localhost/' });
    override(t, globalThis, 'window', { VideoEncoder: encoder, VideoFrame: class {} });
    override(t, globalThis, 'localStorage', { getItem: () => null });
    override(t, globalThis, 'HTMLElement', class {});
    override(t, globalThis, 'customElements', { define() {} });
    override(t, globalThis, 'VideoEncoder', encoder);
    override(t, globalThis, 'requestAnimationFrame', () => 1);
    override(t, globalThis, 'cancelAnimationFrame', () => {});
    const { WebCodecsPage } = await import('../components/pages/lab/WebCodecsPage.js');
    const page = new WebCodecsPage();
    page.updateCanvasSize = () => {};
    return page;
}

test('stopping WebCodecs during a support check prevents encoder creation', async (t) => {
    let resolveSupport;
    let queries = 0;
    let encoders = 0;
    const page = await mockWebCodecsPage(t, class {
        static isConfigSupported() {
            queries++;
            return new Promise(resolve => { resolveSupport = resolve; });
        }
        constructor() { encoders++; }
        configure() {}
        close() {}
    });

    const first = page.startRun();
    const second = page.startRun();
    assert.equal(queries, 1);
    page.stopRun();
    resolveSupport({ supported: true });
    await Promise.all([first, second]);
    assert.equal(encoders, 0);
});

test('stale WebCodecs flush completion cannot stop a newer run', async (t) => {
    let resolveFlush;
    let nextEncoder = 0;
    const closed = [];
    const page = await mockWebCodecsPage(t, class {
        static async isConfigSupported() { return { supported: true }; }
        id = ++nextEncoder;
        configure() {}
        close() { closed.push(this.id); }
        flush() { return new Promise(resolve => { resolveFlush = resolve; }); }
    });
    const { notificationService } = await import('../lib/notification-service.js');
    t.mock.method(notificationService, 'success', () => null);

    await page.startRun();
    const finishing = page.finishRun();
    page.stopRun();
    await page.startRun();
    resolveFlush();
    await finishing;

    assert.deepEqual(closed, [1]);
    page.stopRun();
    assert.deepEqual(closed, [1, 2]);
});
