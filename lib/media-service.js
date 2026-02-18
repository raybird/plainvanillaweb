import { BaseService } from './base-service.js';

/**
 * MediaService - 原生多媒體與螢幕錄製服務
 * 封裝 Screen Capture API 與 MediaRecorder，實現螢幕分享與錄影。
 */
export class MediaService extends BaseService {
    constructor() {
        super();
        this.stream = null;
        this.recorder = null;
        this.chunks = [];
    }

    /**
     * 啟動螢幕分享
     * @returns {Promise<MediaStream>}
     */
    async startScreenShare() {
        try {
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: "always" },
                audio: false
            });
            
            // 監聽串流結束（使用者點擊停止分享）
            this.stream.getVideoTracks()[0].onended = () => {
                this.stopRecording();
                this.emit('stream-ended');
            };

            this.emit('stream-started', { stream: this.stream });
            return this.stream;
        } catch (err) {
            console.error('[MediaService] Share Error:', err);
            throw err;
        }
    }

    /**
     * 開始錄製
     */
    startRecording(stream = this.stream) {
        if (!stream) throw new Error('沒有可錄製的串流');
        
        this.chunks = [];
        this.recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

        this.recorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.chunks.push(e.data);
        };

        this.recorder.onstop = () => {
            const blob = new Blob(this.chunks, { type: 'video/webm' });
            this.emit('recording-stopped', { blob });
            this.chunks = [];
        };

        this.recorder.start();
        this.emit('recording-started');
    }

    /**
     * 停止錄製與分享
     */
    stopRecording() {
        if (this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.stop();
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    /**
     * 下載錄製的影片
     * @param {Blob} blob 
     * @param {string} filename 
     */
    downloadVideo(blob, filename = 'screen-recording.webm') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    }
}

export const mediaService = new MediaService();
