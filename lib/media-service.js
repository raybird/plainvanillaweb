import { BaseService } from './base-service.js';

/**
 * MediaService - 原生媒體擷取與錄製服務
 * 封裝 getDisplayMedia 與 MediaRecorder，實現螢幕錄影功能。
 */
export class MediaService extends BaseService {
    constructor() {
        super();
        this.stream = null;
        this.recorder = null;
        this.chunks = [];
        this.isRecording = false;
    }

    /**
     * 啟動螢幕分享
     * @param {object} options 視訊配置
     */
    async startScreenCapture(options = { video: true, audio: false }) {
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia(options);
            
            // 監聽使用者透過瀏覽器 UI 停止分享
            this.stream.getVideoTracks()[0].onended = () => {
                this.stop();
            };

            this.emit('stream-started', { stream: this.stream });
            return this.stream;
        } catch (err) {
            console.error('[MediaService] Capture Error:', err);
            throw err;
        }
    }

    /**
     * 開始錄製當前串流
     */
    startRecording() {
        if (!this.stream) throw new Error('沒有可錄製的媒體串流');
        
        this.chunks = [];
        this.recorder = new MediaRecorder(this.stream, { mimeType: 'video/webm;codecs=vp9' });

        this.recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };

        this.recorder.onstop = () => {
            const blob = new Blob(this.chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            this.emit('recording-finished', { blob, url });
            this.chunks = [];
        };

        this.recorder.start();
        this.isRecording = true;
        this.emit('recording-started');
    }

    /**
     * 停止錄製與分享
     */
    stop() {
        if (this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.stop();
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.isRecording = false;
        this.emit('stream-stopped');
    }
}

export const mediaService = new MediaService();
