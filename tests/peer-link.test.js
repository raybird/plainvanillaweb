/**
 * 主機端 HostLinks 的連線釋放（#16 審查 2 S8、審查 3 N20）：裝置的信令斷線不拆已開啟的直連；
 * hub 的連線關閉時只釋放該 peer 目前的 PeerConnection，不誤關同一個 peer 重新握手後的新連線。
 * WebRTC 本身由瀏覽器測試涵蓋，這裡以假的信令與 PeerConnection 測判斷。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostLinks } from '../components/pages/solutions/pos-v2/peer-link.js';

function fakeSignaling() {
    const handlers = new Map();
    return {
        iceServers: [],
        on(type, cb) {
            handlers.set(type, cb);
            return () => handlers.delete(type);
        },
        fire(type, detail) {
            handlers.get(type)?.(detail);
        },
        sendSignal() {},
    };
}

function fakeLink({ open, channel = null }) {
    const pc = { closed: false, close() { this.closed = true; } };
    return { pc, candidates: null, open, channel };
}

test('peer-left：只放棄還在握手的連線，已開啟的直連保留', () => {
    const signaling = fakeSignaling();
    const links = new HostLinks({ signaling, RTCPeerConnectionImpl: class {} });
    const handshaking = fakeLink({ open: false });
    const opened = fakeLink({ open: true, channel: {} });
    links._links.set('p1', handshaking);
    links._links.set('p2', opened);
    signaling.fire('peer-left', { peerId: 'p1' });
    signaling.fire('peer-left', { peerId: 'p2' });
    assert.equal(handshaking.pc.closed, true);
    assert.equal(opened.pc.closed, false);
    assert.deepEqual([...links._links.keys()], ['p2']);
    links.dispose();
});

test('closeChannel：只在這條 DataChannel 仍是該 peer 目前的連線時才關', () => {
    const links = new HostLinks({ signaling: fakeSignaling(), RTCPeerConnectionImpl: class {} });
    const oldChannel = {};
    const current = fakeLink({ open: true, channel: {} });
    links._links.set('p1', current);
    links.closeChannel('p1', oldChannel);
    assert.equal(current.pc.closed, false, '舊通道晚到的關閉不應關掉新的連線');
    links.closeChannel('p1', current.channel);
    assert.equal(current.pc.closed, true);
    assert.equal(links.size, 0);
    links.closeChannel('missing', {});
    links.dispose();
});
