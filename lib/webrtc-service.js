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
        if (this.pc) return this.pc; // 避免重複初始化

        try {
            this.pc = new RTCPeerConnection(this.config);

            this.pc.onicecandidate = (event) => {
                if (event.candidate) {
                    this.emit('ice-candidate', event.candidate);
                }
            };

            this.pc.oniceconnectionstatechange = () => {
                console.log('[WebRTC] Connection State:', this.pc.iceConnectionState);
                this.emit('state-change', this.pc.iceConnectionState);
            };

            return this.pc;
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
        if (this.pc.iceGatheringState === 'complete') return;

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                resolve();
            }, timeout);

            const checkState = () => {
                if (this.pc.iceGatheringState === 'complete') {
                    this.pc.removeEventListener('icegatheringstatechange', checkState);
                    clearTimeout(timer);
                    resolve();
                }
            };
            this.pc.addEventListener('icegatheringstatechange', checkState);
        });
    }

    /**
     * 作為發起者 (Caller) 建立 Offer
     * @returns {Promise<RTCSessionDescription>} 包含 ICE 的完整 SDP
     */
    async createOffer() {
        try {
            this.init();
            this.dataChannel = this.pc.createDataChannel('vanilla-chat');
            this._setupDataChannel();

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            
            // 等待 ICE 收集，確保 SDP 包含候選人
            await this._waitForIceGathering();
            
            return this.pc.localDescription;
        } catch (err) {
            console.error('[WebRTC] Create Offer Error:', err);
            throw err;
        }
    }

    /**
     * 作為接收者 (Answerer) 處理 Offer 並建立 Answer
     * @returns {Promise<RTCSessionDescription>} 包含 ICE 的完整 SDP
     */
    async createAnswer(offerSdp) {
        try {
            this.init();
            this.pc.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this._setupDataChannel();
            };

            await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);

            // 等待 ICE 收集
            await this._waitForIceGathering();

            return this.pc.localDescription;
        } catch (err) {
            console.error('[WebRTC] Create Answer Error:', err);
            throw err;
        }
    }

    /**
     * 設置 Answer SDP
     */
    async setAnswer(answerSdp) {
        try {
            if (!this.pc) throw new Error('PeerConnection 未初始化');
            await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
        } catch (err) {
            console.error('[WebRTC] Set Answer Error:', err);
            throw err;
        }
    }

    /**
     * 發送數據
     */
    send(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try {
                this.dataChannel.send(typeof data === 'string' ? data : JSON.stringify(data));
            } catch (err) {
                console.error('[WebRTC] Send Error:', err);
            }
        } else {
            console.warn('[WebRTC] Channel not open');
        }
    }

    _setupDataChannel() {
        if (!this.dataChannel) return;
        
        this.dataChannel.onopen = () => {
            console.log('[WebRTC] Data Channel Open');
            this.emit('channel-open');
        };
        this.dataChannel.onclose = () => {
            console.log('[WebRTC] Data Channel Closed');
            this.emit('channel-close');
        };
        this.dataChannel.onmessage = (event) => this.emit('message', event.data);
        this.dataChannel.onerror = (err) => console.error('[WebRTC] Channel Error:', err);
    }

    /**
     * 獲取本地描述
     */
    getLocalDescription() {
        return this.pc ? this.pc.localDescription : null;
    }
}

export const webrtcService = new WebRTCService();
