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
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    /**
     * 初始化 PeerConnection
     */
    init() {
        this.pc = new RTCPeerConnection(this.config);

        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.emit('ice-candidate', event.candidate);
            }
        };

        this.pc.onconnectionstatechange = () => {
            this.emit('state-change', this.pc.connectionState);
        };

        return this.pc;
    }

    /**
     * 作為發起者 (Caller) 建立 Offer
     */
    async createOffer() {
        this.init();
        this.dataChannel = this.pc.createDataChannel('vanilla-chat');
        this._setupDataChannel();

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        return offer;
    }

    /**
     * 作為接收者 (Answerer) 處理 Offer 並建立 Answer
     */
    async createAnswer(offerSdp) {
        this.init();
        this.pc.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this._setupDataChannel();
        };

        await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        return answer;
    }

    /**
     * 設置 Answer SDP
     */
    async setAnswer(answerSdp) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
    }

    /**
     * 加入 Ice Candidate
     */
    async addIceCandidate(candidate) {
        if (this.pc) {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }

    /**
     * 發送數據
     */
    send(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(typeof data === 'string' ? data : JSON.stringify(data));
        }
    }

    _setupDataChannel() {
        this.dataChannel.onopen = () => this.emit('channel-open');
        this.dataChannel.onclose = () => this.emit('channel-close');
        this.dataChannel.onmessage = (event) => this.emit('message', event.data);
    }

    /**
     * 獲取本地描述 (包含已收集的 Ice)
     */
    getLocalDescription() {
        return this.pc ? this.pc.localDescription : null;
    }
}

export const webrtcService = new WebRTCService();
