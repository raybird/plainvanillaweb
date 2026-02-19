import { html } from '../../../lib/html.js';
import { BaseComponent } from '../../../lib/base-component.js';
import { mediaService } from '../../../lib/media-service.js';
import { streamProcessorService } from '../../../lib/stream-processor-service.js';
import { notificationService } from '../../../lib/notification-service.js';

export class MediaPage extends BaseComponent {
    constructor() {
        super();
        this.initReactiveState({
            isRecordingScreen: false,
            recordedVideoUrl: null,
            isProcessingStream: false,
            currentFilter: 'none'
        });
    }

    async toggleLiveFilter() {
        if (this.state.isProcessingStream) {
            this.stopLiveStream();
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoTrack = stream.getVideoTracks()[0];
            const transformer = streamProcessorService.createCanvasTransformer(this.state.currentFilter);
            const processedStream = streamProcessorService.process(videoTrack, transformer);
            const videoEl = this.querySelector('#processedVideo');
            if (videoEl) {
                videoEl.srcObject = processedStream;
                await videoEl.play();
            }
            this.state.isProcessingStream = true;
        } catch (err) {
            notificationService.error(err.message);
        }
    }

    stopLiveStream() {
        streamProcessorService.stop();
        this.state.isProcessingStream = false;
    }

    render() {
        return html`
            <div class="lab-card">
                <h3>📹 即時串流與濾鏡</h3>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="this.closest('page-lab-media').toggleLiveFilter()">
                        ${this.state.isProcessingStream ? '⏹️ 停止' : '📹 啟動處理器'}
                    </button>
                </div>
                <video id="processedVideo" autoplay playsinline muted style="width: 100%; margin-top: 1rem; border-radius: 8px; background: #000;"></video>
            </div>
            <a href="#/lab" class="btn btn-secondary" style="margin-top: 2rem;">⬅️ 回實驗室首頁</a>
        `;
    }
}
customElements.define('page-lab-media', MediaPage);
