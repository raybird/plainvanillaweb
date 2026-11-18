import test from 'node:test';
import assert from 'node:assert/strict';
import { WebRTCService } from '../lib/webrtc-service.js';

class FakePeer extends EventTarget {
    iceGatheringState = 'gathering';
    iceConnectionState = 'new';
    gatheringListeners = new Set();
    closed = false;

    addEventListener(type, fn, options) {
        if (type === 'icegatheringstatechange') this.gatheringListeners.add(fn);
        super.addEventListener(type, fn, options);
    }

    removeEventListener(type, fn, options) {
        if (type === 'icegatheringstatechange') this.gatheringListeners.delete(fn);
        super.removeEventListener(type, fn, options);
    }

    createDataChannel() {
        this.channel = { readyState: 'connecting', close() { this.readyState = 'closed'; } };
        return this.channel;
    }

    async createOffer() { return { type: 'offer', sdp: 'test' }; }

    async setLocalDescription(offer) { this.localDescription = offer; }

    close() { this.closed = true; }
}

function override(t, object, key, value) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { value, configurable: true });
    t.after(() => descriptor ? Object.defineProperty(object, key, descriptor) : delete object[key]);
}

function mockPeer(t) {
    override(t, globalThis, 'window', { RTCPeerConnection: FakePeer });
    override(t, globalThis, 'RTCPeerConnection', FakePeer);
    return new WebRTCService();
}

test('ICE gathering timeout removes its event listener', async t => {
    const service = mockPeer(t);
    const peer = service.init();
    await service._waitForIceGathering(1);
    assert.equal(peer.gatheringListeners.size, 0);
});

test('close cancels ICE collection and old callbacks cannot affect a new peer', async t => {
    const service = mockPeer(t);
    let connections = 0;
    let candidateEvents = 0;
    service.addEventListener('channel-open', () => connections++);
    service.addEventListener('ice-candidate', () => candidateEvents++);
    const offer = service.createOffer();
    const result = assert.rejects(offer, { name: 'AbortError' });
    result.catch(() => {});
    await new Promise(resolve => setImmediate(resolve));

    const peer = service.pc;
    const oldOpen = peer.channel.onopen;
    const oldCandidate = peer.onicecandidate;
    assert.equal(peer.gatheringListeners.size, 1);
    service.close();
    const replacement = service.init();
    await result;

    assert.equal(peer.closed, true);
    assert.equal(peer.channel.readyState, 'closed');
    assert.equal(peer.gatheringListeners.size, 0);
    assert.notEqual(replacement, peer);
    oldOpen();
    oldCandidate({ candidate: {} });
    assert.equal(connections, 0);
    assert.equal(candidateEvents, 0);
});

test('leaving the WebRTC lab closes its peer and drops a pending offer', async t => {
    const peers = [];
    class PagePeer extends FakePeer {
        constructor() { super(); peers.push(this); }
    }
    mockPeer(t);
    override(t, window, 'RTCPeerConnection', PagePeer);
    override(t, globalThis, 'RTCPeerConnection', PagePeer);
    override(t, globalThis, 'document', { baseURI: 'http://localhost/' });
    override(t, globalThis, 'localStorage', { getItem: () => null });
    override(t, globalThis, 'HTMLElement', class {});
    override(t, globalThis, 'customElements', { define() {} });
    override(t, globalThis, 'requestAnimationFrame', () => 1);
    const { WebRTCPage } = await import('../components/pages/lab/WebRTCPage.js');
    const { notificationService } = await import('../lib/notification-service.js');
    t.mock.method(notificationService, 'info', () => null);
    t.mock.method(notificationService, 'success', () => null);
    t.mock.method(notificationService, 'error', () => null);

    const page = new WebRTCPage();
    const pending = page.startAsCallerStep1();
    await new Promise(resolve => setImmediate(resolve));
    const first = peers.at(-1);
    page.disconnectedCallback();
    assert.equal(first.closed, true);
    await pending;
    assert.equal(page.state.localSdp, '');
    assert.equal(notificationService.success.mock.callCount(), 0);
    assert.equal(notificationService.error.mock.callCount(), 0);
});

test('send reports whether the open channel accepted the message', t => {
    const service = mockPeer(t);
    assert.equal(service.send('尚未連線'), false);

    const sent = [];
    service.dataChannel = { readyState: 'open', send: data => sent.push(data) };
    assert.equal(service.send({ message: '你好' }), true);
    assert.deepEqual(sent, ['{"message":"你好"}']);
});
