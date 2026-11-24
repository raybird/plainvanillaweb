import { BaseService } from './base-service.js';

/**
 * WebRTCService - 原生 P2P 通訊服務
 * 封裝 WebRTC DataChannel，實作無伺服器數據交換。
 */
export class WebRTCService extends BaseService {
    constructor() {
        super();
        this.pc = null;
        this.dataChannel = null;
        this._connection = null;
        // 擴充 STUN 列表以提升連線成功率
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        };
    }

    /**
     * 初始化 PeerConnection
     */
    init() {
        if (this.pc) return this.pc;

        // 環境檢查：WebRTC 要求 HTTPS 或 localhost
        if (!window.RTCPeerConnection) {
            console.warn('[WebRTC] 您的瀏覽器不支援 WebRTC 或目前處於非安全上下文 (需 HTTPS)。');
            return null;
        }

        try {
            const pc = new RTCPeerConnection(this.config);
            this.pc = pc;
            this._connection = new AbortController();

            pc.onicecandidate = (event) => {
                if (this.pc === pc && event.candidate) {
                    this.emit('ice-candidate', event.candidate);
                }
            };

            pc.oniceconnectionstatechange = () => {
                if (this.pc !== pc) return;
                this.emit('state-change', pc.iceConnectionState);
            };

            return pc;
        } catch (err) {
            console.error('[WebRTC] Init Failed:', err);
            throw err;
        }
    }

    /**
     * 等待 ICE Candidate 收集完成
     * @param {number} timeout 超時時間 (ms)
     */
    async _waitForIceGathering(timeout = 2000) {
        const pc = this.pc;
        const { signal } = this._connection;
        if (pc.iceGatheringState === 'complete') return;

        return new Promise((resolve, reject) => {
            const finish = () => {
                clearTimeout(timer);
                signal.removeEventListener('abort', finish);
                pc.removeEventListener('icegatheringstatechange', checkState);
                if (signal.aborted) reject(signal.reason);
                else resolve();
            };
            const checkState = () => {
                if (pc.iceGatheringState === 'complete') finish();
            };
            const timer = setTimeout(finish, timeout);
            signal.addEventListener('abort', finish, { once: true });
            pc.addEventListener('icegatheringstatechange', checkState);
        });
    }

    /**
     * 作為發起者 (Caller) 建立 Offer
     * @returns {Promise<RTCSessionDescription>} 包含 ICE 的完整 SDP
     */
    async createOffer() {
        const pc = this.init();
        if (!pc) throw new Error('此瀏覽器不支援 WebRTC');
        const { signal } = this._connection;

        this._setupDataChannel(pc.createDataChannel('vanilla-chat'));
        const offer = await pc.createOffer();
        signal.throwIfAborted();
        await pc.setLocalDescription(offer);
        signal.throwIfAborted();
        await this._waitForIceGathering();
        signal.throwIfAborted();

        return pc.localDescription;
    }

    /**
     * 作為接收者 (Answerer) 處理 Offer 並建立 Answer
     * @returns {Promise<RTCSessionDescription>} 包含 ICE 的完整 SDP
     */
    async createAnswer(offerSdp) {
        const pc = this.init();
        if (!pc) throw new Error('此瀏覽器不支援 WebRTC');
        const { signal } = this._connection;

        pc.ondatachannel = ({ channel }) => {
            if (this.pc === pc) this._setupDataChannel(channel);
            else channel.close();
        };

        await pc.setRemoteDescription(offerSdp);
        signal.throwIfAborted();
        const answer = await pc.createAnswer();
        signal.throwIfAborted();
        await pc.setLocalDescription(answer);
        signal.throwIfAborted();
        await this._waitForIceGathering();
        signal.throwIfAborted();

        return pc.localDescription;
    }

    async setAnswer(answerSdp) {
        const pc = this.pc;
        if (!pc) throw new Error('PeerConnection 未初始化');
        const { signal } = this._connection;
        await pc.setRemoteDescription(answerSdp);
        signal.throwIfAborted();
    }

    close() {
        const pc = this.pc;
        this.pc = null;
        this._connection?.abort();
        this._connection = null;
        this._closeDataChannel();
        if (!pc) return;
        pc.onicecandidate = null;
        pc.oniceconnectionstatechange = null;
        pc.ondatachannel = null;
        pc.close();
    }

    /**
     * 發送數據
     */
    send(data) {
        const channel = this.dataChannel;
        if (channel?.readyState !== 'open') return false;
        try {
            channel.send(typeof data === 'string' ? data : JSON.stringify(data));
            return true;
        } catch (err) {
            console.error('[WebRTC] Send Error:', err);
            return false;
        }
    }

    _closeDataChannel() {
        const channel = this.dataChannel;
        this.dataChannel = null;
        if (!channel) return;
        channel.onopen = null;
        channel.onclose = null;
        channel.onmessage = null;
        channel.onerror = null;
        channel.close();
    }

    _setupDataChannel(channel) {
        this._closeDataChannel();
        this.dataChannel = channel;
        channel.onopen = () => {
            if (this.dataChannel === channel) this.emit('channel-open');
        };
        channel.onclose = () => {
            if (this.dataChannel === channel) this.emit('channel-close');
        };
        channel.onmessage = event => {
            if (this.dataChannel === channel) this.emit('message', event.data);
        };
        channel.onerror = err => {
            if (this.dataChannel === channel) console.error('[WebRTC] Channel Error:', err);
        };
    }

    /**
     * 獲取本地描述
     */
    getLocalDescription() {
        return this.pc ? this.pc.localDescription : null;
    }
}

export const webrtcService = new WebRTCService();
